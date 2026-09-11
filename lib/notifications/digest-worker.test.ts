import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DigestAsset, DigestOrigin, DigestReturnRow } from "./digest";
import type { DigestWindow } from "./digest-window";
import {
  DIGEST_MAX_ROWS,
  failureToken,
  runReturnDigest,
  type DigestDeps,
  type DigestOrganization,
  type DigestRunStatus,
  type DigestStore,
} from "./digest-worker";
import { notificationIdempotencyKey } from "./idempotency";
import type { SendResult } from "./send";
import { submissionReference } from "@/lib/submissions/inbox";

// The run is reconciliation-based (Vercel cron is best effort, never retried, may repeat or overlap). An in-memory
// ledger with the same unique (organization, window_end) claim as migration 0036 proves the catch-up rules.

type Run = {
  id: string;
  organizationId: string;
  windowStart: Date;
  windowEnd: Date;
  status: "processing" | DigestRunStatus;
  itemCount: number;
  providerId: string | null;
  failureClass: string | null;
};

class MemoryStore implements DigestStore {
  runs: Run[] = [];
  rows: DigestReturnRow[] = [];
  assets: DigestAsset[] = [];
  originQueries: DigestOrigin[][] = [];
  failRowsFor = new Set<string>();

  constructor(public organizations: DigestOrganization[]) {}

  async listEligibleOrganizations(afterId: string | null, limit: number) {
    return this.organizations
      .filter((o) => o.return_notification_mode !== "off")
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((o) => !afterId || o.id > afterId)
      .slice(0, limit);
  }

  async firstRunWindowStart(organizationId: string) {
    const starts = this.runs.filter((r) => r.organizationId === organizationId).map((r) => r.windowStart.getTime());
    return starts.length ? new Date(Math.min(...starts)) : null;
  }

  async lastSuccessfulWindowEnd(organizationId: string) {
    const ends = this.runs
      .filter((r) => r.organizationId === organizationId && (r.status === "sent" || r.status === "skipped_quiet"))
      .map((r) => r.windowEnd.getTime());
    return ends.length ? new Date(Math.max(...ends)) : null;
  }

  // Synchronous check-and-insert, like a unique constraint: overlapping invocations cannot both win.
  claimRun({ organizationId, window }: { organizationId: string; window: DigestWindow }) {
    const taken = this.runs.some(
      (r) => r.organizationId === organizationId && r.windowEnd.getTime() === window.end.getTime()
    );
    if (taken) return Promise.resolve(null);
    const id = `run-${this.runs.length + 1}`;
    this.runs.push({
      id,
      organizationId,
      windowStart: window.start,
      windowEnd: window.end,
      status: "processing",
      itemCount: 0,
      providerId: null,
      failureClass: null,
    });
    return Promise.resolve(id);
  }

  async completeRun(
    runId: string,
    result: { status: DigestRunStatus; itemCount: number; providerId?: string | null; failureClass?: string | null }
  ) {
    const run = this.runs.find((r) => r.id === runId && r.status === "processing");
    if (!run) return;
    Object.assign(run, {
      status: result.status,
      itemCount: result.itemCount,
      providerId: result.providerId ?? null,
      failureClass: result.failureClass ?? null,
    });
  }

  async listReturnRows(input: {
    organizationId: string;
    window: DigestWindow;
    origins: DigestOrigin[];
    offset: number;
    limit: number;
  }) {
    this.originQueries.push(input.origins);
    if (this.failRowsFor.has(input.organizationId)) throw new Error("connection reset");
    return this.rows
      .filter(
        (r) =>
          r.organization_id === input.organizationId &&
          input.origins.includes(r.submission_origin === "staff" ? "staff" : "public") &&
          Date.parse(r.created_at) > input.window.start.getTime() &&
          Date.parse(r.created_at) <= input.window.end.getTime()
      )
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(input.offset, input.offset + input.limit);
  }

