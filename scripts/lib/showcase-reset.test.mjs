import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { digestSlot, digestWindow, pacificWallTimeToUtc as appWallTime } from "../../lib/notifications/digest-window.ts";
import { rowHash } from "./showcase-archive.mjs";
import {
  ORGANIZATION_LOCKED_COLUMNS,
  buildManifest,
  digestWindowStart,
  draftE2cDesired,
  emitResetSql,
  idSetMd5,
  ledgerWatermark,
  managedColumns,
  noopDesired,
  pacificWallTimeToUtc,
  planReset,
  planSummary,
  restoreDesired,
  seedWatermark,
} from "./showcase-reset.mjs";

// The Phase E1 reset planner (scripts/lib/showcase-reset.mjs) on small synthetic snapshots shaped by the tracked graph.

const GRAPH = JSON.parse(readFileSync(new URL("../../docs/phase-e/manifests/tenant-dependency-graph.json", import.meta.url), "utf8"));
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A1 = id("a1", 1); // protected, active session, QR, page
const A2 = id("a1", 2); // protected, page
const A3 = id("a1", 3); // spare, nothing hangs off it
const S1 = id("b1", 1);
const Q1 = id("c1", 1);
const P1 = id("d1", 1);
const P2 = id("d1", 2);
const F1 = id("e1", 1);
const K1 = id("f1", 1);
const L1 = id("ab", 1);
const SC1 = id("cd", 1);
const W = "2026-09-30T13:00:00+00:00";
const AFTER_W = new Date("2026-09-30T20:00:00Z"); // after that day's run; the next cutoff is 2026-10-01 13:00 UTC

function row(table, values) {
  const r = Object.fromEntries(GRAPH.tables[table].columns.map((c) => [c.name, null]));
  return { ...r, ...values };
}

function snapshot() {
  const tables = Object.fromEntries(GRAPH.insert_order.map((t) => [t, []]));
  tables.organizations = [row("organizations", { id: ORG, name: "Northridge", slug: "northridge-rentals", status: "active", return_notification_mode: "instant_renter" })];
  tables.assets = [
    row("assets", { id: A1, organization_id: ORG, asset_code: "EX-1", public_status: "public", active_rental_session_id: S1, updated_at: "2026-09-01T00:00:00+00:00" }),
    row("assets", { id: A2, organization_id: ORG, asset_code: "TR-2", public_status: "public" }),
    row("assets", { id: A3, organization_id: ORG, asset_code: "SPARE-3", public_status: "private" }),
  ];
  tables.equipment_pages = [
    row("equipment_pages", { id: P1, organization_id: ORG, asset_id: A1, is_published: true, headline: "Old" }),
    row("equipment_pages", { id: P2, organization_id: ORG, asset_id: A2, is_published: true }),
  ];
  tables.qr_links = [row("qr_links", { id: Q1, organization_id: ORG, asset_id: A1, short_code: "demo-ex017", status: "active", is_production_primary: true })];
  tables.asset_rental_sessions = [row("asset_rental_sessions", { id: S1, organization_id: ORG, asset_id: A1, status: "active", started_at: "2026-09-20T00:00:00+00:00" })];
  tables.form_submissions = [
    row("form_submissions", {
      id: F1,
      organization_id: ORG,
      asset_id: A1,
      form_type: "return_checklist",
      submission_origin: "public",
      rental_session_id: S1,
      status: "new",
      created_at: "2026-09-21T00:00:00+00:00",
      submission_data_json: {},
      media_urls: [],
    }),
  ];
  tables.asset_acknowledgements = [row("asset_acknowledgements", { id: K1, organization_id: ORG, asset_id: A1, rental_session_id: S1, name: "R", statement: "ok" })];
  tables.notification_digest_runs = [
    row("notification_digest_runs", { id: L1, organization_id: ORG, digest_type: "return_exceptions", window_start: "2026-09-29T13:00:00+00:00", window_end: W, status: "sent", item_count: 1 }),
  ];
  tables.scan_events = [row("scan_events", { id: SC1, organization_id: ORG, asset_id: A1, qr_link_id: Q1 })];
  return { taken_at: "2026-09-30T19:00:00.000Z", tables, identity: [] };
}

