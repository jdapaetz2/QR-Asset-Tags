import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET,
  ORG_A,
  ORG_B,
  ORG_C_SUSPENDED,
  anonClient,
  serviceClient,
  signInAs,
} from "../setup/fixtures";
import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest, type DigestSend } from "@/lib/notifications/digest-worker";
import { submissionReference } from "@/lib/submissions/inbox";

// Executed — Engineering Phase D3B daily return-exceptions summary against the real local database: the private run
// ledger (migration 0036), organization and origin scope, cross-org isolation, suspended organizations, the unique
// window claim, and catch-up after a failed send. A fake sender captures the email; nothing is sent.

const V1_DAMAGE = { damage_observed: "yes", accessories_returned: "yes" };
const V1_MISSING = { damage_observed: "no", accessories_returned: "no" };
const V1_CLEAN = { damage_observed: "no", accessories_returned: "yes" };

// Fixed winter dates (PST): the 14:00 UTC slot is the 6 AM Pacific hour. Far from any other test's data.
const DAY1 = new Date("2025-01-15T14:30:00.000Z");
const DAY1_CUTOFF = "2025-01-15T14:00:00+00:00";
const DAY2 = new Date("2025-01-16T14:30:00.000Z");
const DAY3 = new Date("2025-01-17T14:30:00.000Z");

const inserted: string[] = [];

async function insertReturn(
  organizationId: string,
  assetId: string,
  createdAt: string,
  data: unknown,
  origin: "public" | "staff"
): Promise<{ id: string; reference: string }> {
  const id = randomUUID();
  const admin = serviceClient();
  const { error } = await admin.from("form_submissions").insert({
    id,
    organization_id: organizationId,
    asset_id: assetId,
    form_type: "return_checklist",
    status: "new",
    created_at: createdAt,
    submission_data_json: data,
    media_urls: [],
  });
  if (error) throw new Error(`seed return failed: ${error.message}`);
  // The insert trigger (0028) stamps service-role inserts as `public`; staff rows are corrected after insert.
  if (origin === "staff") {
    const { error: originError } = await admin.from("form_submissions").update({ submission_origin: "staff" }).eq("id", id);
    if (originError) throw new Error(`seed staff origin failed: ${originError.message}`);
  }
  inserted.push(id);
  return { id, reference: submissionReference(id, createdAt) };
}

type Captured = { to: string; subject: string; text: string; key?: string };

function capture(outcomes: Record<string, "sent" | "failed_transient"> = {}) {
  const sent: Captured[] = [];
  const send: DigestSend = async (to, content, options) => {
    sent.push({ to, subject: content.subject, text: content.text, key: options.idempotencyKey });
    return outcomes[to] === "failed_transient"
      ? { outcome: "failed_transient", attempts: 3, failureClass: "http_503", status: 503 }
      : { outcome: "sent", attempts: 1, providerId: `fake-${sent.length}`, status: 200 };
  };
  return { sent, send };
}

function run(now: Date, send: DigestSend) {
  return runReturnDigest({
    store: createDigestStore(serviceClient()),
    send,
    now: () => now,
    siteUrl: "https://mulemark.io",
    replyTo: "",
    log: () => {},
    logRun: () => {},
    onlyOrganizationIds: [ORG_A, ORG_B, ORG_C_SUSPENDED],
  });
}