  async loadAssets(organizationId: string, ids: string[]) {
    return this.assets.filter((a) => ids.includes(a.id));
  }
}

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const DAY1 = new Date("2026-07-15T13:20:00.000Z"); // 6:20 AM PDT
const DAY1_CUTOFF = new Date("2026-07-15T13:00:00.000Z");
const DAY2 = new Date("2026-07-16T13:20:00.000Z");
const DAY3 = new Date("2026-07-17T13:20:00.000Z");
const V1_DAMAGE = { damage_observed: "yes", accessories_returned: "yes" };
const V1_CLEAN = { damage_observed: "no", accessories_returned: "yes" };

let seq = 0;
function returnRow(
  organizationId: string,
  createdAt: string,
  data: unknown = V1_DAMAGE,
  origin: "public" | "staff" = "public"
): DigestReturnRow {
  seq++;
  return {
    // The first 6 hex characters form the SUB- reference, so they must differ per row.
    id: `${String(seq).padStart(6, "0")}00-0000-4000-8000-000000000000`,
    organization_id: organizationId,
    created_at: createdAt,
    status: "new",
    submission_origin: origin,
    asset_id: "asset-1",
    submission_data_json: data,
    media_urls: [],
  };
}

function org(id: string, overrides: Partial<DigestOrganization> = {}): DigestOrganization {
  return {
    id,
    name: `Org ${id.slice(0, 4)}`,
    notification_email: `ops@${id.slice(0, 4)}.test`,
    return_notification_mode: "daily_exceptions",
    ...overrides,
  };
}

const sendMock = vi.fn(async (..._args: [string, { subject: string; text: string; html: string }, { idempotencyKey?: string }]) => {
  return { outcome: "sent", attempts: 1, providerId: "resend-ok", status: 200 } as SendResult;
});
const logMock = vi.fn();
const logRunMock = vi.fn();

function deps(store: MemoryStore, now: Date, overrides: Partial<DigestDeps> = {}): DigestDeps {
  return {
    store,
    send: sendMock,
    now: () => now,
    elapsedMs: () => 0,
    siteUrl: "https://mulemark.io",
    replyTo: "support@mulemark.io",
    log: logMock,
    logRun: logRunMock,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockImplementation(async () => ({ outcome: "sent", attempts: 1, providerId: "resend-ok", status: 200 }));
});

describe("the Pacific-hour guard", () => {
  it("outside the 6 AM hour does nothing and logs one bounded line", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    const spy = vi.spyOn(store, "listEligibleOrganizations");
    const result = await runReturnDigest(deps(store, new Date("2026-07-15T14:20:00.000Z")));
    expect(result).toMatchObject({ outcome: "outside_window", pacificHour: 7, organizations: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(logRunMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "outside_window" }));
  });
});

