import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest, type DigestSend } from "@/lib/notifications/digest-worker";
import { digestSlot } from "@/lib/notifications/digest-window";
import { submissionReference } from "@/lib/submissions/inbox";

/**
 * Engineering Phase D3B — fixed staging check (`npm run digest:staging-check`, env from `.env.staging.local`).
 *
 * Proves migration 0036 and the real store/worker against the STAGING database without waiting for 6 AM and without
 * sending email: an injected 6:30 AM Pacific clock on a past date (the current month/day, 25 years ago, so windows
 * keep moving forward and never collide with real data), one QA organization, and a fake sender.
 *
 * Bounded writes: one disposable return checklist (deleted afterwards), the QA organization's notification settings
 * (restored afterwards), and ledger rows for past windows (bookkeeping only; cron never runs on staging).
 */

const PRODUCTION_REF = "apeiswnkheiwrpvumder";
const QA_SHORT_CODE = "stg-qa-public";
const CHECK_RECIPIENT = "digest-check@mulemark-staging.invalid";

function stagingClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const expected = process.env.STAGING_SUPABASE_REF ?? "";
  const ref = /^https:\/\/([a-z0-9]{16,})\.supabase\.co$/.exec(url.replace(/\/$/, ""))?.[1] ?? null;
  if (!expected || !ref || ref !== expected || ref === PRODUCTION_REF || !key) {
    throw new Error("refusing to run: this check only targets the declared STAGING project (.env.staging.local)");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** 6:30 AM Pacific today's month/day, 25 years ago — trying both UTC slots, exactly like the cron. */
function checkClock(): Date {
  const today = new Date();
  const year = today.getUTCFullYear() - 25;
  const date = `${year}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  for (const hour of ["13", "14"]) {
    const candidate = new Date(`${date}T${hour}:30:00.000Z`);
    if (digestSlot(candidate).inWindow) return candidate;
  }
  throw new Error("no in-window slot for the check date");
}

let client: SupabaseClient;
let organizationId = "";
let original: { notification_email: string | null; return_notification_mode: string } | null = null;
let submissionId = "";
let reference = "";
const now = checkClock();

function run(send: DigestSend) {
  return runReturnDigest({
    store: createDigestStore(client),
    send,
    now: () => now,
    siteUrl: "https://mulemark.io",
    replyTo: "",
    log: () => {},
    logRun: () => {},
    onlyOrganizationIds: [organizationId],
  });
}

beforeAll(async () => {
  client = stagingClient();

  const { data: link, error: linkError } = await client
    .from("qr_links")
    .select("organization_id, asset_id")
    .eq("short_code", QA_SHORT_CODE)
    .single<{ organization_id: string; asset_id: string }>();
  if (linkError || !link) throw new Error("staging QA organization not found");
  organizationId = link.organization_id;

  const { data: org, error: orgError } = await client
    .from("organizations")
    .select("notification_email, return_notification_mode")
    .eq("id", organizationId)
    .single<{ notification_email: string | null; return_notification_mode: string }>();
  if (orgError || !org) throw new Error("staging QA organization settings unreadable");
  original = org;

  const { error: settingsError } = await client
    .from("organizations")
    .update({ notification_email: CHECK_RECIPIENT, return_notification_mode: "daily_exceptions" })
    .eq("id", organizationId);
  if (settingsError) throw new Error("could not set the QA organization's summary settings");

  const slot = digestSlot(now);
  if (!slot.inWindow) throw new Error("clock outside window");
  submissionId = randomUUID();
  const createdAt = new Date(slot.cutoff.getTime() - 60 * 60 * 1000).toISOString();
  const { error: insertError } = await client.from("form_submissions").insert({
    id: submissionId,
    organization_id: organizationId,
    asset_id: link.asset_id,
    form_type: "return_checklist",
    status: "new",
    created_at: createdAt,
    submitted_by_name: "D3B staging digest check",
    submission_data_json: { damage_observed: "yes", accessories_returned: "yes" },
    media_urls: [],
  });
  if (insertError) throw new Error("could not insert the disposable return checklist");
  reference = submissionReference(submissionId, createdAt);
});

afterAll(async () => {
  if (!client) return;
  if (submissionId) await client.from("form_submissions").delete().eq("id", submissionId);
  if (original && organizationId) {
    await client.from("organizations").update(original).eq("id", organizationId);
  }
});

describe("daily return-exceptions summary on staging (fake sender, injected clock)", () => {
  it("claims the window, builds the summary from staging data, and records it as sent", async () => {
    const captured: { to: string; subject: string; text: string }[] = [];
    const result = await run(async (to, content) => {
      captured.push({ to, subject: content.subject, text: content.text });
      return { outcome: "sent", attempts: 1, providerId: "staging-check", status: 200 };
    });
    expect(result.outcome).toBe("completed");
    expect(result.sent).toBe(1);
    expect(captured).toHaveLength(1);
    expect(captured[0].to).toBe(CHECK_RECIPIENT);
    expect(captured[0].subject).toMatch(/^Return exceptions summary - \d+ returns? with exceptions$/);
    expect(captured[0].text).toContain(reference);

    const { data: runs } = await client
      .from("notification_digest_runs")
      .select("status, item_count, provider_id")
      .eq("organization_id", organizationId)
      .order("window_end", { ascending: false })
      .limit(1);
    expect(runs?.[0]).toMatchObject({ status: "sent", provider_id: "staging-check" });
  });

  it("a duplicate invocation for the same window sends nothing", async () => {
    let calls = 0;
    const result = await run(async () => {
      calls++;
      return { outcome: "sent", attempts: 1, providerId: "should-not-happen", status: 200 };
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({ outcome: "completed", sent: 0, skipped: 1 });
  });
});
