#!/usr/bin/env node
/**
 * Engineering Phase D5 — read-only report of the Production notification configuration.
 *
 * WHAT IT SHOWS
 *   - every organization's return mode and switches, with each recipient address reduced to "not set", its domain,
 *     or the allowlisted QA alias — never a full customer address, never an organization name;
 *   - which organizations the daily return-exceptions summary would consider (active, mode not `off`) and which have
 *     a usable address;
 *   - the summary ledger (`notification_digest_runs`) by window, and the QA organization's last five runs;
 *   - the QA asset's template, whether a support-phone override is set and whether a rental is open;
 *   - the QA organization's tag requests (id, status, delivered_at).
 *
 * It SELECTs only. It writes nothing, and it prints no key, no storage path, no signed URL.
 *
 * Usage: npm run production:notification-config
 */
import { existsSync } from "node:fs";

import {
  ALLOWED_RECIPIENTS,
  NOTIFICATION_COLUMNS,
  QA_ASSET_ID,
  QA_ORG_ID,
  connectProduction,
  recipientAlias,
  refuse,
} from "./lib/qa-forms.mjs";

const TAG = "notification-config";
const SNAPSHOT_FILE = "qa-artifacts/notification-qa-snapshot.json";
const ORG_LIMIT = 1000;
/** Mirrors lib/notifications/settings.ts#isValidNotificationEmail. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (process.argv.length > 2) refuse(TAG, "this report takes no arguments.");

const { db, host } = connectProduction(TAG);

function addressSummary(address) {
  if (!address || address.trim().length === 0) return "not set";
  if (ALLOWED_RECIPIENTS.has(address)) return `QA ${recipientAlias(address)}`;
  const valid = EMAIL_RE.test(address.trim()) && address.length <= 254;
  const at = address.lastIndexOf("@");
  const domain = at > 0 ? `@${address.slice(at + 1).trim().toLowerCase()}` : "no domain";
  return `set (${domain})${valid ? "" : " INVALID"}`;
}

const yn = (value) => (value ? "Y" : "N");
const shortId = (id) => (id === QA_ORG_ID ? `${id.slice(0, 8)} (QA)` : id.slice(0, 8));

function fail(what, error) {
  console.error(`\n[${TAG}] ${what} failed: ${error.message}\n`);
  process.exit(1);
}

console.log(`\n[${TAG}] PRODUCTION (host: ${host}) — read-only\n`);

// ---- Organizations ---------------------------------------------------------
const { data: orgs, error: orgError } = await db
  .from("organizations")
  .select(`id, status, ${NOTIFICATION_COLUMNS}`)
  .order("id", { ascending: true })
  .limit(ORG_LIMIT);
if (orgError) fail("organization read", orgError);

console.log("| Org | Status | Return mode | Damage | Support | Tag | Urgent | Previews | Main address | Urgent address | Summary |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const totals = { organizations: 0, active: 0, modes: {}, summaryEligible: 0, summaryWithAddress: 0 };
for (const org of orgs) {
  totals.organizations++;
  if (org.status === "active") totals.active++;
  totals.modes[org.return_notification_mode] = (totals.modes[org.return_notification_mode] ?? 0) + 1;
  const eligible = org.status === "active" && org.return_notification_mode !== "off";
  const usable = Boolean(org.notification_email && EMAIL_RE.test(org.notification_email.trim()));
  if (eligible) totals.summaryEligible++;
  if (eligible && usable) totals.summaryWithAddress++;
  const summary = !eligible ? "—" : usable ? "would send when exceptions exist" : "skipped (no usable address)";
  console.log(
    `| ${shortId(org.id)} | ${org.status} | ${org.return_notification_mode} | ${yn(org.notify_damage_reports)} | ` +
      `${yn(org.notify_support_requests)} | ${yn(org.notify_tag_request_updates)} | ${yn(org.notify_urgent_reports)} | ` +
      `${yn(org.notify_include_photo_previews)} | ${addressSummary(org.notification_email)} | ` +
      `${addressSummary(org.urgent_notification_email)} | ${summary} |`
  );
}
console.log(
  `\nOrganizations: ${totals.organizations}${orgs.length === ORG_LIMIT ? " (limit reached — list truncated)" : ""}, ` +
    `active ${totals.active}. Return modes: ${Object.entries(totals.modes).map(([mode, n]) => `${mode} ${n}`).join(", ")}.`
);
console.log(
  `Daily summary considers ${totals.summaryEligible} organization(s); ${totals.summaryWithAddress} have a usable address.`
);

// ---- Summary ledger --------------------------------------------------------
const { data: runs, error: runError } = await db
  .from("notification_digest_runs")
  .select("organization_id, window_start, window_end, status, item_count, failure_class, provider_id, created_at, completed_at")
  .order("window_end", { ascending: false })
  .limit(200);
if (runError) fail("ledger read", runError);

const byWindow = new Map();
for (const run of runs) {
  const entry = byWindow.get(run.window_end) ?? { sent: 0, skipped_quiet: 0, failed: 0, processing: 0 };
  entry[run.status] = (entry[run.status] ?? 0) + 1;
  byWindow.set(run.window_end, entry);
}
console.log("\nSummary ledger by window (latest 10; all organizations, counts only):\n");
console.log("| Window end (UTC) | sent | skipped_quiet | failed | processing |");
console.log("|---|---|---|---|---|");
for (const [windowEnd, entry] of [...byWindow.entries()].slice(0, 10)) {
  console.log(`| ${new Date(windowEnd).toISOString()} | ${entry.sent} | ${entry.skipped_quiet} | ${entry.failed} | ${entry.processing} |`);
}
if (byWindow.size === 0) console.log("| — | — | — | — | — |");

const qaRuns = runs.filter((run) => run.organization_id === QA_ORG_ID).slice(0, 5);
console.log("\nQA organization — last 5 summary runs:\n");
console.log("| Window start (UTC) | Window end (UTC) | Status | Items | Failure class | Provider id | Completed (UTC) |");
console.log("|---|---|---|---|---|---|---|");
for (const run of qaRuns) {
  console.log(
    `| ${new Date(run.window_start).toISOString()} | ${new Date(run.window_end).toISOString()} | ${run.status} | ` +
      `${run.item_count} | ${run.failure_class ?? "—"} | ${run.provider_id ? "recorded" : "—"} | ` +
      `${run.completed_at ? new Date(run.completed_at).toISOString() : "—"} |`
  );
}
if (qaRuns.length === 0) console.log("| — | — | none | — | — | — | — |");

// ---- QA asset and tag requests ----------------------------------------------
const { data: asset, error: assetError } = await db
  .from("assets")
  .select("asset_code, return_inspection_template_key, support_phone_override, active_rental_session_id")
  .eq("id", QA_ASSET_ID)
  .eq("organization_id", QA_ORG_ID)
  .maybeSingle();
if (assetError) fail("QA asset read", assetError);
if (asset) {
  console.log(
    `\nQA asset ${asset.asset_code}: template ${asset.return_inspection_template_key ?? "—"}, ` +
      `support phone override ${asset.support_phone_override ? "set" : "not set"}, ` +
      `rental ${asset.active_rental_session_id ? "open" : "none open"}.`
  );
} else {
  console.log("\nQA asset: not found.");
}

const { data: tagRequests, error: tagError } = await db
  .from("tag_requests")
  .select("id, status, delivered_at, updated_at")
  .eq("organization_id", QA_ORG_ID)
  .order("created_at", { ascending: false })
  .limit(5);
if (tagError) fail("QA tag request read", tagError);
console.log("\nQA organization tag requests (latest 5):\n");
console.log("| Id | Status | Delivered at (UTC) | Updated at (UTC) |");
console.log("|---|---|---|---|");
for (const request of tagRequests) {
  console.log(
    `| ${request.id} | ${request.status} | ${request.delivered_at ? new Date(request.delivered_at).toISOString() : "—"} | ` +
      `${new Date(request.updated_at).toISOString()} |`
  );
}
if (tagRequests.length === 0) console.log("| — | none | — | — |");

console.log(`\nNotification QA snapshot waiting to be restored: ${existsSync(SNAPSHOT_FILE) ? "YES" : "no"}\n`);
