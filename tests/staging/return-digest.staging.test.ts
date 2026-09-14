import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest, type DigestRunResult } from "@/lib/notifications/digest-worker";
import { digestSlot, formatPacific } from "@/lib/notifications/digest-window";
import type { EmailContent } from "@/lib/notifications/email";
import type { SendResult } from "@/lib/notifications/send";
import { submissionReference } from "@/lib/submissions/inbox";

/**
 * Engineering Phases D3B and D5 — fixed staging check (`npm run digest:staging-check`, env from `.env.staging.local`).
 *
 * Runs the real daily return-exceptions worker and database store against the STAGING project with injected clocks and
 * a fake sender (no email), on a fixed timeline in 2001 so it never meets real data:
 *
 *   - one of the two UTC schedules proceeds on a PDT date (13:00 UTC) and on a PST date (14:00 UTC);
 *   - daily_exceptions lists renter and staff exceptions grouped by asset (D5.1: open returns first — most serious
 *     issue, then oldest — then resolved or archived), with status, Pacific submitted time, photo count and
 *     authenticated links, no images, and never another organization's return;
 *   - a duplicate invocation sends nothing; a quiet day records `skipped_quiet`;
 *   - instant_renter lists staff exceptions only; off excludes the organization;
 *   - a missed or failed day is caught up (a failed send never advances the window);
 *   - more than 15 returns: 15 listed, the rest pointed to Submissions.
 *
 * Bounded writes: disposable return checklists on the two staging QA organizations (deleted afterwards), their
 * notification settings (restored afterwards), and ledger rows for 2001 windows (deleted before and after; cron never
 * runs on staging).
 */

const PRODUCTION_REF = "apeiswnkheiwrpvumder";
const QA_SHORT_CODE = "stg-qa-public";
const ORG_B_ID = "5ac00000-0000-4000-8000-00000057a620";
const RECIPIENT_A = "digest-check@mulemark-staging.invalid";
const RECIPIENT_B = "digest-check-b@mulemark-staging.invalid";
const SITE = "https://mulemark.io";
/** Every window this check creates ends before this instant; older ledger rows are this check's bookkeeping. */
const HISTORY_BOUND = "2010-01-01T00:00:00.000Z";
/** Never a real object: proves a stored path is counted, not rendered. */
const PLACEHOLDER_MEDIA = ["qa-digest-check/placeholder-one.jpg", "qa-digest-check/placeholder-two.jpg"];

const DAMAGE = { damage_observed: "yes", accessories_returned: "yes" };
const MISSING = { damage_observed: "no", accessories_returned: "no" };
const CLEAN = { damage_observed: "no", accessories_returned: "yes" };

type OrgKey = "A" | "B";
type OrgSettings = { notification_email: string | null; return_notification_mode: string };
type Seed = {
  key: string;
  org?: OrgKey;
  origin?: "public" | "staff";
  createdAt: string;
  data: Record<string, unknown>;
  status?: string;
  media?: string[];
};
type Captured = { to: string; content: EmailContent };

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

let client: SupabaseClient;
const orgs: Record<OrgKey, { id: string; assetId: string }> = { A: { id: "", assetId: "" }, B: { id: ORG_B_ID, assetId: "" } };
const originals = new Map<string, OrgSettings>();
const seeded = new Map<string, { id: string; reference: string }>();

const ref = (key: string) => (seeded.get(key) as { reference: string }).reference;
const idOf = (key: string) => (seeded.get(key) as { id: string }).id;

async function setMode(org: OrgKey, mode: string) {
  const { error } = await client
    .from("organizations")
    .update({ notification_email: org === "A" ? RECIPIENT_A : RECIPIENT_B, return_notification_mode: mode })
    .eq("id", orgs[org].id);
  if (error) throw new Error(`could not set organization ${org}'s summary settings`);
}

async function clearHistory() {
  const { error } = await client
    .from("notification_digest_runs")
    .delete()
    .in("organization_id", [orgs.A.id, orgs.B.id])
    .lt("window_end", HISTORY_BOUND);
  if (error) throw new Error("could not clear this check's ledger history");
}

/** Insert disposable return checklists. Staff origin is set afterwards: an anonymous insert is always public (0028). */
async function seed(seeds: Seed[]) {
  const rows = seeds.map((s) => {
    const org = orgs[s.org ?? "A"];
    const id = randomUUID();
    seeded.set(s.key, { id, reference: submissionReference(id, s.createdAt) });
    return {
      id,
      organization_id: org.id,
      asset_id: org.assetId,
      form_type: "return_checklist",
      status: s.status ?? "new",
      created_at: s.createdAt,
      submitted_by_name: "D5 staging digest check",
      submission_data_json: s.data,
      media_urls: s.media ?? [],
    };
  });
  const { error } = await client.from("form_submissions").insert(rows);
  if (error) throw new Error("could not insert the disposable return checklists");
  const staff = seeds.filter((s) => s.origin === "staff").map((s) => idOf(s.key));
  if (staff.length > 0) {
    const { error: staffError } = await client
      .from("form_submissions")
      .update({ submission_origin: "staff", rental_session_id: null })
      .in("id", staff);
    if (staffError) throw new Error("could not mark the staff return checklists");
  }
}