const PROTECTED = { qrLinkIds: [Q1], assetIds: [A1, A2] };
const manifestFor = (snap, desired, kind = "fixture") =>
  buildManifest({ name: "unit", kind, target: "local", organizationId: ORG, snapshot: snap, graph: GRAPH, protectedSet: PROTECTED, desired, now: AFTER_W });
const plan = (manifest, live) => planReset({ manifest, live, graph: GRAPH, now: AFTER_W });
const codes = (p) => p.refusals.map((r) => r.code);
const clone = (v) => JSON.parse(JSON.stringify(v));

describe("digest watermark mirror (parity with lib/notifications/digest-window.ts)", () => {
  it("converts Pacific wall time exactly like the app across both DST changes", () => {
    for (const [y, m, d] of [[2026, 3, 7], [2026, 3, 8], [2026, 3, 9], [2026, 10, 31], [2026, 11, 1], [2026, 11, 2], [2027, 1, 15], [2026, 7, 4]]) {
      expect(pacificWallTimeToUtc(y, m, d, 6).toISOString()).toBe(appWallTime(y, m, d, 6).toISOString());
    }
  });

  it("computes the same window start as digestWindow for every ledger shape", () => {
    const cutoffs = ["2026-10-01T13:00:00Z", "2026-11-02T14:00:00Z", "2026-03-09T13:00:00Z"].map((s) => new Date(s));
    for (const cutoff of cutoffs) {
      for (const last of [null, new Date(cutoff.getTime() - 86_400_000), new Date(cutoff.getTime() - 30 * 86_400_000), cutoff]) {
        for (const first of [null, new Date(cutoff.getTime() - 3 * 86_400_000), new Date(cutoff.getTime() + 1000)]) {
          const app = digestWindow(cutoff, last, first);
          expect(digestWindowStart(cutoff, last, first)?.toISOString() ?? null).toBe(app ? app.start.toISOString() : null);
        }
      }
    }
  });

  it("targets the run that can still happen: today's while inside the 6 AM hour, then tomorrow's", () => {
    // 5:30 AM PDT: today's 6 AM cutoff is next.
    expect(seedWatermark({ now: new Date("2026-10-01T12:30:00Z") }).nextCutoff.toISOString()).toBe("2026-10-01T13:00:00.000Z");
    // 6:30 AM PDT, before that run summarized: still today's (digestSlot agrees).
    const inHour = new Date("2026-10-01T13:30:00Z");
    expect(seedWatermark({ now: inHour }).nextCutoff.toISOString()).toBe(digestSlot(inHour).inWindow ? "2026-10-01T13:00:00.000Z" : "x");
    // 6:30 AM PDT after today's run succeeded: tomorrow's.
    expect(seedWatermark({ now: inHour, lastSuccessfulEnd: new Date("2026-10-01T13:00:00Z") }).nextCutoff.toISOString()).toBe("2026-10-02T13:00:00.000Z");
    // Past the 6 AM hour: tomorrow's, at whatever UTC instant the time-zone database gives 6 AM Pacific (same as the app).
    expect(seedWatermark({ now: new Date("2026-11-01T15:00:00Z") }).nextCutoff.toISOString()).toBe(appWallTime(2026, 11, 2, 6).toISOString());
  });

  it("takes the effective start from the last success, clamped to 14 days", () => {
    expect(seedWatermark({ now: AFTER_W, lastSuccessfulEnd: new Date(W) }).effectiveStart.toISOString()).toBe("2026-09-30T13:00:00.000Z");
    const stale = seedWatermark({ now: new Date("2026-10-16T20:00:00Z"), lastSuccessfulEnd: new Date(W) });
    expect(stale.effectiveStart.toISOString()).toBe("2026-10-03T13:00:00.000Z");
    expect(ledgerWatermark([{ digest_type: "return_exceptions", status: "failed", window_start: "2026-09-01T13:00:00Z", window_end: "2026-09-02T13:00:00Z" }])).toEqual({
      last_success_window_end: null,
      first_window_start: "2026-09-01T13:00:00.000Z",
    });
  });
});

