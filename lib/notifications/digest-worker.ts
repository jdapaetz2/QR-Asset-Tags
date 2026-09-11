/**
 * Engineering Phase D3B — the daily return-exceptions summary run. No direct I/O: the database store, the sender, the
 * clock and the loggers are injected, so every branch is testable without waiting for 6 AM.
 *
 * Reconciliation-based, because Vercel cron delivery is best-effort, never retried, may repeat, and may overlap:
 *   1. Only the invocation in the 6 AM `America/Vancouver` hour proceeds (lib/notifications/digest-window.ts).
 *   2. Each organization's window starts at its last SUCCESSFUL summary (sent or quiet) and ends at today's cutoff.
 *   3. The window is claimed in the run ledger before anything is built; a duplicate or overlapping invocation loses
 *      the claim and sends nothing.
 *   4. Quiet → `skipped_quiet`, no provider call. Sent → `sent`. Anything else → `failed`, which never counts as
 *      success, so the next run covers the same returns again — late, never dropped.
 *
 * At-least-once, not exactly-once: if the provider accepted a send that then timed out, the run is recorded as
 * failed and the next day's summary (a different window, so a different idempotency key) lists those returns again.
 * Within one window the provider idempotency key (organization + window end + recipient) absorbs retries.
 */
import { buildReturnDigestEmail, type EmailContent } from "@/lib/notifications/email";
import {
  digestOrigins,
  isDigestMode,
  projectDigestItem,
  sortDigestItems,
  type DigestAsset,
  type DigestItem,
  type DigestMode,
  type DigestOrigin,
  type DigestReturnRow,
} from "@/lib/notifications/digest";
import { digestSlot, digestWindow, type DigestWindow } from "@/lib/notifications/digest-window";
import { notificationIdempotencyKey } from "@/lib/notifications/idempotency";
import { isValidNotificationEmail } from "@/lib/notifications/settings";
import type { DigestRunLogFields, NotificationLogFields } from "@/lib/notifications/log";
import type { SendOptions, SendResult } from "@/lib/notifications/send";

export const DIGEST_ORG_PAGE_SIZE = 100;
export const DIGEST_MAX_ORGANIZATIONS = 5_000;
export const DIGEST_ROW_PAGE_SIZE = 200;
export const DIGEST_MAX_ROWS = 2_000;
export const DIGEST_ASSET_CHUNK = 100;
/** Organizations processed at once. Two keeps well inside the provider's default request rate. */
export const DIGEST_CONCURRENCY = 2;
/** Stop starting organizations after this long; the route's maxDuration is 300 s and a send can take 15 s. */
export const DIGEST_BUDGET_MS = 240_000;

export type DigestOrganization = {
  id: string;
  name: string | null;
  notification_email: string | null;
  return_notification_mode: string | null;
};

export type DigestRunStatus = "sent" | "skipped_quiet" | "failed";

export interface DigestStore {
  /** Active organizations whose return mode is not `off`, ordered by id, after `afterId`. */
  listEligibleOrganizations(afterId: string | null, limit: number): Promise<DigestOrganization[]>;
  /** The latest window_end with status sent or skipped_quiet, or null. */
  lastSuccessfulWindowEnd(organizationId: string): Promise<Date | null>;
  /** The earliest window_start of any run (any status), or null — where a never-successful history resumes. */
  firstRunWindowStart(organizationId: string): Promise<Date | null>;
  /** Insert a `processing` row for the window; null when the window is already claimed. */
  claimRun(input: { organizationId: string; window: DigestWindow }): Promise<string | null>;
  completeRun(
    runId: string,
    result: { status: DigestRunStatus; itemCount: number; providerId?: string | null; failureClass?: string | null }
  ): Promise<void>;
  /** Return checklists of the organization, created in (start, end], of the given origins, oldest first. */
  listReturnRows(input: {
    organizationId: string;
    window: DigestWindow;
    origins: DigestOrigin[];
    offset: number;
    limit: number;
  }): Promise<DigestReturnRow[]>;
  loadAssets(organizationId: string, assetIds: string[]): Promise<DigestAsset[]>;
}

export type DigestSend = (to: string, content: EmailContent, options: SendOptions) => Promise<SendResult>;

