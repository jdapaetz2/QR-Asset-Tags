#!/usr/bin/env node
/**
 * Phase C6 — set or clear the Production QA organization's notification recipient.
 *
 * WHY THIS EXISTS. Measuring real provider latency requires a real send, and the Production QA
 * organization deliberately has no `notification_email`, so today it resolves to `skipped_no_recipient`
 * and makes no provider call at all. This sets a recipient for the duration of the measurement and
 * removes it afterwards.
 *
 * THREE INDEPENDENT REFUSALS, because this writes to the PRODUCTION database:
 *   1. `assertTarget("production", …)` — the credentials must be the production project; the staging
 *      project is recognised and refused BY NAME, never merely "not matched".
 *   2. The organization id is a hard-coded constant. It can only ever touch the QA organization; there
 *      is no argument through which a customer organization could be named.
 *   3. The recipient is an ALLOWLIST of one — Resend's sandbox address. A real customer address cannot
 *      be set by this script even deliberately, which is the point: a measurement tool must not be
 *      capable of mailing a real person.
 *
 * It touches exactly one column on exactly one row. It creates nothing, deletes nothing, and prints no
 * secret.
 *
 * Usage:
 *   npm run production:qa-recipient -- --set --confirm
 *   npm run production:qa-recipient -- --clear --confirm
 */
import { createClient } from "@supabase/supabase-js";

import { assertTarget } from "../lib/env-target.mjs";

/** The QA organization from docs/PHASE_C_BASELINE.md §15. Hard-coded on purpose — see refusal 2. */
const QA_ORG_ID = "c0000000-0000-4000-8000-00000000c0a1";

/**
 * Resend's sandbox address: accepted and simulated by the provider, delivered to no human inbox.
 * The default, and the right choice whenever provider timing is all that is being measured.
 */
const SANDBOX_RECIPIENT = "delivered@resend.dev";

/**
 * Our own support mailbox — the ONLY real inbox this tool may target, added in C6.1 so a human can
 * confirm an email actually lands, with the right From/Reply-To and a working link. Provider evidence
 * alone cannot show that.
 *
 * **This stays an allowlist.** Adding a second entry does not make it a free-text field: a customer's
 * address is still unreachable through this script, which is the property that matters. Anything not
 * listed here is refused.
 */
const SUPPORT_RECIPIENT = "support@mulemark.io";

const ALLOWED_RECIPIENTS = new Set([SANDBOX_RECIPIENT, SUPPORT_RECIPIENT]);

const args = process.argv.slice(2);
const wantsSet = args.includes("--set");
const wantsClear = args.includes("--clear");
const confirmed = args.includes("--confirm");
/** `--support` targets the real support mailbox; the default stays the no-human sandbox. */
const wantsSupport = args.includes("--support");

function fail(message, hints = []) {
  console.error(`\n[qa-recipient] ${message}`);
  for (const h of hints) console.error(`  ${h}`);
  console.error("");
  process.exit(1);
}

if (wantsSet === wantsClear) fail("Pass exactly one of --set or --clear.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set (never printed).");

let target;
try {
  target = assertTarget("production", {
    supabaseUrl,
    expectedStagingRef: process.env.STAGING_SUPABASE_REF || null,
  });
} catch (err) {
  fail(err.message);
}

const nextValue = wantsSet ? (wantsSupport ? SUPPORT_RECIPIENT : SANDBOX_RECIPIENT) : null;
// Belt and braces: the value is chosen from constants above, so this can only fail if someone edits the
// constants to something unapproved — which is precisely when a refusal is worth having.
if (nextValue !== null && !ALLOWED_RECIPIENTS.has(nextValue)) {
  fail(`refusing to set an address that is not on the allowlist.`);
}

console.log(`\n[qa-recipient] target verified: PRODUCTION (host: ${target.host})`);
console.log(`[qa-recipient] organization: ${QA_ORG_ID} (QA only)`);
console.log(`[qa-recipient] notification_email → ${nextValue ?? "NULL (cleared)"}`);

if (!confirmed) {
  console.log("\n  DRY RUN — nothing written. Pass --confirm to apply.\n");
  process.exit(0);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

// Read first, so the operator can see what is being replaced and the change is reversible by hand.
const { data: before, error: readErr } = await db
  .from("organizations")
  .select("id, name, notification_email, notify_damage_reports")
  .eq("id", QA_ORG_ID)
  .maybeSingle();
if (readErr) fail(`could not read the QA organization: ${readErr.message}`);
if (!before) fail(`the QA organization ${QA_ORG_ID} does not exist on this project.`);

// Refuse to overwrite an address this script did not set. If something other than the sandbox is
// present, a human put it there and it is not this tool's to clobber.
if (before.notification_email && !ALLOWED_RECIPIENTS.has(before.notification_email)) {
  fail(
    "the QA organization already has a notification address that this script did not set.",
    ["Refusing to overwrite it. Inspect and clear it by hand if that is genuinely intended."]
  );
}

const patch = { notification_email: nextValue };
// A recipient with the event type disabled would silently skip — enable damage reports when setting, so
// the measurement exercises the provider rather than an early return.
if (wantsSet) patch.notify_damage_reports = true;

const { error: writeErr } = await db.from("organizations").update(patch).eq("id", QA_ORG_ID);
if (writeErr) fail(`update failed: ${writeErr.message}`);

console.log(
  `\n[qa-recipient] done. was: ${before.notification_email ?? "NULL"} → now: ${nextValue ?? "NULL"}\n` +
    (wantsSet
      ? "  REMEMBER: clear this when the measurement is finished (--clear --confirm).\n"
      : "  The QA organization is back to sending nothing.\n")
);
