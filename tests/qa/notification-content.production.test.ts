import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildIncidentEmail,
  PREVIEW_POINTER,
  SELECTIONS_NOTE,
  SUBJECT_MAX_LENGTH,
  type IncidentPreviews,
} from "@/lib/notifications/email";
import { PRIORITY_LABELS, SUBJECT_PREFIXES, type NotificationPriority } from "@/lib/notifications/priority";
import {
  projectSubmissionBrief,
  SAVED_SUBMISSION_COLUMNS,
  type NotificationBrief,
  type SavedSubmissionRow,
} from "@/lib/notifications/projection";
import { previewRequestCount, resolveSubmissionRecipients } from "@/lib/notifications/routing";
import { readNotificationSettings, type SubmissionFormType } from "@/lib/notifications/settings";

/**
 * Engineering Phase D5 — Production notification CONTENT check (`npm run production:qa-notification-content`, env from
 * `.env.local`). Read-only.
 *
 * For every submission the live QA matrix (scripts/production/qa-notification-matrix.mjs) created, this loads the SAVED
 * row and asset from the Production QA organization and renders them with the real projection, routing and email
 * builders, using the notification settings the matrix applied at submit time. It proves the content rules (subject,
 * first line, priority, reported labels, description, return exceptions, contact links, primary link, reference,
 * photo count, preview structure, text/plain parity, reason line, no storage path, size) against real saved data.
 *
 * It does not re-download photos: preview attachment counts and provider outcomes come from the runtime logs. The
 * preview STRUCTURE (one `cid:` per requested preview, the preview count line) is checked with placeholder figures.
 */

const PRODUCTION_REF = "apeiswnkheiwrpvumder";
const QA_ORG_ID = "c0000000-0000-4000-8000-00000000c0a1";
const QA_ASSET_CODE = "PROD-QA-PERF";
const SITE = "https://mulemark.io";
const ARTIFACT_DIR = "qa-artifacts";
const ALIASES: Record<string, string> = { support: "support@mulemark.io", sandbox: "delivered@resend.dev" };
const RENTER_TEL = "tel:+16045550199";
const RENTER_MAILTO = "mailto:d5-notification-qa@example.test";
const MAX_HTML_BYTES = 20_000;

type Expectation = {
  priority?: NotificationPriority;
  headline?: string;
  routes?: string[];
  previewsRequested?: number;
  exception?: string;
  individual?: boolean;
};

type ArtifactScenario = {
  id: string;
  kind: string;
  status: string;
  reference: string | null;
  submissionId: string | null;
  settings: Record<string, unknown> | null;
  expect: Expectation;
  rentalOpen?: boolean;
};

type Artifact = { organizationId: string; scenarios: ArtifactScenario[] };

function loadArtifact(): { path: string; artifact: Artifact } | null {
  let path = process.env.QA_ARTIFACT ?? null;
  if (!path) {
    if (!existsSync(ARTIFACT_DIR)) return null;
    const files = readdirSync(ARTIFACT_DIR)
      .filter((file) => /^notification-qa-\d{8}T\d{6}Z\.json$/.test(file))
      .sort();
    if (files.length === 0) return null;
    path = join(ARTIFACT_DIR, files[files.length - 1]);
  }
  return { path, artifact: JSON.parse(readFileSync(path, "utf8")) as Artifact };
}

function productionClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const ref = /^https:\/\/([a-z0-9]{16,})\.supabase\.co$/.exec(url.replace(/\/$/, ""))?.[1] ?? null;
  if (ref !== PRODUCTION_REF || !key) {
    throw new Error("refusing to run: this read-only check only targets the Production project (.env.local)");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** The matrix records recipients by alias; routing needs real (allowlisted) addresses back. */
function dealias(settings: Record<string, unknown> | null): Record<string, unknown> {
  const out = { ...(settings ?? {}) };
  for (const column of ["notification_email", "urgent_notification_email"]) {
    const value = out[column];
    out[column] = typeof value === "string" ? (ALIASES[value] ?? null) : null;
  }
  return out;
}

function anyReportedAnswer(brief: NotificationBrief): boolean {
  const r = brief.reported;
  return [r.issueType, r.equipmentState, r.responseNeed, r.damageSeverity].some((v) => v !== null && v !== "not_sure");
}

const loaded = loadArtifact();
const checked = (loaded?.artifact.scenarios ?? []).filter(
  (scenario) =>
    scenario.submissionId !== null &&
    scenario.status === "submitted" &&
    ["damage", "support", "return", "staff-return"].includes(scenario.kind)
);

let client: SupabaseClient;
let organizationName = "";

beforeAll(async () => {
  client = productionClient();
  const { data, error } = await client.from("organizations").select("name").eq("id", QA_ORG_ID).single<{ name: string }>();
  if (error || !data) throw new Error("the Production QA organization is not readable");
  organizationName = data.name;
});

describe("Production notification content, rendered from saved QA submissions", () => {
  it("has a notification QA matrix artifact for the QA organization", () => {
    expect(loaded, "run `npm run production:qa-notifications -- --confirm` first").not.toBeNull();
    expect(loaded?.artifact.organizationId).toBe(QA_ORG_ID);
    expect(checked.length).toBeGreaterThan(0);
  });

  it.each(checked.map((scenario) => [scenario.id, scenario] as const))("%s", async (_id, scenario) => {
    const { data: row, error } = await client
      .from("form_submissions")
      .select(SAVED_SUBMISSION_COLUMNS)
      .eq("id", scenario.submissionId as string)
      .eq("organization_id", QA_ORG_ID)
      .maybeSingle<SavedSubmissionRow>();
    expect(error).toBeNull();
    expect(row).not.toBeNull();
    const saved = row as SavedSubmissionRow;

    const { data: asset } = await client
      .from("assets")
      .select("asset_code, asset_name, category")
      .eq("id", saved.asset_id as string)
      .eq("organization_id", QA_ORG_ID)
      .maybeSingle<{ asset_code: string | null; asset_name: string | null; category: string | null }>();
    expect(asset?.asset_code).toBe(QA_ASSET_CODE);

    const brief = projectSubmissionBrief({
      organizationName,
      row: saved,
      asset: { code: asset?.asset_code ?? null, name: asset?.asset_name ?? null, category: asset?.category ?? null },
      siteUrl: SITE,
    });

    // A staff return is never emailed individually: the projection refuses it outright.
    if (scenario.kind === "staff-return") {
      expect(saved.submission_origin).toBe("staff");
      expect(brief).toBeNull();
      return;
    }

    expect(brief).not.toBeNull();
    const b = brief as NotificationBrief;
    expect(b.reference).toBe(scenario.reference);
    const context = `photos ${b.photos.count}; notes: ${b.returnDetail?.notes.join(" | ") || "none"}`;
    expect(b.priority, context).toBe(scenario.expect.priority);
    if (scenario.expect.headline) expect(b.headline, context).toBe(scenario.expect.headline);

    // Routing and preview request, from the settings in force when it was submitted.
    const settings = readNotificationSettings(dealias(scenario.settings));
    const routes = resolveSubmissionRecipients({
      formType: saved.form_type as SubmissionFormType,
      priority: b.priority,
      settings,
    }).sends.map((send) => send.route);
    expect(routes).toEqual(scenario.expect.routes);
    const requested = previewRequestCount(settings.notify_include_photo_previews, b.photos.previewCandidates.length);
    expect(requested).toBe(scenario.expect.previewsRequested);

    const content = buildIncidentEmail(b);
    const recordUrl = `${SITE}/dashboard/submissions/${encodeURIComponent(saved.id)}`;
    const label = PRIORITY_LABELS[b.priority];

    // Subject: fixed prefix by priority, asset code, bounded, never "urgent" or "!".
    expect(content.subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    expect(content.subject).toContain(QA_ASSET_CODE);
    expect(content.subject).not.toMatch(/urgent|!/i);
    const prefix = SUBJECT_PREFIXES[b.priority];
    if (prefix) expect(content.subject.startsWith(prefix)).toBe(true);
    else expect(content.subject).not.toMatch(/^(Immediate attention|Follow up):/);

    // First visible line = the phone preview.
    const firstLine = content.text.split("\n")[0];
    if (b.event === "renter_return") {
      const lead = { follow_up: "Exceptions: ", routine: "Review when convenient: ", record: "No action required." }[
        b.priority as "follow_up" | "routine" | "record"
      ];
      expect(firstLine.startsWith(lead)).toBe(true);
    } else {
      expect(firstLine.startsWith(anyReportedAnswer(b) ? "Reported: " : b.eventLabel)).toBe(true);
      expect(firstLine).toContain("D5 Notification QA");
    }

    // Header and body.
    expect(content.text).toContain(`${label.toUpperCase()} — ${b.eventLabel}`);
    expect(content.text).toContain(`Asset: ${QA_ASSET_CODE}`);
    if (b.event === "renter_return") {
      if (scenario.expect.exception) {
        expect(content.text).toContain("Exceptions");
        expect(content.text).toContain(scenario.expect.exception);
        expect(content.text).toContain(SELECTIONS_NOTE);
      }
      if (b.priority === "record") expect(content.text).toContain("No action required. No exceptions reported.");
      if (scenario.rentalOpen) expect(content.text).toContain("Linked to a rental session.");
    } else {
      expect(content.text).toContain("What was reported");
      expect(content.text).toContain(`D5 notification QA (${scenario.id})`);
      expect(content.text).toContain("Reported response need: ");
      expect(content.text).toContain(SELECTIONS_NOTE);
      expect(content.html).toContain(`href="${RENTER_TEL}"`);
      expect(content.html).toContain(`href="${RENTER_MAILTO}"`);
    }

    // The authenticated record link is the first link, on the canonical host, in both parts.
    expect(/<a href="([^"]+)"/.exec(content.html)?.[1]).toBe(recordUrl);
    expect(content.text).toContain(`: ${recordUrl}`);

    // Reference, photo count and the reason line.
    const media = Array.isArray(saved.media_urls) ? (saved.media_urls as unknown[]).filter((v): v is string => typeof v === "string") : [];
    expect(content.text).toContain(`Reference: ${scenario.reference}`);
    expect(content.text).toContain(media.length === 0 ? "Photos: none" : `Photos: ${media.length} on the record`);
    expect(content.text).toContain(`Change this under Settings → Notifications: ${SITE}/dashboard/settings`);

    // text/plain parity for the load-bearing facts.
    for (const token of [scenario.reference as string, recordUrl, label.toUpperCase(), `Asset: ${QA_ASSET_CODE}`]) {
      expect(content.html).toContain(token);
    }

    // Text-only unless previews were requested; with previews, one cid: per attachment and the count line.
    expect(content.html).not.toContain("cid:");
    expect(content.attachments).toBeUndefined();
    if (requested > 0) {
      const figures = b.photos.previewCandidates.slice(0, requested).map((candidate, index) => ({
        contentId: `qa-preview-${index + 1}`,
        label: candidate.label,
        width: 640,
        height: 427,
      }));
      const previews: IncidentPreviews = {
        requested,
        figures,
        attachments: figures.map((figure) => ({
          filename: `${figure.contentId}.jpg`,
          contentType: "image/jpeg" as const,
          contentId: figure.contentId,
          content: Buffer.alloc(8),
        })),
      };
      const withPreviews = buildIncidentEmail(b, previews);
      expect(withPreviews.text).toContain(`Photo previews included: ${requested} of `);
      expect(withPreviews.text).toContain(PREVIEW_POINTER);
      expect((withPreviews.html.match(/src="cid:/g) ?? []).length).toBe(requested);
      expect(withPreviews.attachments).toHaveLength(requested);
      if (b.returnDetail?.damage) expect(b.photos.previewCandidates[0].rank).toBe(1);
    } else {
      expect(content.text).not.toContain("Photo previews");
    }

    // Privacy and size.
    const everything = `${content.subject}\n${content.text}\n${content.html}`;
    expect(everything).not.toMatch(/org\/[0-9a-f-]{36}\/asset\//);
    expect(everything).not.toMatch(/supabase|\/storage\/v1\/|token=|X-Amz-|signature=/i);
    for (const path of media) expect(everything).not.toContain(path);
    expect(Buffer.byteLength(content.html, "utf8")).toBeLessThanOrEqual(MAX_HTML_BYTES);
  });
});