describe("planReset", () => {
  it("a no-op manifest keeps every row", () => {
    const snap = snapshot();
    const p = plan(manifestFor(snap, noopDesired(snap), "noop"), snap);
    expect(p.refusals).toEqual([]);
    expect(p.ok).toBe(true);
    for (const [table, c] of Object.entries(p.counts)) expect(c, table).toEqual({ KEEP: snap.tables[table].length, UPDATE: 0, INSERT: 0, DELETE: 0 });
    expect(p.watermark.effective_start).toBe("2026-09-30T13:00:00.000Z");
  });

  it("refuses rows it did not expect, changed rows and vanished rows, but keeps new scans", () => {
    const snap = snapshot();
    const manifest = manifestFor(snap, noopDesired(snap));
    const live = clone(snap);
    live.tables.scan_events.push(row("scan_events", { id: id("cd", 2), organization_id: ORG, asset_id: A1, qr_link_id: Q1 }));
    expect(plan(manifest, live).ok).toBe(true);
    live.tables.form_submissions.push(row("form_submissions", { ...snap.tables.form_submissions[0], id: id("e1", 9) }));
    live.tables.assets[2].asset_code = "CHANGED";
    live.tables.asset_acknowledgements = [];
    expect(codes(plan(manifest, live))).toEqual(expect.arrayContaining(["drift-new", "drift-changed", "drift-missing"]));
  });

  it("never writes QR rows or profiles, and never lists the append-only ledger or scans", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    expect(desired.notification_digest_runs).toBeUndefined();
    expect(desired.scan_events).toBeUndefined();
    desired.qr_links[0].status = "disabled";
    desired.notification_digest_runs = [];
    const p = plan(manifestFor(snap, desired), snap);
    expect(p.refusals.filter((r) => r.code === "frozen").map((r) => r.message.split(":")[0])).toEqual(["qr_links"]);
    expect(p.refusals.map((r) => r.message)).toContain("notification_digest_runs is append-only; a manifest never lists its rows");
  });

  it("converges: once the live rows are the desired rows, a rerun keeps everything", () => {
    const snap = snapshot();
    const manifest = manifestFor(snap, draftE2cDesired(snap), "draft-e2c");
    const applied = clone(snap);
    for (const [table, rows] of Object.entries(manifest.desired)) applied.tables[table] = clone(rows);
    applied.tables.assets[0].updated_at = "2026-10-01T00:00:00+00:00"; // re-stamped by the database
    const p = plan(manifest, applied);
    expect(p.refusals).toEqual([]);
    for (const c of Object.values(p.counts)) expect(c.UPDATE + c.INSERT + c.DELETE).toBe(0);
  });

  it("refuses when ledger history disappeared (the watermark moved backwards)", () => {
    const snap = snapshot();
    const manifest = manifestFor(snap, noopDesired(snap));
    const live = clone(snap);
    live.tables.notification_digest_runs = [];
    const messages = plan(manifest, live).refusals.map((r) => r.message);
    expect(messages).toContain("the digest watermark moved backwards since the manifest was built (ledger history is missing)");
    expect(messages.some((m) => m.startsWith("notification_digest_runs: 1 row(s) the manifest relies on are gone"))).toBe(true);
    const later = clone(snap);
    later.tables.notification_digest_runs.push(
      row("notification_digest_runs", { id: id("ab", 2), organization_id: ORG, digest_type: "return_exceptions", window_start: W, window_end: "2026-10-01T13:00:00+00:00", status: "sent", item_count: 0 })
    );
    expect(plan(manifest, later).ok).toBe(true);
  });

  it("protects the curated assets, their codes, public state and pages", () => {
    const snap = snapshot();
    let desired = noopDesired(snap);
    desired.assets = desired.assets.filter((a) => a.id !== A2);
    desired.equipment_pages = desired.equipment_pages.filter((p) => p.asset_id !== A2);
    expect(plan(manifestFor(snap, desired), snap).refusals.map((r) => r.message)).toEqual(
      expect.arrayContaining([`protected asset ${A2} would be deleted`, `the page of protected asset ${A2} would be deleted`])
    );
    desired = noopDesired(snap);
    desired.assets[0].asset_code = "EX-NEW";
    desired.equipment_pages[0].is_published = false;
    const p = plan(manifestFor(snap, desired), snap);
    expect(p.refusals.map((r) => r.message)).toEqual(
      expect.arrayContaining([`protected asset ${A1}: asset_code never change`, `the page of protected asset ${A1} would be unpublished`])
    );
  });

  it("allows content updates but never the organization's locked columns", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.organizations[0].name = "Northridge Equipment Rentals";
    desired.equipment_pages[0].headline = "New headline";
    const ok = plan(manifestFor(snap, desired), snap);
    expect(ok.ok).toBe(true);
    expect(ok.changes.organizations.update).toEqual([{ id: ORG, columns: ["name"] }]);
    expect(ok.changes.equipment_pages.update).toEqual([{ id: P1, columns: ["headline"] }]);
    expect(ORGANIZATION_LOCKED_COLUMNS).toContain("return_notification_mode");
    desired.organizations[0].return_notification_mode = "daily_exceptions";
    desired.organizations[0].status = "suspended";
    expect(plan(manifestFor(snap, desired), snap).refusals.map((r) => r.message)).toContain(
      "organization columns a reset never changes: status, return_notification_mode"
    );
  });

  it("ignores updated_at, which the database re-stamps on every update", () => {
    expect(managedColumns(GRAPH).assets).toEqual(["updated_at"]);
    expect(managedColumns(GRAPH).form_submissions).toBeUndefined();
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.assets[0].updated_at = "2030-01-01T00:00:00+00:00";
    expect(plan(manifestFor(snap, desired), snap).counts.assets).toEqual({ KEEP: 3, UPDATE: 0, INSERT: 0, DELETE: 0 });
  });

  it("refuses deletes whose CASCADE or SET NULL effect would reach a kept row", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.asset_rental_sessions = [];
    desired.assets[0].active_rental_session_id = null;
    const messages = plan(manifestFor(snap, desired), snap).refusals.map((r) => r.message);
    expect(messages).toContain(`deleting asset_rental_sessions ${S1} would silently clear form_submissions.rental_session_id on ${F1}`);
    expect(messages).toContain(`deleting asset_rental_sessions ${S1} would silently clear asset_acknowledgements.rental_session_id on ${K1}`);
    const spare = noopDesired(snap);
    spare.assets = spare.assets.filter((a) => a.id !== A3);
    const ok = plan(manifestFor(snap, spare), snap);
    expect(ok.ok).toBe(true);
    expect(ok.changes.assets.delete).toEqual([A3]);
  });

  it("refuses dangling and cross-organization references and rows of another organization", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.documents = [row("documents", { id: id("ef", 1), organization_id: ORG, asset_id: id("a1", 99), title: "x", document_type: "manual", visibility: "private", link_status: "unknown" })];
    desired.inspection_templates = [row("inspection_templates", { id: id("fa", 1), organization_id: OTHER, family_key: "x", version: 1, status: "draft", name: "x", source_system_template_key: "x", definition_json: {} })];
    expect(codes(plan(manifestFor(snap, desired), snap))).toEqual(expect.arrayContaining(["integrity", "cross-org"]));
  });

  it("refuses a second active session without closing the first, and accepts the draft that closes it", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.asset_rental_sessions.push(row("asset_rental_sessions", { ...snap.tables.asset_rental_sessions[0], id: id("b1", 2) }));
    expect(plan(manifestFor(snap, desired), snap).refusals.map((r) => r.message)).toContain(`asset ${A1} has more than one active session`);
  });

  it("refuses return checklists dated after the digest watermark (seed-notification suppression)", () => {
    const snap = snapshot();
    const base = { ...snap.tables.form_submissions[0], rental_session_id: null, submission_origin: "staff" };
    const atW = noopDesired(snap);
    atW.form_submissions.push(row("form_submissions", { ...base, id: id("e1", 2), created_at: W }));
    expect(plan(manifestFor(snap, atW), snap).ok).toBe(true);
    const late = noopDesired(snap);
    late.form_submissions.push(row("form_submissions", { ...base, id: id("e1", 3), created_at: "2026-09-30T13:00:00.001+00:00" }));
    const p = plan(manifestFor(snap, late), snap);
    expect(codes(p)).toEqual(["watermark"]);
    expect(p.refusals[0].message).toMatch(/dated after the digest watermark 2026-09-30T13:00:00.000Z/);
    // Other submission types never reach the digest.
    const damage = noopDesired(snap);
    damage.form_submissions.push(row("form_submissions", { ...base, id: id("e1", 4), form_type: "damage_report", created_at: "2026-10-05T00:00:00+00:00" }));
    expect(plan(manifestFor(snap, damage), snap).ok).toBe(true);
  });

  it("refuses malformed manifests: a wildcard org, another graph, listed scans, wrong columns", () => {
    const snap = snapshot();
    const wildcard = { ...manifestFor(snap, noopDesired(snap)), organization_id: "*" };
    expect(plan(wildcard, snap).refusals[0].message).toMatch(/one exact organization id/);
    expect(codes(plan({ ...manifestFor(snap, noopDesired(snap)), graph_sha256: "x" }, snap))).toEqual(["manifest"]);
    const scans = { ...noopDesired(snap), scan_events: snap.tables.scan_events };
    expect(codes(plan(manifestFor(snap, scans), snap))).toContain("append-only");
    const columns = noopDesired(snap);
    delete columns.assets[2].asset_code;
    expect(codes(plan(manifestFor(snap, columns), snap))).toContain("columns");
  });

  it("refuses edits of a published inspection template", () => {
    const snap = snapshot();
    const t = row("inspection_templates", { id: id("fa", 2), organization_id: ORG, family_key: "x", version: 1, status: "published", name: "x", source_system_template_key: "x", definition_json: {} });
    snap.tables.inspection_templates = [t];
    const desired = noopDesired(snap);
    desired.inspection_templates[0].name = "edited";
    expect(plan(manifestFor(snap, desired), snap).refusals.map((r) => r.message)).toContain(
      `inspection template ${t.id} is published or retired (immutable; insert a new version instead)`
    );
  });
});

