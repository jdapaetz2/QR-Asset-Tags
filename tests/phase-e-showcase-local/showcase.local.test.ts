import { hash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/acknowledgements/acknowledgements";
import { buildAttentionItems, summarizeUnresolvedByAsset, type AttentionSubmission } from "@/lib/dashboard/briefing";
import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest } from "@/lib/notifications/digest-worker";
import type { EmailContent } from "@/lib/notifications/email";
import { submissionReference } from "@/lib/submissions/inbox";

import { tableHash } from "../../scripts/lib/showcase-archive.mjs";
import { DATASET_FILE, MEDIA_FILE, SCENARIO_FILE, expandDataset, serializeDataset } from "../../scripts/lib/showcase-dataset.mjs";
import { pacificWallTimeToUtc } from "../../scripts/lib/showcase-reset.mjs";
import { LOCAL_ADMIN, LOCAL_PASSWORD, PRODUCTION_ROWS } from "../../scripts/phase-e/showcase-bootstrap.mjs";
import { buildShowcaseDataset, type Dataset, type MediaMap, type Row, type Scenario } from "../../scripts/phase-e/showcase/build-dataset";
import { NORTHRIDGE, REPO, anonClient, count, db, orgFingerprint, packagePathFrom, runTool, serviceClient, signIn, stack, tempRoot } from "../phase-e-local/support";

/**
 * Engineering Phase E2B — the local showcase rehearsal. One ordered file against the LOCAL stack with the SYNTHETIC
 * showcase dataset only; `npm run test:phase-e-showcase-local` resets the local database first.
 *
 *   bootstrap   the rehearsal target gets the four showcase assets with Production ids; a second run changes nothing
 *   showcase    plan ACCEPTED; interrupted applies roll back; apply converges; a re-apply writes nothing; a second
 *               showcase build is refused; the invariants hold in SQL; the dashboard and analytics agree as the admin
 *   presenter   a live demo (acknowledgement, staff return, a resolved request) is refused until the live return is
 *               named, then reset; a visitor's report filed before the apply is kept
 *   refresh     a re-anchored copy (same ids, new dates) applies and converges; organic rows are kept
 *   digest      the real worker with a fake sender skips every dataset return and lists later controls, both modes
 *   rollback    restoring the pre-showcase archive removes every dataset row and scan and keeps the visitor's report
 */

const RESET = "scripts/phase-e/showcase-reset.mjs";
const BOOTSTRAP = "scripts/phase-e/showcase-bootstrap.mjs";
const ARCHIVE = "scripts/phase-e/showcase-archive.mjs";
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const readRepo = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");
const DATASET = JSON.parse(readRepo(DATASET_FILE)) as Dataset;
const SCENARIO_TEXT = readRepo(SCENARIO_FILE);
const SCENARIO = JSON.parse(SCENARIO_TEXT) as Scenario;
const MEDIA = JSON.parse(readRepo(MEDIA_FILE)) as MediaMap;
const ANCHOR = Date.parse(DATASET.anchor.utc);
const SHOWCASE_IDS = PRODUCTION_ROWS.map((p) => p.asset_id);
const asset = (code: string, d: Dataset = DATASET) => d.assets.find((a) => a.asset_code === code) as Dataset["assets"][number];

let client: pg.Client;
let work = "";
let pkg = "";
let showcaseFile = "";
let movedFile = "";
let moved: Dataset;
let qrBefore = "";
let profilesBefore = "";
let visitorReport = "";

const file = (name: string) => path.join(work, name);
const reset = (...args: string[]) => runTool(RESET, ["--target=local", ...args]);
const planOf = (manifest: string) => JSON.parse(readFileSync(manifest.replace(/\.json$/, ".plan.json"), "utf8"));
const rows = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;
const tableDigest = async (table: string) => (await rows(`select coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by t.id)), '') as h from public."${table}" t where t.organization_id = $1`, [NORTHRIDGE]))[0].h as string;

/** The local Vancouver date `days` before today, as YYYY-MM-DD. */
function localDateBefore(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - days * DAY));
  return parts;
}