export type DigestDeps = {
  store: DigestStore;
  send: DigestSend;
  now: () => Date;
  /** Monotonic milliseconds for the execution budget. */
  elapsedMs?: () => number;
  siteUrl: string;
  replyTo: string;
  log: (fields: NotificationLogFields) => void;
  logRun: (fields: DigestRunLogFields) => void;
  budgetMs?: number;
  concurrency?: number;
  /** Restrict a run to these organizations (fixed operator/staging checks). The cron route never sets it. */
  onlyOrganizationIds?: readonly string[];
};

export type DigestRunResult = DigestRunLogFields;

type OrganizationOutcome = "sent" | "quiet" | "failed" | "skipped";

/** A bounded ledger/log token: lowercase letters, digits and underscores, at most 40 characters. */
export function failureToken(value: string | null | undefined): string {
  const token = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return token || "unknown";
}

async function listOrganizations(store: DigestStore): Promise<{ organizations: DigestOrganization[]; truncated: boolean }> {
  const organizations: DigestOrganization[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await store.listEligibleOrganizations(afterId, DIGEST_ORG_PAGE_SIZE);
    organizations.push(...page);
    if (page.length < DIGEST_ORG_PAGE_SIZE) return { organizations, truncated: false };
    if (organizations.length >= DIGEST_MAX_ORGANIZATIONS) return { organizations, truncated: true };
    afterId = page[page.length - 1].id;
  }
}

async function collectItems(
  deps: DigestDeps,
  organizationId: string,
  mode: DigestMode,
  window: DigestWindow
): Promise<{ items: DigestItem[]; scanIncomplete: boolean }> {
  const origins = digestOrigins(mode);
  const rows: DigestReturnRow[] = [];
  let scanIncomplete = false;
  for (let offset = 0; ; offset += DIGEST_ROW_PAGE_SIZE) {
    const page = await deps.store.listReturnRows({
      organizationId,
      window,
      origins,
      offset,
      limit: DIGEST_ROW_PAGE_SIZE,
    });
    // Defense in depth: the store already scopes by organization and origin; nothing else is ever summarized.
    rows.push(
      ...page.filter(
        (row) =>
          row.organization_id === organizationId &&
          origins.includes(row.submission_origin === "staff" ? "staff" : "public")
      )
    );
    if (page.length < DIGEST_ROW_PAGE_SIZE) break;
    if (offset + page.length >= DIGEST_MAX_ROWS) {
      scanIncomplete = true;
      break;
    }
  }

  const assetIds = [...new Set(rows.map((row) => row.asset_id).filter((id): id is string => typeof id === "string"))];
  const assets = new Map<string, DigestAsset>();
  for (let i = 0; i < assetIds.length; i += DIGEST_ASSET_CHUNK) {
    for (const asset of await deps.store.loadAssets(organizationId, assetIds.slice(i, i + DIGEST_ASSET_CHUNK))) {
      assets.set(asset.id, asset);
    }
  }

  const items = rows
    .map((row) => projectDigestItem(row, row.asset_id ? assets.get(row.asset_id) ?? null : null, deps.siteUrl))
    .filter((item): item is DigestItem => item !== null);
  return { items: sortDigestItems(items), scanIncomplete };
}