describe("manifest builders", () => {
  it("the E2C draft closes open sessions, removes restricted rows and makes hosted documents private", () => {
    const snap = snapshot();
    snap.tables.documents = [row("documents", { id: id("ef", 2), organization_id: ORG, asset_id: A1, title: "m", document_type: "manual", storage_path: `org/${ORG}/x.pdf`, visibility: "public", link_status: "ok" })];
    const p = plan(manifestFor(snap, draftE2cDesired(snap), "draft-e2c"), snap);
    expect(p.refusals).toEqual([]);
    expect(p.counts.asset_rental_sessions).toEqual({ KEEP: 0, UPDATE: 1, INSERT: 0, DELETE: 0 });
    expect(p.changes.assets.update).toEqual([{ id: A1, columns: ["active_rental_session_id"] }]);
    expect(p.counts.form_submissions.DELETE).toBe(1);
    expect(p.counts.asset_acknowledgements.DELETE).toBe(1);
    expect(p.changes.documents.update).toEqual([{ id: id("ef", 2), columns: ["visibility"] }]);
    expect(p.counts.qr_links).toEqual({ KEEP: 1, UPDATE: 0, INSERT: 0, DELETE: 0 });
  });

  it("a rollback restores the archive and keeps a later visitor row", () => {
    const archive = snapshot();
    const afterCutover = clone(archive);
    afterCutover.tables.form_submissions = [];
    const inserted = row("form_submissions", { ...archive.tables.form_submissions[0], id: id("e1", 7), rental_session_id: null, created_at: W });
    const visitor = row("form_submissions", { ...archive.tables.form_submissions[0], id: id("e1", 8), form_type: "damage_report", rental_session_id: null, created_at: "2026-10-02T00:00:00+00:00" });
    afterCutover.tables.form_submissions.push(inserted, visitor);
    const desired = restoreDesired({ snapshot: afterCutover, archiveRows: archive.tables, cutoverInsertIds: { form_submissions: [inserted.id] } });
    expect(desired.form_submissions.map((r) => r.id).sort()).toEqual([F1, visitor.id].sort());
    const p = plan(manifestFor(afterCutover, desired, "restore"), afterCutover);
    expect(p.ok).toBe(true);
    expect(p.changes.form_submissions).toEqual({ insert: [F1], update: [], delete: [inserted.id] });
  });

  it("a rollback during a suspension window keeps the organization's live status and routing", () => {
    const archive = snapshot();
    const suspended = clone(archive);
    suspended.tables.organizations[0].status = "suspended";
    suspended.tables.organizations[0].return_notification_mode = "off";
    const desired = restoreDesired({ snapshot: suspended, archiveRows: archive.tables });
    expect(desired.organizations[0]).toMatchObject({ status: "suspended", return_notification_mode: "off" });
    expect(plan(manifestFor(suspended, desired, "restore"), suspended).counts.organizations).toEqual({ KEEP: 1, UPDATE: 0, INSERT: 0, DELETE: 0 });
  });
});

