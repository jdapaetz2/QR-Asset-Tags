/**
 * Engineering Phase D5.1 — the operational email fixture set: one deterministic example of each email layout. Shared by
 * the parity test (lib/notifications/email-parity.test.ts, placeholder previews, part of `npm test`) and the local
 * fixture gallery (tests/email/email.gallery.test.ts, `npm run email:gallery`, real generated previews). Nothing here
 * sends, reads a database or touches the network. All names, contacts and references are fictional.
 */
import {
  CLEAN_FLAGS,
  ORG_ID,
  SITE_URL,
  cleanGeneratorValues,
  damageRow,
  mediaPath,
  photo,
  returnRowV2,
  supportRow,
  templateV2_20260702,
} from "@/lib/notifications/__fixtures__/rows";
import { projectDigestItem, sortDigestItems, type DigestAsset, type DigestItem } from "@/lib/notifications/digest";
import {
  buildIncidentEmail,
  buildReturnDigestEmail,
  buildTagStatusEmail,
  type EmailContent,
  type IncidentPreviews,
} from "@/lib/notifications/email";
import { projectSubmissionBrief, type BriefAsset, type SavedSubmissionRow } from "@/lib/notifications/projection";
import { tagRequestStatusLabel } from "@/lib/tags/tag-requests";

export type PreviewFactory = (labels: string[]) => IncidentPreviews;

export type EmailFixtureKind = "incident" | "digest" | "tag";

export type EmailFixture = {
  id: string;
  title: string;
  kind: EmailFixtureKind;
  build: (previews: PreviewFactory) => EmailContent;
};

/** Size budgets per layout (docs/ACTIONABLE_NOTIFICATION_DESIGN.md §7.8). */
export const EMAIL_BUDGETS: Record<EmailFixtureKind, { html: number; text: number }> = {
  incident: { html: 40_000, text: 12_000 },
  digest: { html: 75_000, text: 30_000 },
  tag: { html: 20_000, text: 12_000 },
};

/** Placeholder previews with the production content-id and filename scheme (bytes are not an image). */
export const placeholderPreviews: PreviewFactory = (labels) => {
  const figures = labels.map((label, index) => ({
    contentId: `mm-preview-${index + 1}@mulemark`,
    label,
    width: 640,
    height: 480 - index * 53,
  }));
  return {
    requested: labels.length,
    figures,
    attachments: figures.map((figure, index) => ({
      filename: `incident-photo-${index + 1}.jpg`,
      contentType: "image/jpeg" as const,
      contentId: figure.contentId,
      content: Buffer.alloc(8, index),
    })),
  };
};

const ORG = "Northridge Rentals";
const INBOX_URL = `${SITE_URL}/dashboard/submissions?form_type=return_checklist&status=unresolved`;
const SETTINGS_URL = `${SITE_URL}/dashboard/settings`;

const EXC: BriefAsset = { code: "EXC-001", name: "Mini Excavator", category: "Excavators" };
const GEN: BriefAsset = { code: "GEN-003", name: "Portable Generator", category: "Generators" };
const LFT: BriefAsset = { code: "LFT-012", name: "Scissor Lift", category: "Aerial lifts" };

const media = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => mediaPath(`${prefix}-${i + 1}`));

function incident(row: SavedSubmissionRow, asset: BriefAsset, labels: string[], previews: PreviewFactory): EmailContent {
  const brief = projectSubmissionBrief({ organizationName: ORG, row, asset, siteUrl: SITE_URL });
  if (!brief) throw new Error("email fixture: the row did not project to a brief");
  return buildIncidentEmail(brief, labels.length > 0 ? previews(labels) : null);
}

// ---------------------------------------------------------------------------
// Daily summary items
// ---------------------------------------------------------------------------

const WINDOW_START = new Date("2026-09-13T13:00:00.000Z");
const WINDOW_END = new Date("2026-09-14T13:00:00.000Z");

