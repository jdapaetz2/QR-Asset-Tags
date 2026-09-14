#!/usr/bin/env node
/**
 * Engineering Phase D5 — Production live QA matrix for actionable notifications. OPERATOR-APPROVED in the D5 plan.
 *
 * WHAT IT DOES. Runs every approved Phase D acceptance scenario against the Production QA fixtures, one at a time:
 *   damage     triage omitted / routine answers / major severity only / not operating + prompt / cannot be moved /
 *              unsafe (invalid phone) / photo previews on / previews off
 *   support    operating question / breakdown + prompt / stuck / rollover / help now (no phone)
 *   routing    main only / urgent only (general switch off) / general off + routine / main + urgent at two addresses /
 *              main + urgent at one address / invalid urgent settings refused (database and settings form) /
 *              partial route failure (recorded as not run live)
 *   returns    staff outbound (opens a QA rental) then renter returns: clean instant / failed check instant /
 *              clean daily / damage daily / exception with mode off / photo gap only / missing accessory /
 *              does not operate (generator template) / damage with photos; then a staff return with a failed check
 * For each it records the reference, the saved submission id, the expected priority, routes, preview count and
 * confirmation-page call-now state, and what the confirmation page actually showed. Emails land in the approved QA
 * inbox for a human to review; `npm run production:qa-notification-content` checks the content from the saved rows.
 *
 * REFUSALS, because this writes to PRODUCTION:
 *   1. `assertTarget("production", …)` — staging is refused by name.
 *   2. The organization, asset, short code and tag are hard-coded QA fixtures; no argument can name anything else.
 *   3. Recipients are an allowlist of two (our support mailbox, Resend's sandbox), plus — D5.1, only with
 *      `--operator-mailbox` — the operator's own client-check mailbox from QA_OPERATOR_RECIPIENT (alias "operator",
 *      never printed; refused if it is another organization's notification address). A recipient this tool did not
 *      set is never overwritten.
 *   4. Without `--confirm` it prints the plan and writes nothing. Unknown or repeated arguments stop it.
 *   5. A snapshot left by an earlier run must be restored (`--restore --confirm`) before a new run.
 *
 * RESTORE. Before anything changes, the QA organization's notification columns and the QA asset's support-phone
 * override and return template are saved to qa-artifacts/notification-qa-snapshot.json (gitignored). A normal run
 * restores and verifies them in a `finally`. `--leave-digest` instead leaves the QA organization in
 * `daily_exceptions` → support mailbox (the asset is still restored) so the next 6 AM Pacific summary can be checked;
 * `--restore --confirm` then puts everything back. QA submissions and the QA tag request are kept as test data.
 *
 * STAFF STEPS use the Production QA login from the gitignored .env.production-perf.local (PRODUCTION_QA_EMAIL,
 * PRODUCTION_QA_PASSWORD) — never printed. Without it those scenarios are recorded as not run.
 *
 * OUTPUT. A table, the UTC log window, and qa-artifacts/notification-qa-<utc>.json (gitignored), which names routes
 * by alias ("support", "sandbox"), never by address. No key, storage path or signed URL is printed or saved.
 *
 * Usage:
 *   npm run production:qa-notifications                                          # dry run
 *   npm run production:qa-notifications -- --confirm --tag-setup --leave-digest
 *   npm run production:qa-notifications -- --confirm --only=damage-cannot-move,support-rollover
 *   npm run production:qa-notifications -- --confirm --operator-mailbox --only=damage-previews-on   # to QA_OPERATOR_RECIPIENT
 *   npm run production:qa-notifications -- --restore                             # shows what would be restored
 *   npm run production:qa-notifications -- --restore --confirm
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

import {
  BASE,
  GPS_EXIF,
  INTERVAL_MS,
  OPERATOR,
  QA_ASSET_ID,
  QA_ORG_ID,
  QA_SHORT_CODE,
  SANDBOX_RECIPIENT,
  SUPPORT_RECIPIENT,
  applySettings,
  assertAllowlisted,
  assertOperatorRecipientUnused,
  awaitConfirmation,
  captureConfirmation,
  connectProduction,
  errorLine,
  findSubmission,
  labelledPhoto,
  login,
  readQaSettings,
  recipientAlias,
  refuse,
  restoreSettings,
  sleep,
  submitDamage,
  submitReturn,
  submitStaffOutbound,
  submitStaffReturn,
  submitSupport,
} from "./lib/qa-forms.mjs";

const TAG = "qa-notifications";
const ARTIFACT_DIR = "qa-artifacts";
const SNAPSHOT_FILE = `${ARTIFACT_DIR}/notification-qa-snapshot.json`;
const TAG_REQUEST_NOTE = "D5 notification QA — test data, not a real order. Do not produce.";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const FLAGS = new Set(["--confirm", "--tag-setup", "--leave-digest", "--restore", "--operator-mailbox"]);
const args = process.argv.slice(2);
for (const arg of args) {
  if (!FLAGS.has(arg) && !/^--only=[a-z0-9,-]+$/.test(arg)) refuse(TAG, `unknown argument "${arg}".`);
}
if (new Set(args.map((arg) => arg.split("=")[0])).size !== args.length) refuse(TAG, "an argument is repeated.");
const CONFIRMED = args.includes("--confirm");
const TAG_SETUP = args.includes("--tag-setup");
const LEAVE_DIGEST = args.includes("--leave-digest");
const RESTORE = args.includes("--restore");
const OPERATOR_MAILBOX = args.includes("--operator-mailbox");
const ONLY = (args.find((arg) => arg.startsWith("--only=")) ?? "").slice("--only=".length).split(",").filter(Boolean);
if (RESTORE && args.some((arg) => arg !== "--restore" && arg !== "--confirm")) {
  refuse(TAG, "--restore takes only --confirm.");
}
if (OPERATOR_MAILBOX && !OPERATOR.address) refuse(TAG, OPERATOR.problem);
/** The QA organization's main notification address for this run. */
const MAIN_RECIPIENT = OPERATOR_MAILBOX ? OPERATOR.address : SUPPORT_RECIPIENT;
const MAIN_ALIAS = OPERATOR_MAILBOX ? "operator" : "support";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fictional 555 numbers set on the QA asset only while a scenario needs them. */
const QA_PHONES = { valid: "+1 604 555 0100", invalid: "Ask at the yard counter", none: null };
const VALID_TEL = "tel:+16045550100";
const RENTER = { name: "D5 Notification QA", email: "d5-notification-qa@example.test", phone: "+1 604 555 0199" };