describe("emitResetSql", () => {
  it("emits one guarded transaction: lock, id-set and watermark guards, ordered writes, post-checks", () => {
    const snap = snapshot();
    const manifest = manifestFor(snap, draftE2cDesired(snap), "draft-e2c");
    const p = plan(manifest, snap);
    const sql = emitResetSql({ plan: p, manifest, live: snap, graph: GRAPH });
    expect(sql.full.startsWith("-- Phase E reset plan unit")).toBe(true);
    expect(sql.prelude).toContain(`select id from public.organizations where id = '${ORG}'::uuid for update;`);
    expect(sql.prelude).toContain("the assets id set differs from the plan");
    expect(sql.prelude).toContain("the digest watermark moved");
    expect(sql.prelude).toContain(`'${idSetMd5([A1, A2, A3])}'`);
    const clear = sql.writes.indexOf("set active_rental_session_id = null");
    const close = sql.writes.indexOf('update public."asset_rental_sessions"');
    const del = sql.writes.indexOf('delete from public."form_submissions"');
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(clear);
    expect(del).toBeGreaterThan(close);
    expect(sql.postchecks).toContain("protected QR rows changed");
    expect(sql.postchecks).toContain("fk assets.active_rental_session_id");
    expect(sql.commit).toBe("commit;");
  });

  it("inserts submissions unbound and corrects them exactly afterwards; sets new pointers last", () => {
    const snap = snapshot();
    snap.tables.asset_rental_sessions[0].status = "returned";
    snap.tables.assets[0].active_rental_session_id = null;
    const desired = noopDesired(snap);
    const S2 = id("b1", 3);
    desired.asset_rental_sessions.push(row("asset_rental_sessions", { id: S2, organization_id: ORG, asset_id: A1, status: "active", started_at: "2026-09-22T00:00:00+00:00" }));
    desired.assets[0].active_rental_session_id = S2;
    desired.form_submissions.push(
      row("form_submissions", { ...snap.tables.form_submissions[0], id: id("e1", 5), submission_origin: "staff", rental_session_id: S2, created_at: "2026-09-23T00:00:00+00:00" })
    );
    const manifest = manifestFor(snap, desired);
    const p = plan(manifest, snap);
    expect(p.refusals).toEqual([]);
    const sql = emitResetSql({ plan: p, manifest, live: snap, graph: GRAPH });
    const inserted = /insert into public\."form_submissions" .*?\$r\$(.*?)\$r\$/s.exec(sql.writes)?.[1] ?? "[]";
    expect(JSON.parse(inserted)[0]).toMatchObject({ form_type: "damage_report", submission_origin: "public", submitted_by_profile_id: null, rental_session_id: null });
    expect(sql.writes).toMatch(/set \("form_type", "submission_origin", "rental_session_id"\) = \(select r\."form_type", r\."submission_origin", r\."rental_session_id"/);
    expect(sql.writes.lastIndexOf('update public."assets" t set "active_rental_session_id"')).toBeGreaterThan(sql.writes.indexOf('insert into public."asset_rental_sessions"'));
  });

  it("refuses to emit for a refused plan or a value that is not a uuid", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.qr_links[0].status = "disabled";
    const manifest = manifestFor(snap, desired);
    expect(() => emitResetSql({ plan: plan(manifest, snap), manifest, live: snap, graph: GRAPH })).toThrow(/plan with refusals/);
    const ok = manifestFor(snap, noopDesired(snap));
    const p = plan(ok, snap);
    expect(() => emitResetSql({ plan: { ...p, organization_id: "1' or '1'='1" }, manifest: ok, live: snap, graph: GRAPH })).toThrow(/exact uuid/);
  });

  it("hashes id sets the way the SQL guard does", () => {
    expect(idSetMd5([])).toBe("");
    expect(idSetMd5([A2, A1])).toBe(createHash("md5").update(`${A1},${A2}`).digest("hex"));
  });
});

describe("planSummary", () => {
  it("carries counts and refusal codes, never row ids", () => {
    const snap = snapshot();
    const desired = noopDesired(snap);
    desired.qr_links[0].status = "disabled";
    const summary = planSummary(plan(manifestFor(snap, desired), snap));
    expect(summary.refusal_codes).toEqual(["frozen"]);
    expect(JSON.stringify(summary)).not.toContain(Q1);
    expect(rowHash(summary)).toMatch(/^[0-9a-f]{64}$/);
  });
});