beforeAll(async () => {
  client = await db();
  work = tempRoot("showcase");
  const res = await fetch(`${stack().apiUrl}/auth/v1/health`, { headers: { apikey: stack().anonKey } });
  if (res.status === 502) throw new Error("the local Kong kept a stale auth route after the reset: docker restart supabase_kong_QR_Asset_Tags, then run again");
});

afterAll(async () => {
  await client?.end();
});

describe("bootstrap", () => {
  it("adds the missing showcase assets with their Production ids and times, and a second run changes nothing", async () => {
    const first = runTool(BOOTSTRAP, ["--target=local", "--apply"]);
    expect(first.out).toMatch(/assets to add: EXCAVATOR-3015, TRAILER-2041/);
    expect(first.status).toBe(0);
    const second = runTool(BOOTSTRAP, ["--target=local", "--apply"]);
    expect(second.out).toMatch(/assets to add: none · creation times to align: none/);
    expect(second.out).toMatch(/QR rows to add: none · creation times to align: none/);
    expect(second.out).toMatch(/page rows to add: none · old scans to delete on the four assets: 0/);
    expect(second.out).toMatch(/local admin login: present/);
    expect(second.status).toBe(0);
    const found = await rows(
      `select a.asset_code, a.created_at, q.short_code, q.created_at as qr_created_at, q.is_production_primary, q.status
         from public.assets a join public.qr_links q on q.asset_id = a.id where a.id = any($1::uuid[])`,
      [SHOWCASE_IDS]
    );
    expect(found).toHaveLength(4);
    for (const p of PRODUCTION_ROWS) {
      const r = found.find((x) => x.asset_code === p.asset_code);
      expect(new Date(r.created_at).getTime(), p.asset_code).toBe(Date.parse(p.asset_created_at));
      expect(new Date(r.qr_created_at).getTime(), p.short_code).toBe(Date.parse(p.qr_created_at));
      expect(r).toMatchObject({ short_code: p.short_code, is_production_primary: true, status: "active" });
    }
    qrBefore = await tableDigest("qr_links");
    profilesBefore = await tableDigest("profiles");
  });

  it("exports the pre-showcase state with the real archive tool (the rollback point)", () => {
    const { status, out } = runTool(ARCHIVE, ["--target=local", `--org=${NORTHRIDGE}`, `--root=${tempRoot("showcase-archive")}`]);
    expect(out).toMatch(/local synthetic package/);
    expect(status).toBe(0);
    pkg = packagePathFrom(out);
  });
});