async function runAt(
  iso: string,
  only: OrgKey[],
  outcome: SendResult["outcome"] = "sent"
): Promise<{ result: DigestRunResult; captured: Captured[] }> {
  const captured: Captured[] = [];
  const result = await runReturnDigest({
    store: createDigestStore(client),
    send: async (to, content) => {
      captured.push({ to, content });
      return outcome === "sent"
        ? { outcome, attempts: 1, providerId: "staging-check", status: 200 }
        : { outcome, attempts: 3, status: 503, failureClass: "provider_5xx" };
    },
    now: () => new Date(iso),
    siteUrl: SITE,
    replyTo: "",
    log: () => {},
    logRun: () => {},
    onlyOrganizationIds: only.map((org) => orgs[org].id),
  });
  return { result, captured };
}

async function ledgerRow(org: OrgKey, windowEnd: string) {
  const { data, error } = await client
    .from("notification_digest_runs")
    .select("status, item_count, failure_class, window_start, provider_id")
    .eq("organization_id", orgs[org].id)
    .eq("window_end", windowEnd)
    .maybeSingle<{ status: string; item_count: number; failure_class: string | null; window_start: string; provider_id: string | null }>();
  if (error) throw new Error("ledger read failed");
  return data ? { ...data, window_start: new Date(data.window_start).toISOString() } : null;
}

const utc = (iso: string) => new Date(iso).toISOString();

beforeAll(async () => {
  client = stagingClient();

  const { data: link, error: linkError } = await client
    .from("qr_links")
    .select("organization_id, asset_id")
    .eq("short_code", QA_SHORT_CODE)
    .single<{ organization_id: string; asset_id: string }>();
  if (linkError || !link) throw new Error("staging QA organization not found");
  orgs.A = { id: link.organization_id, assetId: link.asset_id };
  if (orgs.A.id === ORG_B_ID) throw new Error("staging QA organizations A and B must differ");

  const { data: assetB, error: assetError } = await client
    .from("assets")
    .select("id")
    .eq("organization_id", ORG_B_ID)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (assetError || !assetB) throw new Error("staging QA organization B has no asset");
  orgs.B.assetId = assetB.id;

  for (const org of ["A", "B"] as const) {
    const { data, error } = await client
      .from("organizations")
      .select("status, notification_email, return_notification_mode")
      .eq("id", orgs[org].id)
      .single<OrgSettings & { status: string }>();
    if (error || !data) throw new Error(`staging QA organization ${org} settings unreadable`);
    if (data.status !== "active") throw new Error(`staging QA organization ${org} is not active`);
    originals.set(orgs[org].id, {
      notification_email: data.notification_email,
      return_notification_mode: data.return_notification_mode,
    });
  }

  await clearHistory();
  await setMode("A", "daily_exceptions");
  await setMode("B", "daily_exceptions");
});

afterAll(async () => {
  if (!client) return;
  const ids = [...seeded.values()].map((row) => row.id);
  for (let i = 0; i < ids.length; i += 100) {
    await client.from("form_submissions").delete().in("id", ids.slice(i, i + 100));
  }
  if (orgs.A.id) await clearHistory().catch(() => {});
  for (const [id, settings] of originals) {
    await client.from("organizations").update(settings).eq("id", id);
  }
});