describe("one organization's run", () => {
  it("quiet day: no email, recorded as skipped_quiet so the cursor advances", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z", V1_CLEAN)];
    const result = await runReturnDigest(deps(store, DAY1));
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.runs).toEqual([expect.objectContaining({ status: "skipped_quiet", itemCount: 0 })]);
    expect(result).toMatchObject({ outcome: "completed", quiet: 1, sent: 0 });
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "return_digest", outcome: "skipped_quiet", recipientRoute: "digest", digestItemCount: 0 })
    );
  });

  it("sends one summary to the general address with a key bound to organization, window end and recipient", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    const exception = returnRow(ORG_A, "2026-07-15T02:00:00.000Z");
    store.rows = [exception, returnRow(ORG_A, "2026-07-15T03:00:00.000Z", V1_CLEAN)];
    await runReturnDigest(deps(store, DAY1));
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [to, content, options] = sendMock.mock.calls[0];
    expect(to).toBe(`ops@${ORG_A.slice(0, 4)}.test`);
    expect(options.idempotencyKey).toBe(
      notificationIdempotencyKey({ event: "return_digest", reference: `${ORG_A}:${DAY1_CUTOFF.getTime()}`, recipient: to })
    );
    expect(content.subject).toBe("Return exceptions summary - 1 return with exceptions");
    expect(content.text).toContain(submissionReference(exception.id, exception.created_at));
    expect(store.runs).toEqual([expect.objectContaining({ status: "sent", itemCount: 1, providerId: "resend-ok" })]);
  });

  it("instant_renter summarizes staff returns only; daily_exceptions includes renter returns too", async () => {
    const renter = returnRow(ORG_A, "2026-07-15T02:00:00.000Z", V1_DAMAGE, "public");
    const staff = returnRow(ORG_A, "2026-07-15T03:00:00.000Z", V1_DAMAGE, "staff");

    const instant = new MemoryStore([org(ORG_A, { return_notification_mode: "instant_renter" })]);
    instant.rows = [renter, staff];
    await runReturnDigest(deps(instant, DAY1));
    expect(instant.originQueries[0]).toEqual(["staff"]);
    let text = sendMock.mock.calls[0][1].text;
    expect(text).toContain(submissionReference(staff.id, staff.created_at));
    expect(text).not.toContain(submissionReference(renter.id, renter.created_at));
    expect(text).toContain("Staff return");

    sendMock.mockClear();
    const daily = new MemoryStore([org(ORG_A)]);
    daily.rows = [renter, staff];
    await runReturnDigest(deps(daily, DAY1));
    text = sendMock.mock.calls[0][1].text;
    expect(text).toContain(submissionReference(staff.id, staff.created_at));
    expect(text).toContain(submissionReference(renter.id, renter.created_at));
  });

  it("an organization without a usable address is skipped without claiming a window", async () => {
    const store = new MemoryStore([org(ORG_A, { notification_email: "not-an-address" })]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z")];
    const result = await runReturnDigest(deps(store, DAY1));
    expect(store.runs).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_no_recipient" }));
  });

  it("an `off` organization is never processed", async () => {
    const store = new MemoryStore([org(ORG_A, { return_notification_mode: "off" })]);
    const result = await runReturnDigest(deps(store, DAY1));
    expect(result.organizations).toBe(0);
    expect(store.runs).toEqual([]);
  });

  it("never lists another organization's row even if a store returned one", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    const foreign = returnRow(ORG_B, "2026-07-15T02:00:00.000Z");
    vi.spyOn(store, "listReturnRows").mockResolvedValueOnce([foreign]);
    await runReturnDigest(deps(store, DAY1));
    expect(sendMock).not.toHaveBeenCalled();
    expect(store.runs[0].status).toBe("skipped_quiet");
  });
});