describe("showcase (first application)", () => {
  it("plans ACCEPTED: the dataset in, the old test rows out by exact id, nothing on QR rows, profiles or the ledger", () => {
    showcaseFile = file("showcase.json");
    const m = reset("manifest", "--kind=showcase", `--org=${NORTHRIDGE}`, `--out=${showcaseFile}`);
    expect(m.out).toMatch(/E2A applied as draft/);
    expect(m.status).toBe(0);
    const p = reset("plan", `--manifest=${showcaseFile}`);
    expect(p.out).toMatch(/ACCEPTED/);
    expect(p.status).toBe(0);
    const plan = planOf(showcaseFile);
    expect(plan.counts.asset_rental_sessions.INSERT).toBe(DATASET.rows.asset_rental_sessions.length);
    expect(plan.counts.form_submissions.INSERT).toBe(DATASET.rows.form_submissions.length);
    expect(plan.counts.asset_acknowledgements.INSERT).toBe(DATASET.rows.asset_acknowledgements.length);
    expect(plan.counts.scan_events.INSERT).toBe(DATASET.rows.scan_events.length);
    for (const t of ["qr_links", "profiles", "notification_digest_runs", "organizations"]) {
      expect(plan.counts[t].UPDATE + plan.counts[t].INSERT + plan.counts[t].DELETE, t).toBe(0);
    }
  });

  it("rolls an interrupted apply back completely (after the writes, after the post-checks), then the retry succeeds", async () => {
    for (const at of ["writes", "postchecks"]) {
      const before = await orgFingerprint(client);
      const r = reset("apply", `--manifest=${showcaseFile}`, `--fail-at=${at}`);
      expect(r.out).toContain(`--fail-at=${at}`);
      expect(r.status).toBe(1);
      expect(await orgFingerprint(client)).toEqual(before);
    }
    const applied = reset("apply", `--manifest=${showcaseFile}`);
    expect(applied.out, applied.out.slice(-2500)).toMatch(/re-plan after commit: CONVERGED \(all KEEP\)/);
    expect(applied.status).toBe(0);
  });

  it("writes nothing when applied again, and refuses a second showcase build (duplicate seed)", () => {
    const again = reset("apply", `--manifest=${showcaseFile}`);
    expect(again.out).toMatch(/in one transaction: 0 guarded statements/);
    expect(again.out).toMatch(/re-plan after commit: CONVERGED/);
    const twice = reset("manifest", "--kind=showcase", `--org=${NORTHRIDGE}`, `--out=${file("again.json")}`);
    expect(twice.out).toMatch(/already on this target/);
    expect(twice.status).not.toBe(0);
  });

  it("holds the dataset's invariants in SQL", async () => {
    const expanded = expandDataset(DATASET) as Dataset;
    for (const table of Object.keys(expanded.rows) as (keyof Dataset["rows"])[]) {
      const list = expanded.rows[table];
      const live = await rows(`select to_jsonb(t) as j from public."${table}" t where t.id = any($1::uuid[])`, [list.map((r) => r.id)]);
      expect(live.length, table).toBe(list.length);
      expect(tableHash(live.map((r) => r.j)), `${table} rows equal the dataset`).toBe(tableHash(list));
    }
    expect(await count(client, `select count(*)::int as n from public.asset_rental_sessions a join public.asset_rental_sessions b on a.asset_id = b.asset_id and a.id < b.id and tstzrange(a.started_at, coalesce(a.returned_at, 'infinity')) && tstzrange(b.started_at, coalesce(b.returned_at, 'infinity')) where a.organization_id = $1`, [NORTHRIDGE])).toBe(0);
    const pointers = await rows(`select a.id, a.active_rental_session_id, s.status from public.assets a left join public.asset_rental_sessions s on s.id = a.active_rental_session_id where a.id = any($1::uuid[])`, [SHOWCASE_IDS]);
    for (const a of DATASET.assets) {
      const p = pointers.find((x) => x.id === a.asset_id);
      expect(p.active_rental_session_id, a.asset_code).toBe(a.active_rental_session_id);
      if (a.active_rental_session_id) expect(p.status).toBe("active");
    }
    expect(await count(client, `select count(*)::int as n from public.form_submissions f join public.asset_rental_sessions s on s.id = f.rental_session_id where f.form_type = 'pre_use_inspection' and f.organization_id = $1 and not (f.created_at <= s.started_at and s.started_at - f.created_at < interval '30 seconds')`, [NORTHRIDGE])).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.form_submissions f join public.asset_rental_sessions s on s.id = f.rental_session_id where f.form_type = 'return_checklist' and f.submission_origin = 'staff' and f.organization_id = $1 and not (f.created_at <= s.returned_at and s.returned_at - f.created_at < interval '30 seconds')`, [NORTHRIDGE])).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.form_submissions where organization_id = $1 and ((form_type in ('damage_report', 'support_request') and (submission_origin <> 'public' or rental_session_id is not null)) or (form_type = 'pre_use_inspection' and submission_origin <> 'staff') or submitted_by_profile_id is not null)`, [NORTHRIDGE])).toBe(0);
    const statuses = Object.fromEntries((await rows(`select status, count(*)::int as n from public.form_submissions where organization_id = $1 group by status`, [NORTHRIDGE])).map((r) => [r.status, r.n]));
    expect(statuses).toMatchObject({ new: 3, reviewed: 2 });
    const paths = expanded.rows.form_submissions.flatMap((r) => r.media_urls as string[]);
    expect(await count(client, `select count(*)::int as n from storage.objects where bucket_id = 'submissions' and name = any($1::text[])`, [paths])).toBe(paths.length);
    expect(await tableDigest("qr_links")).toBe(qrBefore);
    expect(await tableDigest("profiles")).toBe(profilesBefore);
  });

  it("the dashboard queue and the analytics read as the local admin agree with the dataset", async () => {
    const admin = await signIn(LOCAL_ADMIN.email, LOCAL_PASSWORD);
    const { data: assets } = await admin.from("assets").select("id, asset_code, asset_name, archived_at, active_rental_session_id");
    const { data: subs } = await admin.from("form_submissions").select("id, asset_id, form_type, status, created_at, submission_data_json").in("status", ["new", "reviewed"]);
    const signals = summarizeUnresolvedByAsset((subs ?? []) as AttentionSubmission[]);
    const items = buildAttentionItems(
      (assets ?? []).filter((a) => a.archived_at === null).map((a) => {
        const s = signals.get(a.id);
        return {
          id: a.id,
          code: a.asset_code,
          name: a.asset_name,
          rented: a.active_rental_session_id !== null,
          unresolvedCount: s?.unresolvedCount ?? 0,
          hasOpenDamage: s?.hasOpenDamage ?? false,
          hasUrgentDamage: s?.hasUrgentDamage ?? false,
          hasUnresolvedReturn: s?.hasUnresolvedReturn ?? false,
          returnSubmissionId: s?.returnSubmissionId ?? null,
          returnFlagsIssue: s?.returnFlagsIssue ?? false,
          oldestUnresolvedMs: s?.oldestUnresolvedMs ?? null,
          newestUnresolvedMs: s?.newestUnresolvedMs ?? null,
        };
      }),
      { now: ANCHOR + 2 * HOUR }
    );
    expect(items.map((i) => `${i.code}:${i.priority}`)).toEqual(["EXCAVATOR-3015:2", "TRAILER-014:5", "EXCAVATOR-017:7", "TRAILER-2041:7"]);
    for (const days of [7, 30, 90]) {
      const { data, error } = await admin.rpc("analytics_daily_activity", { p_days: days });
      expect(error).toBeNull();
      const total = (data as { scan_count: number }[]).reduce((n, d) => n + Number(d.scan_count), 0);
      const expected = await count(
        client,
        `select count(*)::int as n from public.scan_events where organization_id = $1
           and scanned_at >= ((((now() at time zone 'America/Vancouver')::date - ($2::int - 1))::timestamp) at time zone 'America/Vancouver')
           and scanned_at < ((((now() at time zone 'America/Vancouver')::date + 1)::timestamp) at time zone 'America/Vancouver')`,
        [NORTHRIDGE, days]
      );
      expect(total, `${days}-day scans`).toBe(expected);
    }
    const photo = (expandDataset(DATASET) as Dataset).rows.form_submissions.find((r) => (r.media_urls as string[]).length > 0)?.media_urls as string[];
    const signed = await admin.storage.from("submissions").createSignedUrl(photo[0], 60);
    expect(signed.error).toBeNull();
    expect(Boolean(signed.data?.signedUrl)).toBe(true);
  });
});