async function runsFor(organizationId: string) {
  const { data, error } = await serviceClient()
    .from("notification_digest_runs")
    .select("status, window_start, window_end, item_count, failure_class")
    .eq("organization_id", organizationId)
    .order("window_end", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

const EMAIL_A = "digest.a@orga.a3test";
const EMAIL_B = "digest.b@orgb.a3test";
const EMAIL_C = "digest.c@orgc.a3test";

async function resetOrganizations() {
  const admin = serviceClient();
  for (const id of [ORG_A, ORG_B, ORG_C_SUSPENDED]) {
    await admin.from("notification_digest_runs").delete().eq("organization_id", id);
    await admin.from("organizations").update({ notification_email: null, return_notification_mode: "off" }).eq("id", id);
  }
}

describe("notification_digest_runs — private ledger (migration 0036)", () => {
  let adminA: SupabaseClient;
  let staffA: SupabaseClient;

  beforeAll(async () => {
    adminA = await signInAs("admin_a");
    staffA = await signInAs("staff_a");
  });

  it("no client role can read or write it; the service role can", async () => {
    const row = {
      organization_id: ORG_A,
      digest_type: "return_exceptions",
      window_start: "2024-01-01T14:00:00Z",
      window_end: "2024-01-02T14:00:00Z",
      status: "sent",
    };
    for (const [label, client] of [["anon", anonClient()], ["admin_a", adminA], ["staff_a", staffA]] as const) {
      const read = await client.from("notification_digest_runs").select("id").eq("organization_id", ORG_A);
      expect(read.error, `${label}/digest_runs/select should be denied`).toBeTruthy();
      const write = await client.from("notification_digest_runs").insert(row);
      expect(write.error, `${label}/digest_runs/insert should be denied`).toBeTruthy();
    }
    const service = await serviceClient().from("notification_digest_runs").insert(row).select("id").single();
    expect(service.error?.message ?? null, "service_role/digest_runs/insert").toBeNull();
    await serviceClient().from("notification_digest_runs").delete().eq("id", service.data!.id);
  });

  it("the unique window key rejects a second run for the same organization and cutoff", async () => {
    const row = {
      organization_id: ORG_A,
      digest_type: "return_exceptions",
      window_start: "2024-02-01T14:00:00Z",
      window_end: "2024-02-02T14:00:00Z",
      status: "processing",
    };
    const first = await serviceClient().from("notification_digest_runs").insert(row).select("id").single();
    expect(first.error).toBeNull();
    const second = await serviceClient().from("notification_digest_runs").insert({ ...row, status: "failed" });
    expect(second.error?.code).toBe("23505");
    await serviceClient().from("notification_digest_runs").delete().eq("id", first.data!.id);
  });
});

describe("the daily summary worker against the local database", () => {
  const refs: Record<string, string> = {};

  beforeAll(async () => {
    await resetOrganizations();
    const admin = serviceClient();
    await admin.from("organizations").update({ notification_email: EMAIL_A, return_notification_mode: "daily_exceptions" }).eq("id", ORG_A);
    await admin.from("organizations").update({ notification_email: EMAIL_B, return_notification_mode: "instant_renter" }).eq("id", ORG_B);
    await admin.from("organizations").update({ notification_email: EMAIL_C, return_notification_mode: "daily_exceptions" }).eq("id", ORG_C_SUSPENDED);

    refs.aRenter = (await insertReturn(ORG_A, ASSET.A_PUBLIC, "2025-01-14T20:00:00.000Z", V1_DAMAGE, "public")).reference;
    refs.aStaff = (await insertReturn(ORG_A, ASSET.A_PUBLIC, "2025-01-14T21:00:00.000Z", V1_MISSING, "staff")).reference;
    refs.aClean = (await insertReturn(ORG_A, ASSET.A_PUBLIC, "2025-01-14T22:00:00.000Z", V1_CLEAN, "public")).reference;
    refs.aBefore = (await insertReturn(ORG_A, ASSET.A_PUBLIC, "2025-01-13T20:00:00.000Z", V1_DAMAGE, "public")).reference;
    refs.bRenter = (await insertReturn(ORG_B, ASSET.B_PUBLIC, "2025-01-14T20:30:00.000Z", V1_DAMAGE, "public")).reference;
    refs.bStaff = (await insertReturn(ORG_B, ASSET.B_PUBLIC, "2025-01-14T21:30:00.000Z", V1_DAMAGE, "staff")).reference;
    refs.cStaff = (await insertReturn(ORG_C_SUSPENDED, ASSET.C_PUBLIC, "2025-01-14T21:45:00.000Z", V1_DAMAGE, "staff")).reference;
  });

  afterAll(async () => {
    await resetOrganizations();
    if (inserted.length) await serviceClient().from("form_submissions").delete().in("id", inserted);
  });

  it("day 1: each organization gets its own scope; a suspended organization gets nothing", async () => {
    const { sent, send } = capture();
    const result = await run(DAY1, send);
    expect(result).toMatchObject({ outcome: "completed", sent: 2 });

    const a = sent.find((s) => s.to === EMAIL_A)!;
    expect(a.subject).toBe("Return exceptions summary - 2 returns with exceptions");
    expect(a.text).toContain(refs.aRenter);
    expect(a.text).toContain(refs.aStaff);
    expect(a.text).not.toContain(refs.aClean);
    expect(a.text).not.toContain(refs.aBefore);
    // Cross-org isolation: nothing of B's or C's.
    for (const foreign of [refs.bRenter, refs.bStaff, refs.cStaff]) expect(a.text).not.toContain(foreign);

    const b = sent.find((s) => s.to === EMAIL_B)!;
    expect(b.text).toContain(refs.bStaff);
    expect(b.text).not.toContain(refs.bRenter); // instant_renter: renter returns already emailed individually
    for (const foreign of [refs.aRenter, refs.aStaff, refs.cStaff]) expect(b.text).not.toContain(foreign);

    expect(sent.some((s) => s.to === EMAIL_C)).toBe(false);
    expect(await runsFor(ORG_C_SUSPENDED)).toEqual([]);
    expect(await runsFor(ORG_A)).toEqual([
      expect.objectContaining({ status: "sent", item_count: 2, window_end: DAY1_CUTOFF }),
    ]);
  });

  it("a duplicate day-1 invocation sends nothing more", async () => {
    const { sent, send } = capture();
    const result = await run(new Date("2025-01-15T14:55:00.000Z"), send);
    expect(sent).toEqual([]);
    expect(result.skipped).toBe(2);
    expect(await runsFor(ORG_A)).toHaveLength(1);
  });

  it("day 2: a failed send is recorded and does not advance; a quiet organization records skipped_quiet", async () => {
    refs.aDay2 = (await insertReturn(ORG_A, ASSET.A_PUBLIC, "2025-01-15T20:00:00.000Z", V1_DAMAGE, "public")).reference;
    const { sent, send } = capture({ [EMAIL_A]: "failed_transient" });
    const result = await run(DAY2, send);
    expect(result).toMatchObject({ failed: 1, quiet: 1 });
    expect(sent.map((s) => s.to)).toEqual([EMAIL_A]);
    expect((await runsFor(ORG_A)).at(-1)).toMatchObject({ status: "failed", failure_class: "http_503" });
    expect((await runsFor(ORG_B)).at(-1)).toMatchObject({ status: "skipped_quiet", item_count: 0 });
  });

  it("day 3: the retry covers everything since the last success, including the failed day's return", async () => {
    const { sent, send } = capture();
    await run(DAY3, send);
    const a = sent.find((s) => s.to === EMAIL_A)!;
    expect(a.text).toContain(refs.aDay2);
    const last = (await runsFor(ORG_A)).at(-1)!;
    expect(last).toMatchObject({ status: "sent", window_start: DAY1_CUTOFF });
    // Same recipient and a new window → a different provider key than the failed day-2 attempt.
    expect(a.key).toMatch(/^mm\.return_digest\./);
  });
});