describe("duplicates, failures and catch-up", () => {
  it("a duplicate invocation of the same slot sends nothing more", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z")];
    await runReturnDigest(deps(store, DAY1));
    const second = await runReturnDigest(deps(store, new Date("2026-07-15T13:55:00.000Z")));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "skipped_duplicate" }));
  });

  it("overlapping invocations race for the claim and exactly one sends", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z")];
    await Promise.all([runReturnDigest(deps(store, DAY1)), runReturnDigest(deps(store, DAY1))]);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(store.runs).toHaveLength(1);
  });

  it("a provider failure is recorded as failed and the next run retries the same returns", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    const day1Row = returnRow(ORG_A, "2026-07-15T02:00:00.000Z");
    store.rows = [day1Row];
    sendMock.mockResolvedValueOnce({ outcome: "failed_transient", attempts: 3, failureClass: "http_503", status: 503 });
    const failed = await runReturnDigest(deps(store, DAY1));
    expect(failed.failed).toBe(1);
    expect(store.runs[0]).toMatchObject({ status: "failed", failureClass: "http_503" });
    expect(await store.lastSuccessfulWindowEnd(ORG_A)).toBeNull();

    const day2Row = returnRow(ORG_A, "2026-07-16T02:00:00.000Z");
    store.rows.push(day2Row);
    await runReturnDigest(deps(store, DAY2));
    const retry = sendMock.mock.calls[1][1].text;
    expect(retry).toContain(submissionReference(day1Row.id, day1Row.created_at));
    expect(retry).toContain(submissionReference(day2Row.id, day2Row.created_at));
    expect(store.runs[1]).toMatchObject({ status: "sent", itemCount: 2 });
  });

  it("a missed day is caught up by the next run", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z")];
    await runReturnDigest(deps(store, DAY1));
    const missed = returnRow(ORG_A, "2026-07-16T02:00:00.000Z");
    const later = returnRow(ORG_A, "2026-07-17T02:00:00.000Z");
    store.rows.push(missed, later);
    // No invocation on DAY2 (best-effort delivery). DAY3 covers everything since DAY1's cutoff.
    await runReturnDigest(deps(store, DAY3));
    const text = sendMock.mock.calls[1][1].text;
    expect(text).toContain(submissionReference(missed.id, missed.created_at));
    expect(text).toContain(submissionReference(later.id, later.created_at));
    expect(store.runs[1].windowStart.toISOString()).toBe(DAY1_CUTOFF.toISOString());
  });

  it("a dry run delivered nothing, so it is recorded as failed", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z")];
    sendMock.mockResolvedValueOnce({ outcome: "dry_run", attempts: 0, reason: "unconfigured" });
    await runReturnDigest(deps(store, DAY1));
    expect(store.runs[0]).toMatchObject({ status: "failed", failureClass: "dry_run_unconfigured" });
  });

  it("one organization's failure does not stop the next", async () => {
    const store = new MemoryStore([org(ORG_A), org(ORG_B)]);
    store.rows = [returnRow(ORG_A, "2026-07-15T02:00:00.000Z"), returnRow(ORG_B, "2026-07-15T02:00:00.000Z")];
    store.failRowsFor.add(ORG_A);
    const result = await runReturnDigest(deps(store, DAY1, { concurrency: 1 }));
    expect(result).toMatchObject({ outcome: "completed", failed: 1, sent: 1 });
    expect(store.runs.find((r) => r.organizationId === ORG_A)).toMatchObject({ status: "failed", failureClass: "exception" });
  });

  it("an exhausted budget reports incomplete instead of a silent success", async () => {
    const store = new MemoryStore([org(ORG_A), org(ORG_B)]);
    let ms = 0;
    const result = await runReturnDigest(
      deps(store, DAY1, { concurrency: 1, budgetMs: 10, elapsedMs: () => (ms += 20) })
    );
    expect(result.outcome).toBe("incomplete");
    expect(result.organizations).toBeLessThan(2);
    expect(logRunMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: "incomplete" }));
  });

  it("an unreadable organization list is incomplete, not completed", async () => {
    const store = new MemoryStore([org(ORG_A)]);
    vi.spyOn(store, "listEligibleOrganizations").mockRejectedValueOnce(new Error("down"));
    expect((await runReturnDigest(deps(store, DAY1))).outcome).toBe("incomplete");
  });

  it(`marks a scan that hit the ${DIGEST_MAX_ROWS}-row ceiling as partial`, async () => {
    const store = new MemoryStore([org(ORG_A)]);
    store.rows = Array.from({ length: DIGEST_MAX_ROWS + 5 }, (_, i) =>
      returnRow(ORG_A, new Date(Date.parse("2026-07-14T14:00:00.000Z") + i * 1000).toISOString())
    );
    await runReturnDigest(deps(store, DAY1));
    const text = sendMock.mock.calls[0][1].text;
    expect(text).toContain("complete list is in Submissions");
    expect(store.runs[0].itemCount).toBe(DIGEST_MAX_ROWS);
  });
});

describe("failureToken", () => {
  it("keeps ledger failure classes bounded", () => {
    expect(failureToken("http_503")).toBe("http_503");
    expect(failureToken("Dry Run / Preview!")).toBe("dry_run_preview");
    expect(failureToken(null)).toBe("unknown");
    expect(failureToken("x".repeat(80))).toHaveLength(40);
  });
});