async function processOrganization(
  deps: DigestDeps,
  organization: DigestOrganization,
  cutoff: Date,
  pacificDate: string
): Promise<OrganizationOutcome> {
  const base = {
    event: "return_digest" as const,
    organizationId: organization.id,
    reference: pacificDate,
    recipientRoute: "digest" as const,
  };
  const mode = organization.return_notification_mode;
  if (!isDigestMode(mode)) {
    deps.log({ ...base, outcome: "skipped_disabled" });
    return "skipped";
  }
  const recipient = organization.notification_email?.trim() ?? "";
  if (!isValidNotificationEmail(recipient)) {
    deps.log({ ...base, outcome: "skipped_no_recipient" });
    return "skipped";
  }

  let runId: string | null = null;
  let itemCount = 0;
  try {
    const lastSuccess = await deps.store.lastSuccessfulWindowEnd(organization.id);
    const firstAttempt = lastSuccess ? null : await deps.store.firstRunWindowStart(organization.id);
    const window = digestWindow(cutoff, lastSuccess, firstAttempt);
    if (!window) {
      deps.log({ ...base, outcome: "skipped_duplicate", recipient });
      return "skipped";
    }
    runId = await deps.store.claimRun({ organizationId: organization.id, window });
    if (!runId) {
      deps.log({ ...base, outcome: "skipped_duplicate", recipient });
      return "skipped";
    }

    const { items, scanIncomplete } = await collectItems(deps, organization.id, mode, window);
    itemCount = items.length;
    if (items.length === 0) {
      await deps.store.completeRun(runId, { status: "skipped_quiet", itemCount: 0 });
      deps.log({ ...base, outcome: "skipped_quiet", recipient, digestItemCount: 0 });
      return "quiet";
    }

    const content = buildReturnDigestEmail({
      orgName: organization.name ?? "Your organization",
      items,
      windowStart: window.start,
      windowEnd: window.end,
      clamped: window.clamped,
      scanIncomplete,
      inboxUrl: `${deps.siteUrl}/dashboard/submissions?form_type=return_checklist&status=unresolved`,
      settingsUrl: `${deps.siteUrl}/dashboard/settings`,
    });
    const idempotencyKey = notificationIdempotencyKey({
      event: "return_digest",
      reference: `${organization.id}:${window.end.getTime()}`,
      recipient,
    });
    const result = await deps.send(recipient, content, { idempotencyKey, replyTo: deps.replyTo });

    if (result.outcome === "sent") {
      await deps.store.completeRun(runId, {
        status: "sent",
        itemCount,
        providerId: result.providerId ? result.providerId.slice(0, 200) : null,
      });
      deps.log({
        ...base,
        outcome: "sent",
        recipient,
        providerId: result.providerId,
        providerStatus: result.status,
        attempts: result.attempts,
        digestItemCount: itemCount,
      });
      return "sent";
    }

    // Nothing was delivered (dry run or provider failure): record a failure so the cursor does not advance.
    const failureClass =
      result.outcome === "dry_run"
        ? failureToken(`dry_run_${result.reason ?? "unconfigured"}`)
        : failureToken(result.failureClass ?? result.outcome);
    await deps.store.completeRun(runId, { status: "failed", itemCount, failureClass });
    deps.log({
      ...base,
      outcome: result.outcome,
      recipient,
      providerStatus: result.status,
      attempts: result.attempts,
      failureClass,
      reason: result.reason,
      digestItemCount: itemCount,
    });
    return "failed";
  } catch (err) {
    // Isolated: this organization fails, the next still runs. A claimed row is marked failed where possible; if even
    // that fails it stays `processing`, which never counts as success either.
    if (runId) {
      try {
        await deps.store.completeRun(runId, { status: "failed", itemCount, failureClass: "exception" });
      } catch {
        /* leave the row processing */
      }
    }
    deps.log({ ...base, outcome: "failed_transient", recipient, failureClass: "exception", digestItemCount: itemCount });
    void err;
    return "failed";
  }
}

export async function runReturnDigest(deps: DigestDeps): Promise<DigestRunResult> {
  const slot = digestSlot(deps.now());
  const result: DigestRunResult = {
    outcome: "outside_window",
    pacificDate: slot.pacificDate,
    pacificHour: slot.pacificHour,
    organizations: 0,
    sent: 0,
    quiet: 0,
    failed: 0,
    skipped: 0,
  };
  if (!slot.inWindow) {
    deps.logRun(result);
    return result;
  }

  const clock = deps.elapsedMs ?? (() => performance.now());
  const startedAt = clock();
  const budget = deps.budgetMs ?? DIGEST_BUDGET_MS;
  let incomplete = false;

  let organizations: DigestOrganization[] = [];
  try {
    const listed = await listOrganizations(deps.store);
    organizations = listed.organizations;
    incomplete = listed.truncated;
  } catch {
    incomplete = true;
  }
  if (deps.onlyOrganizationIds) {
    const only = new Set(deps.onlyOrganizationIds);
    organizations = organizations.filter((organization) => only.has(organization.id));
  }

  let next = 0;
  const workers = Array.from({ length: Math.max(1, deps.concurrency ?? DIGEST_CONCURRENCY) }, async () => {
    while (next < organizations.length) {
      if (clock() - startedAt > budget) return;
      const organization = organizations[next++];
      result.organizations++;
      const outcome = await processOrganization(deps, organization, slot.cutoff, slot.pacificDate);
      result[outcome]++;
    }
  });
  await Promise.all(workers);
  if (next < organizations.length) incomplete = true;

  result.outcome = incomplete ? "incomplete" : "completed";
  deps.logRun(result);
  return result;
}