describe("presenter reset", () => {
  it("refuses on a live demo staff return until it is named, then restores the authored state and keeps a visitor's report", async () => {
    const admin = await signIn(LOCAL_ADMIN.email, LOCAL_PASSWORD);
    const anon = anonClient();
    const ex017 = asset("EXCAVATOR-017");
    const tr014 = asset("TRAILER-014");
    // The live demo: an acknowledgement on the synthetic active rental (as the public form inserts it), a staff
    // return through the app's own RPC, and the presenter resolving the open support request.
    const ackId = randomUUID();
    const ack = await anon.from("asset_acknowledgements").insert({ id: ackId, organization_id: NORTHRIDGE, asset_id: ex017.asset_id, name: "Live demo visitor", statement: ACKNOWLEDGEMENT_STATEMENT, rental_session_id: ex017.active_rental_session_id });
    expect(ack.error).toBeNull();
    const staffReturn = randomUUID();
    const rpc = await admin.rpc("complete_staff_return", {
      p_asset_id: ex017.asset_id,
      p_expected_session_id: ex017.active_rental_session_id,
      p_submission_id: staffReturn,
      p_created_at: new Date().toISOString(),
      p_status: "resolved",
      p_submitted_by_name: LOCAL_ADMIN.name,
      p_submitted_by_email: LOCAL_ADMIN.email,
      p_data: { schema_version: 2, flags: { damage_observed: "no", accessories_missing: false } },
      p_media: [],
      p_template_key: "mini_excavator_skid_steer",
      p_template_version: "2026-07-2",
    });
    expect(rpc.error).toBeNull();
    expect((rpc.data as { result: string }).result).toBe("completed");
    const support = DATASET.rows.form_submissions.find((r) => r.form_type === "support_request" && r.status === "new") as Row;
    expect((await admin.from("form_submissions").update({ status: "resolved" }).eq("id", support.id)).error).toBeNull();

    const blocked = file("presenter-blocked.json");
    expect(reset("manifest", "--kind=presenter", `--org=${NORTHRIDGE}`, `--out=${blocked}`).status).toBe(0);
    const refused = reset("plan", `--manifest=${blocked}`);
    expect(refused.out).toMatch(/REFUSED \[conflict\]/);
    expect(refused.out).toContain(staffReturn);

    const removeFile = file("remove.json");
    writeFileSync(removeFile, JSON.stringify({ form_submissions: [staffReturn], asset_acknowledgements: [ackId] }));
    const presenter = file("presenter.json");
    expect(reset("manifest", "--kind=presenter", `--org=${NORTHRIDGE}`, `--out=${presenter}`, `--remove=${removeFile}`).status).toBe(0);
    const reviewed = reset("plan", `--manifest=${presenter}`);
    expect(reviewed.out).toMatch(/ACCEPTED/);

    // A visitor files a damage report after the plan was reviewed and before the apply: it is kept.
    visitorReport = randomUUID();
    const report = await anon.from("form_submissions").insert({ id: visitorReport, organization_id: NORTHRIDGE, asset_id: tr014.asset_id, form_type: "damage_report", status: "new", submitted_by_name: "Visitor (local rehearsal)", submitted_by_email: "visitor@phase-e-showcase.invalid", submission_data_json: { triage_version: 1, description: "Organic report during the reset" }, media_urls: [] });
    expect(report.error).toBeNull();

    const applied = reset("apply", `--manifest=${presenter}`, `--approved-plan=${presenter.replace(/\.json$/, ".plan.json")}`);
    expect(applied.out, applied.out.slice(-2500)).toMatch(/re-plan after commit: CONVERGED/);
    expect(applied.status).toBe(0);
    expect((await rows(`select status from public.form_submissions where id = $1`, [support.id]))[0].status).toBe("new");
    expect((await rows(`select active_rental_session_id from public.assets where id = $1`, [ex017.asset_id]))[0].active_rental_session_id).toBe(ex017.active_rental_session_id);
    expect((await rows(`select status, returned_at from public.asset_rental_sessions where id = $1`, [ex017.active_rental_session_id]))[0]).toEqual({ status: "active", returned_at: null });
    expect(await count(client, `select count(*)::int as n from public.form_submissions where id = any($1::uuid[])`, [[staffReturn]])).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.asset_acknowledgements where id = $1`, [ackId])).toBe(0);
    expect(await count(client, `select count(*)::int as n from public.form_submissions where id = $1`, [visitorReport])).toBe(1);
    expect(await tableDigest("qr_links")).toBe(qrBefore);
  });

  it("refuses an apply whose locked rows changed after the plan was reviewed, and another manifest's plan", async () => {
    const presenter = file("presenter-stale.json");
    expect(reset("manifest", "--kind=presenter", `--org=${NORTHRIDGE}`, `--out=${presenter}`).status).toBe(0);
    expect(reset("plan", `--manifest=${presenter}`).out).toMatch(/ACCEPTED/);
    const reviewedPlan = presenter.replace(/\.json$/, ".plan.json");
    const support = DATASET.rows.form_submissions.find((r) => r.form_type === "support_request" && r.status === "new") as Row;
    const admin = await signIn(LOCAL_ADMIN.email, LOCAL_PASSWORD);
    expect((await admin.from("form_submissions").update({ status: "resolved" }).eq("id", support.id)).error).toBeNull();
    const stale = reset("apply", `--manifest=${presenter}`, `--approved-plan=${reviewedPlan}`);
    expect(stale.out).toMatch(/differs from --approved-plan/);
    expect(stale.status).not.toBe(0);
    expect((await rows(`select status from public.form_submissions where id = $1`, [support.id]))[0].status).toBe("resolved");
    const other = reset("apply", `--manifest=${presenter}`, `--approved-plan=${file("presenter.plan.json")}`);
    expect(other.out).toMatch(/plan of another manifest/);
    expect(other.status).not.toBe(0);
  });
});

describe("refresh", () => {
  it("re-anchors the dataset (same ids, new dates), keeps organic rows, and the 7-day analytics have data", async () => {
    moved = buildShowcaseDataset({ scenario: SCENARIO, scenarioSha256: hash("sha256", SCENARIO_TEXT), media: MEDIA, previous: DATASET, anchorDate: localDateBefore(3) });
    movedFile = file("dataset-moved.json");
    writeFileSync(movedFile, serializeDataset(moved));
    const refresh = file("refresh.json");
    expect(reset("manifest", "--kind=refresh", `--org=${NORTHRIDGE}`, `--out=${refresh}`, `--dataset=${movedFile}`).status).toBe(0);
    const p = reset("plan", `--manifest=${refresh}`);
    expect(p.out).toMatch(/ACCEPTED/);
    const applied = reset("apply", `--manifest=${refresh}`, `--approved-plan=${refresh.replace(/\.json$/, ".plan.json")}`);
    expect(applied.out, applied.out.slice(-2500)).toMatch(/re-plan after commit: CONVERGED/);
    expect(applied.status).toBe(0);
    for (const a of moved.assets) {
      expect((await rows(`select active_rental_session_id from public.assets where id = $1`, [a.asset_id]))[0].active_rental_session_id, a.asset_code).toBe(a.active_rental_session_id);
    }
    expect(await count(client, `select count(*)::int as n from public.form_submissions where id = $1`, [visitorReport])).toBe(1);
    const admin = await signIn(LOCAL_ADMIN.email, LOCAL_PASSWORD);
    const { data } = await admin.rpc("analytics_daily_activity", { p_days: 7 });
    expect((data as { scan_count: number }[]).reduce((n, d) => n + Number(d.scan_count), 0)).toBeGreaterThan(0);
  });
});

describe("notifications", () => {
  it("the real digest worker skips every dataset return and lists later control returns, under both return modes", async () => {
    const A2 = Date.parse(moved.anchor.utc);
    const iso = (ms: number) => new Date(ms).toISOString();
    // The anchor's 6 AM run, as Production's ledger holds it at the cutover.
    await client.query(
      `insert into public.notification_digest_runs (organization_id, digest_type, window_start, window_end, status, item_count, created_at, completed_at) values ($1, 'return_exceptions', $2, $3, 'skipped_quiet', 0, $3, $3)`,
      [NORTHRIDGE, iso(A2 - DAY), iso(A2)]
    );
    const service = serviceClient();
    const controls: string[] = [];
    const control = async (at: number, staff: boolean) => {
      const { data, error } = await service
        .from("form_submissions")
        .insert({ organization_id: NORTHRIDGE, asset_id: asset("TRAILER-014", moved).asset_id, form_type: "return_checklist", status: "new", created_at: iso(at), submitted_by_name: "Phase E2B digest control", submission_data_json: { damage_observed: "yes", accessories_returned: "yes" }, media_urls: [] })
        .select("id")
        .single();
      expect(error).toBeNull();
      const id = (data as { id: string }).id;
      if (staff) expect((await service.from("form_submissions").update({ submission_origin: "staff", rental_session_id: null }).eq("id", id)).error).toBeNull();
      controls.push(id);
      return id;
    };
    const datasetReturns = moved.rows.form_submissions.filter((r) => r.form_type === "return_checklist");
    const run = async (now: number) => {
      const captured: { to: string; content: EmailContent }[] = [];
      const result = await runReturnDigest({
        store: createDigestStore(service),
        send: async (to, content) => {
          captured.push({ to, content });
          return { outcome: "sent", attempts: 1, providerId: "phase-e2b-local-fake-sender", status: 200 };
        },
        now: () => new Date(now),
        siteUrl: "https://mulemark.io",
        replyTo: "",
        log: () => {},
        logRun: () => {},
        onlyOrganizationIds: [NORTHRIDGE],
      });
      return { result, captured };
    };
    try {
      const staff1 = await control(A2 + 3 * HOUR, true);
      const public1 = await control(A2 + 4 * HOUR, false);
      const first = await run(A2 + DAY + 30 * 60_000);
      expect(first.result).toMatchObject({ outcome: "completed", sent: 1 });
      const text1 = first.captured[0].content.text;
      expect(text1).toContain(submissionReference(staff1, iso(A2 + 3 * HOUR)));
      expect(text1).not.toContain(submissionReference(public1, iso(A2 + 4 * HOUR)));
      for (const r of datasetReturns) expect(text1).not.toContain(submissionReference(String(r.id), String(r.created_at)));

      await client.query(`update public.organizations set return_notification_mode = 'daily_exceptions' where id = $1`, [NORTHRIDGE]);
      const public2 = await control(A2 + DAY + 4 * HOUR, false);
      const staff2 = await control(A2 + DAY + 5 * HOUR, true);
      const second = await run(A2 + 2 * DAY + 30 * 60_000);
      expect(second.result).toMatchObject({ outcome: "completed", sent: 1 });
      const text2 = second.captured[0].content.text;
      expect(text2).toContain(submissionReference(public2, iso(A2 + DAY + 4 * HOUR)));
      expect(text2).toContain(submissionReference(staff2, iso(A2 + DAY + 5 * HOUR)));
      for (const r of datasetReturns) expect(text2).not.toContain(submissionReference(String(r.id), String(r.created_at)));
    } finally {
      await service.from("form_submissions").delete().in("id", controls);
      await client.query(`update public.organizations set return_notification_mode = 'instant_renter' where id = $1`, [NORTHRIDGE]);
    }
  });
});

describe("rollback", () => {
  it("restoring the pre-showcase archive removes every dataset row and scan and keeps the visitor's report", async () => {
    const restore = file("restore.json");
    const m = reset("manifest", "--kind=restore", `--org=${NORTHRIDGE}`, `--archive=${pkg}`, `--cutover=${showcaseFile}`, `--dataset=${movedFile}`, `--out=${restore}`);
    expect(m.status).toBe(0);
    expect(reset("plan", `--manifest=${restore}`).out).toMatch(/ACCEPTED/);
    const applied = reset("apply", `--manifest=${restore}`);
    expect(applied.out, applied.out.slice(-2500)).toMatch(/re-plan after commit: CONVERGED/);
    expect(applied.status).toBe(0);
    for (const d of [DATASET, moved]) {
      for (const [table, list] of Object.entries(d.rows)) {
        expect(await count(client, `select count(*)::int as n from public."${table}" where id = any($1::uuid[])`, [list.map((r) => r.id)]), table).toBe(0);
      }
    }
    expect(await count(client, `select count(*)::int as n from public.form_submissions where id = $1`, [visitorReport])).toBe(1);
    const inserted = JSON.parse(readFileSync(showcaseFile, "utf8")).allow_insert.documents as string[];
    expect(await count(client, `select count(*)::int as n from public.documents where id = any($1::uuid[])`, [inserted])).toBe(0);
    expect(await tableDigest("qr_links")).toBe(qrBefore);
    expect(await tableDigest("profiles")).toBe(profilesBefore);
  });
});

// The anchor is a 6 AM Pacific cutoff (sanity: the tracked dataset was built that way).
it("anchors the tracked dataset at a 6 AM Pacific digest cutoff", () => {
  const [y, mo, d] = DATASET.anchor.date.split("-").map(Number);
  expect(ANCHOR).toBe(pacificWallTimeToUtc(y, mo, d, 6).getTime());
});