const photo = (options) => labelledPhoto({ banner: "MULEMARK D5 QA", width: 1600, height: 1066, ...options });
const conditionPhoto = (index) => photo({ label: `Condition slot ${index + 1}`, hue: 60 + index * 50 });

const UNSAFE = { state: "It's not safe to use", need: "I need help now" };
const OPERATING = { state: "Yes, it works normally" };
const DAILY = { return_notification_mode: "daily_exceptions" };

/**
 * `expect.routes` are the sends routing must plan; an empty list means the notifier logs `skipped_disabled`.
 * `callNow`: none | button (asset QA phone) | fallback-phone (unusable phone shown as text) | fallback-none.
 * `digest`: whether the next daily summary (QA organization in daily_exceptions) must list the return.
 * `reason`: the D5.1 priority reason the saved report must project to (null for none); the content check also proves
 * "Priority reason:" is shown only when a reported condition, not the response need, decided the priority.
 */
const SCENARIOS = [
  // ---- Damage reports -------------------------------------------------------
  {
    id: "damage-triage-omitted",
    kind: "damage",
    triage: {},
    expect: { priority: "routine", headline: "damage reported", reason: null, routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "damage-routine-answers",
    kind: "damage",
    triage: { state: "Yes, it works normally", need: "No rush", severity: "Minor — scratches or dents" },
    expect: { priority: "routine", headline: "damage reported", reason: null, routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "damage-major-severity-only",
    kind: "damage",
    triage: { severity: "Major — serious damage" },
    expect: { priority: "routine", headline: "damage reported", reason: null, routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "damage-not-operating-prompt",
    kind: "damage",
    triage: { state: "No, it won't run or work", need: "Please follow up soon" },
    expect: { priority: "follow_up", headline: "reported not operating", reason: "Reported not operating", routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "damage-cannot-move",
    kind: "damage",
    triage: { state: "It's stuck or can't be moved", need: "Please follow up soon" },
    expect: { priority: "immediate", headline: "reported unable to move", reason: "Reported unable to move", routes: ["main"], previewsRequested: 0, callNow: "button" },
  },
  {
    id: "damage-unsafe-invalid-phone",
    kind: "damage",
    triage: { state: "It's not safe to use", need: "No rush" },
    asset: { phone: "invalid" },
    expect: {
      priority: "immediate",
      headline: "reported unsafe to operate",
      reason: "Reported unsafe to operate",
      routes: ["main"],
      previewsRequested: 0,
      callNow: "fallback-phone",
    },
  },
  {
    id: "damage-previews-on",
    kind: "damage",
    triage: { state: "Yes, but not properly" },
    files: async () => [await photo({ label: "Previews on A", hue: 20 }), await photo({ label: "Previews on B", hue: 140 })],
    expect: {
      priority: "follow_up",
      headline: "reported operating with limitations",
      reason: "Reported operating with limitations",
      routes: ["main"],
      previewsRequested: 2,
      callNow: "none",
    },
  },
  {
    id: "damage-previews-off",
    kind: "damage",
    triage: { state: "Yes, but not properly" },
    settings: { notify_include_photo_previews: false },
    files: async () => [await photo({ label: "Previews off", hue: 250 })],
    expect: {
      priority: "follow_up",
      headline: "reported operating with limitations",
      reason: "Reported operating with limitations",
      routes: ["main"],
      previewsRequested: 0,
      callNow: "none",
    },
  },

  // ---- Support requests -----------------------------------------------------
  {
    id: "support-operating-question",
    kind: "support",
    triage: { issue: "How to use it", need: "No rush" },
    expect: { priority: "routine", headline: "support request", reason: null, routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "support-breakdown-prompt",
    kind: "support",
    triage: { issue: "It broke down or won't start", need: "Please follow up soon" },
    expect: {
      priority: "follow_up",
      headline: "reported breakdown or no-start",
      reason: "Breakdown or no-start reported",
      routes: ["main"],
      previewsRequested: 0,
      callNow: "none",
    },
  },
  {
    id: "support-stuck-recovery",
    kind: "support",
    triage: { issue: "It's stuck or needs recovery" },
    expect: {
      priority: "follow_up",
      headline: "reported stuck, recovery needed",
      reason: "Recovery assistance reported",
      routes: ["main"],
      previewsRequested: 0,
      callNow: "none",
    },
  },
  {
    id: "support-rollover",
    kind: "support",
    triage: { issue: "Rollover or safety issue", need: "No rush" },
    expect: {
      priority: "immediate",
      headline: "reported rollover or safety incident",
      reason: "Rollover or safety incident reported",
      routes: ["main"],
      previewsRequested: 0,
      callNow: "button",
    },
  },
  {
    id: "support-need-now-no-phone",
    kind: "support",
    triage: { issue: "Something else", need: "I need help now" },
    asset: { phone: "none" },
    expect: { priority: "immediate", headline: "help requested now", reason: "Help needed now", routes: ["main"], previewsRequested: 0, callNow: "fallback-none" },
  },

  // ---- Recipient routing ----------------------------------------------------
  {
    id: "routing-main-only",
    kind: "damage",
    triage: OPERATING,
    expect: { priority: "routine", headline: "damage reported", reason: null, routes: ["main"], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "routing-urgent-only",
    kind: "damage",
    triage: UNSAFE,
    settings: { notify_damage_reports: false, notify_urgent_reports: true, urgent_notification_email: SUPPORT_RECIPIENT },
    expect: { priority: "immediate", headline: "reported unsafe to operate", reason: "Reported unsafe to operate", routes: ["urgent"], previewsRequested: 0, callNow: "button" },
  },
  {
    id: "routing-general-off-routine",
    kind: "damage",
    triage: OPERATING,
    settings: { notify_damage_reports: false, notify_urgent_reports: true, urgent_notification_email: SUPPORT_RECIPIENT },
    expect: { priority: "routine", headline: "damage reported", reason: null, routes: [], previewsRequested: 0, callNow: "none" },
  },
  {
    id: "routing-separate-addresses",
    kind: "damage",
    triage: UNSAFE,
    settings: { notify_urgent_reports: true, urgent_notification_email: SANDBOX_RECIPIENT },
    expect: {
      priority: "immediate",
      headline: "reported unsafe to operate",
      reason: "Reported unsafe to operate",
      routes: ["main", "urgent"],
      previewsRequested: 0,
      callNow: "button",
    },
  },
  {
    id: "routing-same-address",
    kind: "damage",
    triage: UNSAFE,
    settings: { notify_urgent_reports: true, urgent_notification_email: SUPPORT_RECIPIENT },
    expect: {
      priority: "immediate",
      headline: "reported unsafe to operate",
      reason: "Reported unsafe to operate",
      routes: ["main_and_urgent"],
      previewsRequested: 0,
      callNow: "button",
    },
  },
  { id: "routing-invalid-urgent", kind: "invalid-urgent", expect: {} },
  {
    id: "routing-partial-failure",
    kind: "not-run",
    expect: {},
    note:
      "not run live: a provider rejection for one route cannot be forced without a secret-bearing direct provider call; " +
      "covered by lib/notifications/notify.test.ts (recipient isolation)",
  },

  // ---- Returns --------------------------------------------------------------
  { id: "staff-outbound-setup", kind: "staff-outbound", expect: {} },
  {
    // As built: every visible empty photo slot, including the optional Additional photos, is stored in
    // `missing_recommended_photo_slots`, which the design maps to Routine review (design §5.3).
    id: "return-clean-instant",
    kind: "return",
    damage: false,
    photos: async () => ({ eachCondition: conditionPhoto }),
    expect: {
      priority: "routine",
      headline: "renter return checklist, review when convenient",
      routes: ["main"],
      previewsRequested: 0,
      digest: false,
    },
  },
  {
    id: "return-clean-all-photos",
    kind: "return",
    damage: false,
    photos: async () => ({ eachCondition: conditionPhoto, additional: [await photo({ label: "Additional photo", hue: 300 })] }),
    expect: { priority: "record", headline: "renter return checklist, no exceptions", routes: ["main"], previewsRequested: 0, digest: false },
  },
  {
    id: "return-failed-check-instant",
    kind: "return",
    damage: false,
    answers: { tires_wheels: "Fail" },
    photos: async () => ({ eachCondition: conditionPhoto }),
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: ["main"],
      previewsRequested: 2,
      exception: "Failed check: Tires / wheels",
      digest: true,
      digestGroup: 2,
    },
  },
  {
    id: "return-clean-daily",
    kind: "return",
    damage: false,
    settings: DAILY,
    photos: async () => ({ eachCondition: conditionPhoto }),
    expect: {
      priority: "routine",
      headline: "renter return checklist, review when convenient",
      routes: [],
      previewsRequested: 0,
      digest: false,
    },
  },
  {
    id: "return-damage-daily",
    kind: "return",
    damage: true,
    settings: DAILY,
    photos: async () => ({ damage: [await photo({ label: "Daily damage slot", hue: 10 })] }),
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: [],
      previewsRequested: 1,
      exception: "Damage reported: Left side panel (QA)",
      digest: true,
      digestGroup: 1,
    },
  },
  {
    id: "return-exception-mode-off",
    kind: "return",
    damage: false,
    settings: { return_notification_mode: "off" },
    answers: { safety_chains: "Fail" },
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: [],
      previewsRequested: 0,
      exception: "Failed check: Safety chains",
      digest: true,
      digestGroup: 2,
    },
  },
  {
    id: "return-photo-gap-only",
    kind: "return",
    damage: false,
    expect: {
      priority: "routine",
      headline: "renter return checklist, review when convenient",
      routes: ["main"],
      previewsRequested: 0,
      digest: false,
    },
  },
  {
    id: "return-missing-accessory",
    kind: "return",
    damage: false,
    accessories: { straps: "missing" },
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: ["main"],
      previewsRequested: 0,
      exception: "Accessories missing: Straps",
      digest: true,
      digestGroup: 2,
    },
  },
  {
    id: "return-not-operating",
    kind: "return",
    damage: false,
    asset: { template: "portable_generator" },
    answers: { starts_operates: "No" },
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: ["main"],
      previewsRequested: 0,
      exception: "Starts / operates? No",
      digest: true,
      digestGroup: 1,
    },
  },
  {
    id: "return-damage-instant",
    kind: "return",
    damage: true,
    photos: async () => ({
      damage: [await photo({ label: "Return damage slot GPS", hue: 0, exif: GPS_EXIF })],
      other: [await photo({ label: "Return condition slot", hue: 200 })],
    }),
    expect: {
      priority: "follow_up",
      headline: "renter return checklist, 1 exception",
      routes: ["main"],
      previewsRequested: 2,
      exception: "Damage reported: Left side panel (QA) (reported damage severity: Minor)",
      digest: true,
      digestGroup: 1,
    },
  },
  {
    id: "staff-return-exception",
    kind: "staff-return",
    damage: false,
    answers: { coupler: "Fail" },
    expect: { individual: false, exception: "Failed check: Coupler / hitch", digest: true, digestGroup: 2 },
  },
  {
    id: "digest-overnight",
    kind: "not-run",
    expect: {},
    note: "verified after the next 6:00–6:59 AM Pacific summary run (--leave-digest), then --restore --confirm",
  },
];

const selected = ONLY.length > 0 ? SCENARIOS.filter((scenario) => ONLY.includes(scenario.id)) : SCENARIOS;
if (ONLY.length > 0 && selected.length !== ONLY.length) {
  refuse(TAG, `--only named an unknown scenario. Known: ${SCENARIOS.map((scenario) => scenario.id).join(", ")}`);
}

const PUBLIC_KINDS = new Set(["damage", "support", "return"]);

function expectationSummary(scenario) {
  const e = scenario.expect;
  if (scenario.kind === "staff-return") return "no individual email; listed in the next summary";
  if (!PUBLIC_KINDS.has(scenario.kind)) return scenario.note ?? scenario.kind;
  const routes = e.routes.length > 0 ? e.routes.join(" + ") : "none (skipped_disabled)";
  const parts = [`${e.priority}`, `routes ${routes}`, `previews ${e.previewsRequested}`];
  if (e.callNow) parts.push(`call-now ${e.callNow}`);
  if (e.digest !== undefined) parts.push(e.digest ? "in summary" : "not in summary");
  return parts.join("; ");
}

function aliasSettings(settings) {
  return {
    ...settings,
    notification_email: recipientAlias(settings.notification_email),
    urgent_notification_email: recipientAlias(settings.urgent_notification_email),
  };
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

const { db, host } = connectProduction(TAG);
console.log(`\n[${TAG}] target verified: PRODUCTION (host: ${host}), QA organization ${QA_ORG_ID}, tag ${QA_SHORT_CODE}`);

async function readQaAsset() {
  const { data, error } = await db
    .from("assets")
    .select("support_phone_override, return_inspection_template_key, active_rental_session_id")
    .eq("id", QA_ASSET_ID)
    .eq("organization_id", QA_ORG_ID)
    .maybeSingle();
  if (error || !data) throw new Error("could not read the QA asset");
  return data;
}

async function writeQaAsset(patch) {
  const { error } = await db.from("assets").update(patch).eq("id", QA_ASSET_ID).eq("organization_id", QA_ORG_ID);
  if (error) throw new Error(`QA asset update failed: ${error.message}`);
}

async function restoreAsset(original) {
  try {
    await writeQaAsset(original);
    const after = await readQaAsset();
    return Object.keys(original).every((key) => after[key] === original[key]);
  } catch {
    return false;
  }
}

function restoredSnapshotName() {
  return `${ARTIFACT_DIR}/notification-qa-snapshot.restored-${utcStamp(new Date())}.json`;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

// ---------------------------------------------------------------------------
// --restore
// ---------------------------------------------------------------------------

if (RESTORE) {
  if (!existsSync(SNAPSHOT_FILE)) refuse(TAG, `no snapshot at ${SNAPSHOT_FILE}; nothing to restore.`);
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
  if (snapshot.organizationId !== QA_ORG_ID || !snapshot.settings || !snapshot.asset) {
    refuse(TAG, "the snapshot is not a QA organization snapshot from this tool.");
  }
  try {
    assertAllowlisted(snapshot.settings, "snapshot");
  } catch (err) {
    refuse(TAG, err.message);
  }
  console.log(`[${TAG}] snapshot taken ${snapshot.takenAt}`);
  console.log(`  organization settings → ${JSON.stringify(aliasSettings(snapshot.settings))}`);
  console.log(
    `  QA asset → template ${snapshot.asset.return_inspection_template_key ?? "—"}, support phone override ` +
      `${snapshot.asset.support_phone_override ? "set" : "not set"}`
  );
  if (!CONFIRMED) {
    console.log("\n  DRY RUN — nothing restored. Pass --restore --confirm.\n");
    process.exit(0);
  }
  const settingsRestored = await restoreSettings(db, snapshot.settings);
  const assetRestored = await restoreAsset(snapshot.asset);
  console.log(`\n[${TAG}] QA organization settings restored: ${settingsRestored ? "yes (verified)" : "NO — restore by hand"}`);
  console.log(`[${TAG}] QA asset restored: ${assetRestored ? "yes (verified)" : "NO — restore by hand"}`);
  if (settingsRestored && assetRestored) {
    const archived = restoredSnapshotName();
    renameSync(SNAPSHOT_FILE, archived);
    console.log(`[${TAG}] snapshot archived as ${archived}\n`);
    process.exit(0);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Plan (dry run)
// ---------------------------------------------------------------------------

const qaLogin =
  process.env.PRODUCTION_QA_EMAIL && process.env.PRODUCTION_QA_PASSWORD
    ? { email: process.env.PRODUCTION_QA_EMAIL, password: process.env.PRODUCTION_QA_PASSWORD }
    : null;

console.log(`[${TAG}] QA login in the environment: ${qaLogin ? "yes (not shown)" : "no — staff scenarios will be recorded as not run"}`);
console.log(
  `[${TAG}] --tag-setup ${TAG_SETUP ? "on" : "off"}, --leave-digest ${LEAVE_DIGEST ? "on" : "off"}, ` +
    `main recipient: ${MAIN_ALIAS} mailbox\n`
);
for (const scenario of selected) console.log(`  - ${scenario.id}: ${expectationSummary(scenario)}`);

if (!CONFIRMED) {
  console.log("\n  DRY RUN — nothing written or submitted. Pass --confirm to run.\n");
  process.exit(0);
}

if (existsSync(SNAPSHOT_FILE)) {
  refuse(TAG, `a snapshot from an earlier run is waiting at ${SNAPSHOT_FILE}. Run --restore --confirm first.`);
}
if (OPERATOR_MAILBOX) {
  try {
    await assertOperatorRecipientUnused(db);
  } catch (err) {
    refuse(TAG, err.message);
  }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

let original;
let originalAsset;
let organization;
try {
  original = await readQaSettings(db);
  assertAllowlisted(original, "the QA organization");
  const asset = await readQaAsset();
  originalAsset = {
    support_phone_override: asset.support_phone_override,
    return_inspection_template_key: asset.return_inspection_template_key,
  };
  const { data, error } = await db
    .from("organizations")
    .select("primary_color, support_phone")
    .eq("id", QA_ORG_ID)
    .maybeSingle();
  if (error || !data) throw new Error("could not read the QA organization's public contact");
  organization = data;
} catch (err) {
  refuse(TAG, err.message);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(
  SNAPSHOT_FILE,
  JSON.stringify({ takenAt: new Date().toISOString(), organizationId: QA_ORG_ID, settings: original, asset: originalAsset }, null, 2)
);
console.log(`\n[${TAG}] snapshot saved to ${SNAPSHOT_FILE}`);

const BASE_SETTINGS = {
  notification_email: MAIN_RECIPIENT,
  notify_damage_reports: true,
  notify_support_requests: true,
  notify_tag_request_updates: TAG_SETUP ? true : original.notify_tag_request_updates,
  notify_urgent_reports: false,
  urgent_notification_email: null,
  return_notification_mode: "instant_renter",
  notify_include_photo_previews: true,
};

// ---------------------------------------------------------------------------
// Tag request (operator saves it in /owner later)
// ---------------------------------------------------------------------------

async function ensureTagRequest() {
  const { data: existing, error: readError } = await db
    .from("tag_requests")
    .select("id, status")
    .eq("organization_id", QA_ORG_ID)
    .eq("quantity_notes", TAG_REQUEST_NOTE)
    .in("status", ["requested", "in_review", "in_production", "ready"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (readError) throw new Error(`tag request read failed: ${readError.message}`);
  if (existing.length > 0) return { id: existing[0].id, status: existing[0].status, created: false };

  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("organization_id", QA_ORG_ID)
    .eq("role", "customer_admin")
    .limit(1)
    .maybeSingle();
  const { data: created, error: insertError } = await db
    .from("tag_requests")
    .insert({
      organization_id: QA_ORG_ID,
      requested_by_profile_id: profile?.id ?? null,
      status: "requested",
      material: "QA test only",
      mounting_method: "QA test only",
      tag_size: "QA",
      quantity_notes: TAG_REQUEST_NOTE,
    })
    .select("id, status")
    .single();
  if (insertError || !created) throw new Error(`tag request insert failed: ${insertError?.message}`);
  const { error: assetError } = await db
    .from("tag_request_assets")
    .insert({ tag_request_id: created.id, asset_id: QA_ASSET_ID, quantity: 1, notes: "D5 notification QA" });
  if (assetError) throw new Error(`tag request asset insert failed: ${assetError.message}`);
  return { id: created.id, status: created.status, created: true };
}

// ---------------------------------------------------------------------------
// Scenario runners
// ---------------------------------------------------------------------------

let assetState = { phone: originalAsset.support_phone_override, template: originalAsset.return_inspection_template_key };

async function applyAsset(want = {}) {
  const phone = want.phone === undefined ? QA_PHONES.valid : QA_PHONES[want.phone];
  const template = want.template ?? originalAsset.return_inspection_template_key;
  const patch = {};
  if (phone !== assetState.phone) patch.support_phone_override = phone;
  if (template !== assetState.template) patch.return_inspection_template_key = template;
  if (Object.keys(patch).length > 0) await writeQaAsset(patch);
  assetState = { phone, template };
  return { phone: want.phone ?? "valid", template };
}

function hexToRgb(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? "");
  return match ? `rgb(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)})` : null;
}

/** Compare the captured confirmation page with the scenario's expectation. Returns a list of problems. */
function confirmationProblems(expected, seen) {
  const problems = [];
  if (!seen.sentTo || !seen.hasYourReport) problems.push("missing 'Sent to' / 'has your report'");
  if (seen.mentionsNotified) problems.push("says 'notified'");
  if (seen.emergencyWording) problems.push("emergency wording");
  const want = expected === "fallback-none" && organization.support_phone ? "organization-phone" : expected;
  switch (want) {
    case "none":
    case undefined:
      if (seen.callNowBlock || seen.callNowFlag) problems.push("unexpected call-now block");
      break;
    case "button": {
      if (!seen.callNowBlock || !seen.callNowFlag) problems.push("call-now block missing");
      if (seen.callButtonHref !== VALID_TEL) problems.push("call button tel: href is not the normalized QA number");
      if (seen.callButtonLabel !== `Call ${QA_PHONES.valid}`) problems.push("call button label differs");
      if (!(seen.callButtonWidthRatio >= 0.95)) problems.push("call button is not full width");
      const brand = hexToRgb(organization.primary_color);
      if (brand && seen.callButtonBackground !== brand) problems.push("call button is not in the organization colour");
      break;
    }
    case "fallback-phone":
      if (!seen.callNowBlock) problems.push("call-now block missing");
      if (seen.callButtonHref) problems.push("an unusable phone produced a call button");
      if (!seen.fallbackPhoneLine) problems.push("unusable phone not shown as text");
      break;
    case "fallback-none":
      if (!seen.callNowBlock) problems.push("call-now block missing");
      if (seen.callButtonHref || seen.fallbackPhoneLine) problems.push("a phone was shown although none is set");
      break;
    case "organization-phone":
      if (!seen.callNowBlock || !seen.callButtonHref) problems.push("call-now block with the organization phone missing");
      break;
    default:
      break;
  }
  return problems;
}

async function runPublic(scenario, row, page) {
  const description = `D5 notification QA (${scenario.id}). Automated test data, not a customer report.`;
  let clickedAt;
  let formType;
  if (scenario.kind === "damage" || scenario.kind === "support") {
    formType = scenario.kind === "damage" ? "damage_report" : "support_request";
    const submit = scenario.kind === "damage" ? submitDamage : submitSupport;
    clickedAt = await submit(page, {
      ...RENTER,
      triage: scenario.triage,
      description,
      files: scenario.files ? await scenario.files() : [],
    });
  } else {
    formType = "return_checklist";
    row.rentalOpen = Boolean((await readQaAsset()).active_rental_session_id);
    const outcome = await submitReturn(page, {
      id: scenario.id,
      damage: scenario.damage,
      answers: scenario.answers,
      accessories: scenario.accessories,
      photos: scenario.photos ? await scenario.photos() : {},
    });
    if (outcome.notRun) {
      row.status = "not run";
      row.note = outcome.notRun;
      return;
    }
    clickedAt = outcome.clickedAt;
  }

  Object.assign(row, await awaitConfirmation(page, clickedAt));
  if (row.status !== "submitted") return;

  row.confirmation = await captureConfirmation(page);
  const problems = confirmationProblems(scenario.expect.callNow, row.confirmation);
  row.confirmationOk = problems.length === 0;
  if (problems.length > 0) row.note = `confirmation: ${problems.join("; ")}`;

  const saved = await findSubmission(db, { formType, origin: "public", since: clickedAt, reference: row.reference });
  if (!saved) {
    row.status = "failed";
    row.note = "reference not found in the QA organization";
    return;
  }
  row.submissionId = saved.id;
  row.createdAt = saved.created_at;
}

let staffPage = null;
async function staffSession(browser) {
  if (!qaLogin) return null;
  if (staffPage) return staffPage;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page, qaLogin);
  staffPage = page;
  return page;
}

async function runStaffOutbound(row, browser) {
  const page = await staffSession(browser);
  if (!page) {
    row.status = "not run";
    row.note = "no QA login in the environment";
    return;
  }
  const { mode } = await submitStaffOutbound(page);
  row.status = "done";
  row.note = `outbound ${mode}; rental ${(await readQaAsset()).active_rental_session_id ? "open" : "NOT open"}`;
}

async function runStaffReturn(scenario, row, browser) {
  const page = await staffSession(browser);
  if (!page) {
    row.status = "not run";
    row.note = "no QA login in the environment";
    return;
  }
  const outcome = await submitStaffReturn(page, {
    id: scenario.id,
    damage: scenario.damage,
    answers: scenario.answers,
    accessories: scenario.accessories,
  });
  if (outcome.notRun) {
    row.status = "not run";
    row.note = outcome.notRun;
    return;
  }
  const saved = await findSubmission(db, { formType: "return_checklist", origin: "staff", since: outcome.clickedAt });
  if (!saved) {
    row.status = "failed";
    row.note = "staff return not found in the QA organization";
    return;
  }
  Object.assign(row, {
    status: "submitted",
    reference: saved.reference,
    submissionId: saved.id,
    createdAt: saved.created_at,
    confirmMs: Date.now() - outcome.clickedAt,
    note: `rental ${(await readQaAsset()).active_rental_session_id ? "still open" : "closed"}`,
  });
}

/** The urgent route cannot be switched on without an address: the database refuses it and so does the settings form. */
async function runInvalidUrgent(row, browser) {
  const before = await readQaSettings(db);
  const unchanged = (after) => Object.keys(before).every((key) => after[key] === before[key]);

  const { error } = await db
    .from("organizations")
    .update({ notify_urgent_reports: true, urgent_notification_email: null })
    .eq("id", QA_ORG_ID);
  row.databaseRefusal = error ? error.code ?? "error" : "accepted";
  if (!error) await applySettings(db, before);
  row.databaseUnchanged = unchanged(await readQaSettings(db));

  const page = await staffSession(browser);
  if (page) {
    await page.goto(`${BASE}/dashboard/settings#notifications`, { waitUntil: "domcontentloaded" });
    await page.getByRole("checkbox", { name: /Send immediate-attention reports/ }).check();
    await page.getByLabel("Urgent notification email").fill("");
    await page.getByRole("button", { name: "Save notifications" }).click();
    row.formError = await page
      .getByText("Add an urgent notification email to turn on urgent notifications.")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true, () => false);
    row.formUnchanged = unchanged(await readQaSettings(db));
  } else {
    row.formError = null;
    row.formUnchanged = null;
  }

  const databaseOk = row.databaseRefusal === "23514" && row.databaseUnchanged;
  const formOk = row.formError === true && row.formUnchanged === true;
  row.status = databaseOk && formOk ? "passed" : databaseOk && row.formError === null ? "partial" : "failed";
  row.note =
    `database ${row.databaseRefusal}${row.databaseUnchanged ? ", unchanged" : ", CHANGED"}; ` +
    (row.formError === null ? "settings form not run (no QA login)" : `settings form error ${row.formError ? "shown" : "NOT shown"}${row.formUnchanged ? ", unchanged" : ", CHANGED"}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const results = [];
const startedAt = new Date();
let tagRequest = null;
let settingsLeft = null;
let restored = { settings: false, asset: false };

const browser = await chromium.launch();
try {
  if (TAG_SETUP) {
    tagRequest = await ensureTagRequest();
    console.log(`[${TAG}] QA tag request ${tagRequest.id} (${tagRequest.created ? "created" : "existing"}, ${tagRequest.status})`);
  }

  for (const [index, scenario] of selected.entries()) {
    const row = {
      id: scenario.id,
      kind: scenario.kind,
      expect: scenario.expect,
      settings: null,
      asset: null,
      status: "failed",
      reference: null,
      submissionId: null,
      createdAt: null,
      confirmMs: null,
      note: scenario.note ?? "",
    };
    results.push(row);
    if (scenario.kind === "not-run") {
      row.status = "not run";
      continue;
    }
    if (index > 0) await sleep(INTERVAL_MS);
    console.log(`[${TAG}] ${scenario.id}`);

    const page = PUBLIC_KINDS.has(scenario.kind) ? await browser.newPage({ viewport: { width: 390, height: 844 } }) : null;
    try {
      const settings = { ...BASE_SETTINGS, ...(scenario.settings ?? {}) };
      await applySettings(db, settings);
      row.settings = aliasSettings(settings);
      row.asset = await applyAsset(scenario.asset);

      if (page) await runPublic(scenario, row, page);
      else if (scenario.kind === "staff-outbound") await runStaffOutbound(row, browser);
      else if (scenario.kind === "staff-return") await runStaffReturn(scenario, row, browser);
      else if (scenario.kind === "invalid-urgent") await runInvalidUrgent(row, browser);
    } catch (err) {
      row.status = "failed";
      row.note = errorLine(err);
      // QA forms only — no secret, address or storage path is on these pages. Kept in the gitignored artifact folder.
      const shot = page ?? staffPage;
      if (shot) {
        const file = `${ARTIFACT_DIR}/notification-qa-failure-${scenario.id}.png`;
        await shot.screenshot({ path: file, fullPage: true }).then(() => (row.screenshot = file), () => {});
      }
    } finally {
      if (page) await page.close();
    }
  }
} finally {
  await browser.close();
  // Give the last deferred notification time to read the settings it was submitted under.
  await sleep(20_000);
  restored.asset = await restoreAsset(originalAsset);
  if (LEAVE_DIGEST) {
    settingsLeft = { ...BASE_SETTINGS, return_notification_mode: "daily_exceptions" };
    try {
      await applySettings(db, settingsLeft);
      const after = await readQaSettings(db);
      restored.settings = Object.keys(settingsLeft).every((key) => after[key] === settingsLeft[key]);
    } catch {
      restored.settings = false;
    }
    console.log(
      `\n[${TAG}] QA organization LEFT in daily_exceptions → ${MAIN_ALIAS} mailbox for the next summary: ` +
        `${restored.settings ? "yes (verified)" : "NO — check by hand"}`
    );
    console.log(`[${TAG}] snapshot kept at ${SNAPSHOT_FILE}; after the summary is verified run --restore --confirm`);
  } else {
    restored.settings = await restoreSettings(db, original);
    console.log(`\n[${TAG}] QA organization settings restored: ${restored.settings ? "yes (verified)" : "NO — restore by hand"}`);
    if (restored.settings && restored.asset) renameSync(SNAPSHOT_FILE, restoredSnapshotName());
  }
  console.log(`[${TAG}] QA asset restored: ${restored.asset ? "yes (verified)" : "NO — restore by hand"}`);
}

const endedAt = new Date();

const digestReferences = results
  .filter((row) => row.expect.digest && row.reference && row.createdAt)
  .sort((a, b) => a.expect.digestGroup - b.expect.digestGroup || Date.parse(a.createdAt) - Date.parse(b.createdAt))
  .map((row) => ({ id: row.id, reference: row.reference, group: row.expect.digestGroup, source: row.kind === "staff-return" ? "Staff" : "Renter" }));

const artifactPath = `${ARTIFACT_DIR}/notification-qa-${utcStamp(startedAt)}.json`;
writeFileSync(
  artifactPath,
  JSON.stringify(
    {
      tool: "qa-notification-matrix",
      target: host,
      organizationId: QA_ORG_ID,
      assetId: QA_ASSET_ID,
      shortCode: QA_SHORT_CODE,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      flags: { tagSetup: TAG_SETUP, leaveDigest: LEAVE_DIGEST, operatorMailbox: OPERATOR_MAILBOX, only: ONLY },
      organization: { brandColor: organization.primary_color, supportPhoneSet: Boolean(organization.support_phone) },
      qaPhones: QA_PHONES,
      renter: RENTER,
      tagRequest,
      settingsLeft: settingsLeft ? aliasSettings(settingsLeft) : null,
      restored,
      scenarios: results,
      digestExpectation: { references: digestReferences },
    },
    null,
    2
  )
);

console.log(`\n[${TAG}] Vercel log window (UTC): ${startedAt.toISOString()} → ${endedAt.toISOString()}`);
console.log(`[${TAG}] artifact: ${artifactPath}\n`);
console.log("| Scenario | Status | Reference | Submit→confirm | Expected | Note |");
console.log("|---|---|---|---|---|---|");
for (const row of results) {
  const scenario = SCENARIOS.find((s) => s.id === row.id);
  console.log(
    `| ${row.id} | ${row.status} | ${row.reference ?? "—"} | ${row.confirmMs === null ? "—" : `${row.confirmMs} ms`} | ` +
      `${expectationSummary(scenario)} | ${row.note} |`
  );
}
if (digestReferences.length > 0) {
  console.log(`\nExpected in the next summary (group, then oldest first): ${digestReferences.map((d) => d.reference).join(", ")}`);
}
if (tagRequest) console.log(`\nQA tag request for the operator's saves: ${BASE}/owner/tag-requests/${tagRequest.id}`);

const failed = results.filter(
  (row) => row.status === "failed" || row.status === "rate limited" || row.confirmationOk === false
).length;
console.log(`\n${failed === 0 ? "All run scenarios passed their browser-side checks." : `${failed} scenario(s) need attention.`}\n`);
process.exit(failed > 0 || !restored.asset || !restored.settings ? 1 : 0);