describe("daily return-exceptions summary on staging (fake sender, injected clocks)", () => {
  it("exactly one of the two UTC schedules proceeds on a PDT date and on a PST date", async () => {
    const cases: [string, boolean, number][] = [
      ["2001-07-10T13:30:00.000Z", true, 6], // 6:30 AM PDT
      ["2001-07-10T14:30:00.000Z", false, 7],
      ["2001-01-10T13:30:00.000Z", false, 5], // 5:30 AM PST
      ["2001-01-10T14:30:00.000Z", true, 6],
    ];
    for (const [iso, inWindow, hour] of cases) {
      const { result, captured } = await runAt(iso, []);
      expect(result.outcome).toBe(inWindow ? "completed" : "outside_window");
      expect(result.pacificHour).toBe(hour);
      expect(captured).toHaveLength(0);
    }
    expect(digestSlot(new Date("2001-07-10T13:30:00.000Z"))).toMatchObject({
      inWindow: true,
      cutoff: new Date("2001-07-10T13:00:00.000Z"),
    });
    expect(digestSlot(new Date("2001-01-10T14:30:00.000Z"))).toMatchObject({
      inWindow: true,
      cutoff: new Date("2001-01-10T14:00:00.000Z"),
    });
  });

  it("daily_exceptions: one summary per organization, renter and staff exceptions, ordered, text only", async () => {
    await seed([
      { key: "a0", createdAt: "2001-01-09T14:00:00.000Z", data: DAMAGE }, // exactly the window start: excluded
      { key: "a1", createdAt: "2001-01-09T18:00:00.000Z", data: MISSING },
      { key: "a2", origin: "staff", createdAt: "2001-01-10T02:00:00.000Z", data: DAMAGE, status: "resolved" },
      { key: "a3", createdAt: "2001-01-10T05:00:00.000Z", data: DAMAGE, media: PLACEHOLDER_MEDIA },
      { key: "a4", createdAt: "2001-01-10T06:00:00.000Z", data: CLEAN },
      { key: "a5", createdAt: "2001-01-10T14:00:00.000Z", data: DAMAGE }, // exactly the cutoff: included
      { key: "b1", org: "B", createdAt: "2001-01-10T03:00:00.000Z", data: DAMAGE },
    ]);

    const { result, captured } = await runAt("2001-01-10T14:30:00.000Z", ["A", "B"]);
    expect(result).toMatchObject({ outcome: "completed", sent: 2 });
    const a = captured.find((c) => c.to === RECIPIENT_A)?.content as EmailContent;
    const b = captured.find((c) => c.to === RECIPIENT_B)?.content as EmailContent;
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    expect(a.subject).toBe("Return exceptions summary - 4 returns with exceptions");
    expect(a.text.split("\n")[0]).toBe(
      `4 returns with exceptions since ${formatPacific(new Date("2001-01-09T14:00:00.000Z"))} Pacific; 3 still open.`
    );
    // One asset card: open returns first (damage oldest first, then the missing accessory), then the resolved return.
    const order = ["a3", "a5", "a1", "a2"].map((key) => a.text.indexOf(ref(key)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    for (const key of ["a0", "a4", "b1"]) expect(a.text).not.toContain(ref(key));

    expect(a.text).toContain("Returns with exceptions: 4");
    expect(a.text).toContain("Still open: 3 (3 new, 0 reviewed)");
    expect(a.text).toContain("DAMAGE OR DOES NOT OPERATE — 1 asset · 4 returns");
    expect(a.text).toContain(" · 4 returns · 3 open · 4 exceptions");
    expect(a.text).toContain("Staff return · Resolved");
    expect(a.text).toContain(`Renter return · New · Submitted ${formatPacific(new Date("2001-01-10T05:00:00.000Z"))} Pacific`);
    expect(a.text).toContain(`Reference: ${ref("a3")} · Photos: 2`);
    expect(a.text).toContain("- Missing accessories");
    expect(a.text).toContain(`Open return checklist: ${SITE}/dashboard/submissions/${idOf("a3")}`);
    expect(a.text).toContain(
      `View open return checklists: ${SITE}/dashboard/submissions?form_type=return_checklist&status=unresolved`
    );
    expect(a.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    for (const path of PLACEHOLDER_MEDIA) expect(`${a.text}${a.html}`).not.toContain(path);
    expect(a.html).not.toMatch(/<img|cid:/);
    expect(a.attachments).toBeUndefined();

    expect(b.subject).toBe("Return exceptions summary - 1 return with exceptions");
    expect(b.text).toContain(ref("b1"));
    for (const key of ["a1", "a2", "a3", "a5"]) expect(b.text).not.toContain(ref(key));

    expect(await ledgerRow("A", utc("2001-01-10T14:00:00.000Z"))).toMatchObject({
      status: "sent",
      item_count: 4,
      provider_id: "staging-check",
      window_start: utc("2001-01-09T14:00:00.000Z"),
    });
  });

  it("a duplicate invocation for the same window sends nothing", async () => {
    const { result, captured } = await runAt("2001-01-10T14:45:00.000Z", ["A", "B"]);
    expect(captured).toHaveLength(0);
    expect(result).toMatchObject({ outcome: "completed", sent: 0, skipped: 2 });
  });

  it("a quiet day records skipped_quiet and sends nothing", async () => {
    const { result, captured } = await runAt("2001-01-11T14:30:00.000Z", ["A"]);
    expect(captured).toHaveLength(0);
    expect(result).toMatchObject({ quiet: 1, sent: 0 });
    expect(await ledgerRow("A", utc("2001-01-11T14:00:00.000Z"))).toMatchObject({ status: "skipped_quiet", item_count: 0 });
  });

  it("instant_renter lists staff exceptions only", async () => {
    await setMode("A", "instant_renter");
    await seed([
      { key: "c1", createdAt: "2001-01-12T01:00:00.000Z", data: DAMAGE },
      { key: "c2", origin: "staff", createdAt: "2001-01-12T02:00:00.000Z", data: MISSING },
    ]);
    const { captured } = await runAt("2001-01-12T14:30:00.000Z", ["A"]);
    expect(captured).toHaveLength(1);
    expect(captured[0].content.subject).toBe("Return exceptions summary - 1 return with exceptions");
    expect(captured[0].content.text).toContain(ref("c2"));
    expect(captured[0].content.text).not.toContain(ref("c1"));
  });

  it("off excludes the organization; the next daily run catches up the period since the last summary", async () => {
    await setMode("A", "off");
    await seed([
      { key: "d1", createdAt: "2001-01-13T01:00:00.000Z", data: DAMAGE },
      { key: "d2", origin: "staff", createdAt: "2001-01-13T02:00:00.000Z", data: DAMAGE },
    ]);
    const off = await runAt("2001-01-13T14:30:00.000Z", ["A"]);
    expect(off.result.organizations).toBe(0);
    expect(off.captured).toHaveLength(0);
    expect(await ledgerRow("A", utc("2001-01-13T14:00:00.000Z"))).toBeNull();

    await setMode("A", "daily_exceptions");
    await seed([{ key: "e1", createdAt: "2001-01-14T03:00:00.000Z", data: MISSING }]);
    const { captured } = await runAt("2001-01-14T14:30:00.000Z", ["A"]);
    expect(captured).toHaveLength(1);
    const text = captured[0].content.text;
    for (const key of ["d1", "d2", "e1"]) expect(text).toContain(ref(key));
    expect(text).not.toContain(ref("c1"));
    expect(await ledgerRow("A", utc("2001-01-14T14:00:00.000Z"))).toMatchObject({
      status: "sent",
      item_count: 3,
      window_start: utc("2001-01-12T14:00:00.000Z"),
    });
  });

  it("a failed send is recorded as failed and does not advance the window; a missed day is caught up", async () => {
    await seed([
      { key: "f1", createdAt: "2001-01-15T03:00:00.000Z", data: DAMAGE }, // Jan 15: no invocation (missed)
      { key: "g1", origin: "staff", createdAt: "2001-01-16T03:00:00.000Z", data: DAMAGE },
    ]);
    const failed = await runAt("2001-01-16T14:30:00.000Z", ["A"], "failed_transient");
    expect(failed.result).toMatchObject({ failed: 1, sent: 0 });
    expect(await ledgerRow("A", utc("2001-01-16T14:00:00.000Z"))).toMatchObject({
      status: "failed",
      failure_class: "provider_5xx",
      window_start: utc("2001-01-14T14:00:00.000Z"),
    });

    await seed([{ key: "h1", createdAt: "2001-01-17T03:00:00.000Z", data: MISSING }]);
    const { result, captured } = await runAt("2001-01-17T14:30:00.000Z", ["A"]);
    expect(result.sent).toBe(1);
    for (const key of ["f1", "g1", "h1"]) expect(captured[0].content.text).toContain(ref(key));
    expect(await ledgerRow("A", utc("2001-01-17T14:00:00.000Z"))).toMatchObject({
      status: "sent",
      item_count: 3,
      window_start: utc("2001-01-14T14:00:00.000Z"),
    });
  });

  it("more than 15 returns: the first 15 are listed and the rest point to Submissions", async () => {
    await seed(
      Array.from({ length: 27 }, (_, i) => ({
        key: `cap${i}`,
        createdAt: `2001-01-18T00:${String(i).padStart(2, "0")}:00.000Z`,
        data: DAMAGE,
      }))
    );
    const { captured } = await runAt("2001-01-18T14:30:00.000Z", ["A"]);
    expect(captured).toHaveLength(1);
    const { subject, text } = captured[0].content;
    expect(subject).toBe("Return exceptions summary - 27 returns with exceptions");
    expect((text.match(/^Open return checklist: /gm) ?? []).length).toBe(15);
    expect(text).toContain("12 more returns for this asset are in Submissions.");
    expect(text).toContain("Showing 15 of 27 returns from 1 of 1 asset. The rest are in Submissions: ");
    expect(text).toContain(ref("cap0"));
    expect(text).not.toContain(ref("cap26"));
    expect(await ledgerRow("A", utc("2001-01-18T14:00:00.000Z"))).toMatchObject({ status: "sent", item_count: 27 });
  });
});