const v2 = (values: Record<string, unknown>, flags: Record<string, unknown> = CLEAN_FLAGS) =>
  returnRowV2({ template: templateV2_20260702(), values: { ...cleanGeneratorValues(), ...values }, flags })
    .submission_data_json;

const RETURNS = {
  damage: () =>
    v2(
      { damage_observed: "yes", damage_location: "rear bumper", damage_severity: "minor" },
      { damage_observed: "yes", accessories_missing: false }
    ),
  damageAndCheck: () =>
    v2(
      { damage_observed: "yes", damage_location: "left side panel", damage_severity: "severe", cords_outlets: "fail" },
      { damage_observed: "yes", accessories_missing: false }
    ),
  notOperating: () => v2({ starts_operates: "no" }),
  failedCheck: () => v2({ oil_level: "fail" }),
  missingAccessory: () =>
    v2(
      { accessories: { cords: "missing", wheel_kit: "returned", manual: "returned" } },
      { damage_observed: "no", accessories_missing: true }
    ),
};

const digestAsset = (n: number, code: string, name: string): DigestAsset => ({
  id: `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  asset_code: code,
  asset_name: name,
});

const D_EXC = digestAsset(1, "EXC-001", "Mini Excavator");
const D_GEN = digestAsset(2, "GEN-003", "Portable Generator");
const D_LFT = digestAsset(3, "LFT-012", "Scissor Lift");
const D_TRL = digestAsset(4, "TRL-007", "Utility Trailer");
const D_GEN4 = digestAsset(5, "GEN-004", "Portable Generator");

type ReturnSpec = {
  data: unknown;
  asset: DigestAsset | null;
  /** Minutes after the window start. */
  minutes: number;
  status?: string;
  origin?: "public" | "staff";
  session?: string;
  photos?: number;
};

/** Deterministic items: `prefix` is two hex characters, so every SUB- reference is distinct and stable. */
function digestItems(prefix: string, specs: ReturnSpec[]): DigestItem[] {
  return sortDigestItems(
    specs.map((spec, index) => {
      const hex = `${prefix}${index.toString(16).padStart(4, "0")}`;
      const item = projectDigestItem(
        {
          id: `${hex}00-0000-4000-8000-000000000000`,
          organization_id: ORG_ID,
          created_at: new Date(WINDOW_START.getTime() + spec.minutes * 60_000).toISOString(),
          status: spec.status ?? "new",
          submission_origin: spec.origin ?? "public",
          asset_id: spec.asset?.id ?? null,
          rental_session_id: spec.session ?? null,
          submission_data_json: spec.data,
          media_urls: media(hex, spec.photos ?? 0),
        },
        spec.asset,
        SITE_URL
      );
      if (!item) throw new Error(`email fixture: digest return ${hex} has no exception`);
      return item;
    })
  );
}

function digest(items: DigestItem[]): EmailContent {
  return buildReturnDigestEmail({
    orgName: ORG,
    items,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    clamped: false,
    scanIncomplete: false,
    inboxUrl: INBOX_URL,
    settingsUrl: SETTINGS_URL,
  });
}

/** A busy day: `count` mixed returns spread over `assets` trailers and the 24-hour window. */
function busyDaySpecs(count: number, assets: number): ReturnSpec[] {
  const data = [RETURNS.damage, RETURNS.failedCheck, RETURNS.missingAccessory, RETURNS.notOperating, RETURNS.damageAndCheck];
  const statuses = ["new", "new", "reviewed", "resolved", "new", "archived", "reviewed"];
  return Array.from({ length: count }, (_, i) => ({
    data: data[i % data.length](),
    asset: digestAsset(10 + (i % assets), `TRL-${String(100 + (i % assets))}`, "Utility Trailer"),
    minutes: 5 + Math.floor((i * 1430) / count),
    status: statuses[i % statuses.length],
    origin: i % 4 === 0 ? ("staff" as const) : ("public" as const),
    photos: i % 3,
  }));
}

// ---------------------------------------------------------------------------
// Tag requests
// ---------------------------------------------------------------------------

const TAG_REQUEST_ID = "5f1c2a90-3b7e-4c1d-9a2b-6e8f0d4c7a11";
function tag(status: string): EmailContent {
  return buildTagStatusEmail({
    orgName: ORG,
    statusLabel: tagRequestStatusLabel(status),
    reference: TAG_REQUEST_ID,
    requestedAt: "2026-09-08T23:30:00.000Z",
    manageUrl: `${SITE_URL}/dashboard/tag-requests/${TAG_REQUEST_ID}`,
    settingsUrl: SETTINGS_URL,
  });
}

// ---------------------------------------------------------------------------
// The fixture set
// ---------------------------------------------------------------------------

export const EMAIL_FIXTURES: EmailFixture[] = [
  {
    id: "01-immediate-damage-previews",
    title: "Immediate attention — damage report, unsafe to operate, 3 previews",
    kind: "incident",
    build: (previews) =>
      incident(
        damageRow(
          {
            triage_version: 1,
            reported_equipment_state: "unsafe_to_operate",
            reported_response_need: "immediate",
            reported_damage_severity: "major",
            description:
              "Boom arm struck the loading dock while unloading.\nHydraulic line to the bucket cylinder is leaking.\nMachine is parked and tagged out at bay 4.",
          },
          { media_urls: media("damage", 4) }
        ),
        EXC,
        ["Damage photos", "Damage photos", "Damage photos"],
        previews
      ),
  },
  {
    id: "02-immediate-escalated-by-state",
    title: "Immediate attention — escalated by equipment state; response need Follow up soon",
    kind: "incident",
    build: (previews) =>
      incident(
        damageRow(
          {
            triage_version: 1,
            reported_equipment_state: "unsafe_to_operate",
            reported_response_need: "prompt",
            reported_damage_severity: "moderate",
            description: "Tipped onto its side on the slope by the fence line. Nobody was hurt.",
          },
          { media_urls: media("damage", 2) }
        ),
        EXC,
        [],
        previews
      ),
  },
  {
    id: "03-follow-up-breakdown",
    title: "Follow up — support request, breakdown or no-start, no photos",
    kind: "incident",
    build: (previews) =>
      incident(
        supportRow(
          {
            triage_version: 1,
            reported_issue_type: "breakdown_no_start",
            reported_response_need: "prompt",
            preferred_contact_method: "text",
            description: "Will not start after refuelling. It cranks but never catches.",
          },
          { submitted_by_name: "Sam Lee", submitted_by_phone: "604-555-0199", submitted_by_email: "sam.lee@site.test" }
        ),
        GEN,
        [],
        previews
      ),
  },
  {
    id: "04-routine-minor-damage",
    title: "Routine review — minor damage, 1 preview",
    kind: "incident",
    build: (previews) =>
      incident(
        damageRow(
          {
            triage_version: 1,
            reported_equipment_state: "operating",
            reported_response_need: "routine",
            reported_damage_severity: "minor",
            description: "Scuff on the left guard rail. Lift works normally.",
          },
          { media_urls: media("damage", 1) }
        ),
        LFT,
        ["Damage photos"],
        previews
      ),
  },
  {
    id: "05-return-exceptions",
    title: "Follow up — renter return with damage and a failed check, 1 preview",
    kind: "incident",
    build: (previews) =>
      incident(
        returnRowV2({
          template: templateV2_20260702(),
          values: {
            ...cleanGeneratorValues(),
            oil_level: "fail",
            damage_observed: "yes",
            damage_location: "left side panel",
            damage_severity: "severe",
            damage_description: "Dented and scraped along the lower edge.",
          },
          flags: { damage_observed: "yes", accessories_missing: false },
          photos: {
            overall_photo: [photo("Overall photo", "overall-1")],
            damage_photos: [photo("Damage photos", "damage-1"), photo("Damage photos", "damage-2")],
          },
          overrides: {
            submitted_by_name: "Alex Chen",
            submitted_by_email: "alex.chen@site.test",
            rental_session_id: "b0000000-0000-4000-8000-0000000000c1",
          },
        }),
        GEN,
        ["Damage photos"],
        previews
      ),
  },
  {
    id: "06-return-clean",
    title: "Record only — clean renter return",
    kind: "incident",
    build: (previews) =>
      incident(
        returnRowV2({
          template: templateV2_20260702(),
          values: cleanGeneratorValues(),
          flags: CLEAN_FLAGS,
          photos: { overall_photo: [photo("Overall photo", "overall-1")] },
          overrides: { submitted_by_name: "Alex Chen", submitted_by_email: "alex.chen@site.test" },
        }),
        GEN,
        [],
        previews
      ),
  },
  {
    id: "07-digest-single",
    title: "Daily summary — 1 return",
    kind: "digest",
    build: () => digest(digestItems("a1", [{ data: RETURNS.damage(), asset: D_GEN, minutes: 200, photos: 2 }])),
  },
  {
    id: "08-digest-mixed",
    title: "Daily summary — 7 mixed returns",
    kind: "digest",
    build: () =>
      digest(
        digestItems("a2", [
          { data: RETURNS.damage(), asset: D_EXC, minutes: 130, photos: 3 },
          { data: RETURNS.missingAccessory(), asset: D_EXC, minutes: 400, status: "reviewed", origin: "staff" },
          { data: RETURNS.notOperating(), asset: D_GEN, minutes: 250, photos: 1 },
          { data: RETURNS.failedCheck(), asset: D_LFT, minutes: 310, origin: "staff" },
          { data: RETURNS.missingAccessory(), asset: D_TRL, minutes: 520 },
          { data: RETURNS.damage(), asset: D_GEN4, minutes: 60, status: "resolved", origin: "staff", photos: 2 },
          { data: RETURNS.failedCheck(), asset: null, minutes: 700, status: "reviewed" },
        ])
      ),
  },
  {
    id: "09-digest-repeat-asset",
    title: "Daily summary — repeated exceptions on one asset, shared rental session",
    kind: "digest",
    build: () =>
      digest(
        digestItems("a3", [
          { data: RETURNS.damage(), asset: D_GEN, minutes: 90, session: "s-1", photos: 2 },
          { data: RETURNS.failedCheck(), asset: D_GEN, minutes: 95, session: "s-1", origin: "staff" },
          { data: RETURNS.missingAccessory(), asset: D_GEN, minutes: 300, status: "reviewed", session: "s-2" },
          { data: RETURNS.damageAndCheck(), asset: D_GEN, minutes: 30, status: "resolved", origin: "staff" },
          { data: RETURNS.notOperating(), asset: D_GEN, minutes: 610 },
          { data: RETURNS.missingAccessory(), asset: D_EXC, minutes: 450 },
        ])
      ),
  },
  {
    id: "10-digest-busy-day",
    title: "Daily summary — 120 returns across 30 assets (later returns on one line)",
    kind: "digest",
    build: () => digest(digestItems("a4", busyDaySpecs(120, 30))),
  },
  { id: "11-tag-requested", title: "Tag request — Requested", kind: "tag", build: () => tag("requested") },
  { id: "12-tag-in-review", title: "Tag request — In review", kind: "tag", build: () => tag("in_review") },
  { id: "13-tag-ready", title: "Tag request — Ready", kind: "tag", build: () => tag("ready") },
  { id: "14-tag-delivered", title: "Tag request — Delivered", kind: "tag", build: () => tag("delivered") },
  {
    id: "15-digest-very-busy-day",
    title: "Daily summary — 400 returns across 80 assets (beyond one-line capacity)",
    kind: "digest",
    build: () => digest(digestItems("a5", busyDaySpecs(400, 80))),
  },
];
