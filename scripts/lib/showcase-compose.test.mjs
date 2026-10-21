import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { composeDatasetReset, composeShowcase, datasetStage, e2aOverlay, publicObjectUrl, rollbackScanRemovals } from "./showcase-compose.mjs";
import { expandDataset, ownedIds } from "./showcase-dataset.mjs";
import { buildManifest, emitResetSql, planReset } from "./showcase-reset.mjs";

// Engineering Phase E2B: the dataset manifests (showcase, presenter, refresh) composed from the tracked synthetic dataset
// and the four E2A import manifests, on a small synthetic snapshot shaped like the rehearsal targets.

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const GRAPH = read("../../docs/phase-e/manifests/tenant-dependency-graph.json");
const DATASET = read("../../docs/phase-e/showcase/dataset.json");
const MEDIA = read("../../docs/phase-e/showcase/media.json");
const IMPORTS = ["bobcat.e20.b3bl-canopy", "cat.301-5.canopy", "bigtex.35sa.12", "bigtex.14lp.14"].map((p) => read(`../../docs/phase-e/packs/${p}/import-manifest.json`));
const ORG = DATASET.organization_id;
const ANCHOR = Date.parse(DATASET.anchor.utc);
const NOW = new Date(ANCHOR + 2 * 3600_000);
const API = "http://127.0.0.1:54321";
const [EX017, EX3015, TR014, TR2041] = DATASET.assets;
const OTHER_ASSET = "21111111-1111-4111-8111-111111111103";
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

function row(table, values) {
  return { ...Object.fromEntries(GRAPH.tables[table].columns.map((c) => [c.name, null])), ...values };
}

/** A rehearsal-target-shaped Northridge: the four showcase assets (old test rentals on them), one other asset. */
function snapshot() {
  const t = Object.fromEntries(GRAPH.insert_order.map((x) => [x, []]));
  t.organizations = [row("organizations", { id: ORG, name: "Northridge", slug: "northridge-rentals", status: "active", return_notification_mode: "instant_renter" })];
  t.assets = [...DATASET.assets.map((a) => row("assets", { id: a.asset_id, organization_id: ORG, asset_code: a.asset_code, public_status: "public", category: "Old" })), row("assets", { id: OTHER_ASSET, organization_id: ORG, asset_code: "GEN-008", public_status: "public", active_rental_session_id: id("b2", 2) })];
  t.assets[0].active_rental_session_id = id("b2", 1);
  t.equipment_pages = t.assets.map((a, i) => row("equipment_pages", { id: id("d2", i + 1), organization_id: ORG, asset_id: a.id, is_published: true, headline: "Old" }));
  t.qr_links = DATASET.assets.map((a) => row("qr_links", { id: a.qr_link_id, organization_id: ORG, asset_id: a.asset_id, short_code: a.short_code, status: "active", is_production_primary: true }));
  t.documents = [
    row("documents", { id: id("e2", 1), organization_id: ORG, asset_id: EX017.asset_id, title: "Old manual", document_type: "manual", url: "https://example.com/m.pdf", visibility: "public" }),
    row("documents", { id: id("e2", 2), organization_id: ORG, asset_id: OTHER_ASSET, title: "Hosted", document_type: "manual", storage_path: "org/x/doc.pdf", visibility: "public" }),
  ];
  t.asset_rental_sessions = [
    row("asset_rental_sessions", { id: id("b2", 1), organization_id: ORG, asset_id: EX017.asset_id, status: "active", started_at: "2026-09-01T16:00:00+00:00", created_at: "2026-09-01T16:00:00+00:00" }),
    row("asset_rental_sessions", { id: id("b2", 2), organization_id: ORG, asset_id: OTHER_ASSET, status: "active", started_at: "2026-09-02T16:00:00+00:00", created_at: "2026-09-02T16:00:00+00:00" }),
    row("asset_rental_sessions", { id: id("b2", 3), organization_id: ORG, asset_id: TR014.asset_id, status: "returned", started_at: "2026-08-01T16:00:00+00:00", returned_at: "2026-08-02T23:00:00+00:00" }),
  ];
  t.form_submissions = [row("form_submissions", { id: id("f2", 1), organization_id: ORG, asset_id: EX017.asset_id, form_type: "damage_report", submission_origin: "public", status: "new", created_at: "2026-09-03T18:00:00+00:00", submission_data_json: {}, media_urls: [] })];
  t.asset_acknowledgements = [row("asset_acknowledgements", { id: id("a2", 1), organization_id: ORG, asset_id: EX017.asset_id, rental_session_id: id("b2", 1), name: "Old", statement: "ok" })];
  t.scan_events = [row("scan_events", { id: id("c2", 1), organization_id: ORG, asset_id: EX017.asset_id, qr_link_id: EX017.qr_link_id, scanned_at: "2026-09-05T18:00:00+00:00", device_type: "mobile" })];
  t.notification_digest_runs = [
    row("notification_digest_runs", { id: id("ab", 1), organization_id: ORG, digest_type: "return_exceptions", window_start: new Date(ANCHOR - 86_400_000).toISOString(), window_end: DATASET.anchor.utc, status: "skipped_quiet", item_count: 0 }),
  ];
  return { taken_at: new Date(NOW.getTime() - 60_000).toISOString(), tables: t, identity: [] };
}

const PROTECTED = { qrLinkIds: DATASET.assets.map((a) => a.qr_link_id), assetIds: DATASET.assets.map((a) => a.asset_id) };
const overlay = () => e2aOverlay(IMPORTS, { apiUrl: API, repoRoot: "/repo", createdAt: DATASET.history_start_utc });
const manifestOf = (kind, snap, composed) =>
  buildManifest({ name: `unit-${kind}`, kind, target: "local", organizationId: ORG, snapshot: snap, graph: GRAPH, protectedSet: PROTECTED, desired: composed.desired, extra: composed.extra, now: NOW });
const plan = (manifest, live, now = NOW) => planReset({ manifest, live, graph: GRAPH, now });
const codes = (p) => p.refusals.map((r) => r.code);

/** The rows a target holds after an accepted plan is applied (what the SQL writes). */
function applied(manifest, live) {
  const tables = clone(live.tables);
  for (const t of GRAPH.insert_order) {
    if (t === "notification_digest_runs") continue;
    if (t === "scan_events") {
      const drop = new Set([...(manifest.remove?.scan_events ?? []), ...(manifest.owned_history?.scan_events ?? [])]);
      const map = new Map(tables.scan_events.filter((r) => !drop.has(r.id)).map((r) => [r.id, r]));
      for (const r of manifest.append?.scan_events ?? []) map.set(r.id, clone(r));
      tables.scan_events = [...map.values()];
    } else tables[t] = clone(manifest.desired[t]);
  }
  return { taken_at: NOW.toISOString(), tables, identity: [] };
}

function showcase() {
  const snap = snapshot();
  const composed = composeShowcase({ snapshot: snap, dataset: DATASET, datasetSha256: "x", overlay: overlay(), stage: datasetStage(DATASET, MEDIA.items, "/repo") });
  return { snap, manifest: manifestOf("showcase", snap, composed) };
}

describe("E2A overlay", () => {
  it("reads the four import manifests: asset fields, pages, documents, uploads", () => {
    const o = overlay();
    expect(o.assets.size).toBe(4);
    expect(o.pages.size).toBe(4);
    expect(o.assets.get(EX017.asset_id).cover_image_url).toBe(publicObjectUrl(API, IMPORTS[0].operations.find((op) => op.op === "upload" && op.bucket === "public-assets").path));
    expect(o.assets.get(TR014.asset_id).cover_image_url).toBeNull();
    expect(o.assets.get(TR2041.asset_id).return_inspection_template_key).toBe("utility_trailer");
    expect(o.insertDocuments.every((d) => d.created_at === DATASET.history_start_utc && d.last_checked_at === null)).toBe(true);
    expect(o.applyAllowed).toBe(false);
  });
});

describe("showcase (first application)", () => {
  it("is accepted: old rentals of the showcase assets removed by exact id, draft-e2c elsewhere, E2A and the dataset added", () => {
    const { snap, manifest } = showcase();
    const p = plan(manifest, snap);
    expect(p.refusals).toEqual([]);
    const owned = ownedIds(DATASET);
    expect(p.counts.asset_rental_sessions.INSERT).toBe(owned.asset_rental_sessions.length);
    expect(p.counts.asset_rental_sessions.DELETE).toBe(2);
    expect(p.changes.asset_rental_sessions.update).toEqual([{ id: id("b2", 2), columns: ["status"] }]);
    expect(p.counts.form_submissions).toMatchObject({ INSERT: owned.form_submissions.length, DELETE: 1 });
    expect(p.counts.asset_acknowledgements).toMatchObject({ INSERT: owned.asset_acknowledgements.length, DELETE: 1 });
    expect(p.counts.scan_events).toMatchObject({ KEEP: 1, INSERT: owned.scan_events.length, DELETE: 0 });
    expect(p.counts.documents.INSERT).toBe(manifest.allow_insert.documents.length);
    expect(p.counts.qr_links.UPDATE + p.counts.qr_links.INSERT + p.counts.qr_links.DELETE).toBe(0);
    const sql = emitResetSql({ plan: p, manifest, live: snap, graph: GRAPH });
    expect(sql.writes).toContain('insert into public."scan_events"');
    expect(sql.writes).toContain('delete from public."asset_rental_sessions"');
    expect(manifest.storage.stage.length).toBe(DATASET.objects.length + IMPORTS.flatMap((im) => im.operations.filter((op) => op.op === "upload")).length);
  });

  it("converges after the apply, and refuses to build a second time", () => {
    const { snap, manifest } = showcase();
    const after = applied(manifest, snap);
    const again = plan(manifest, after);
    expect(again.refusals).toEqual([]);
    expect(Object.values(again.counts).every((c) => c.UPDATE + c.INSERT + c.DELETE === 0)).toBe(true);
    expect(() => composeShowcase({ snapshot: after, dataset: DATASET, datasetSha256: "x", overlay: overlay() })).toThrow(/already on this target/);
  });

  it("removes scans only by exact id, and only when asked", () => {
    const snap = snapshot();
    const composed = composeShowcase({ snapshot: snap, dataset: DATASET, datasetSha256: "x", overlay: overlay(), options: { removeShowcaseScans: true } });
    const p = plan(manifestOf("showcase", snap, composed), snap);
    expect(p.ok).toBe(true);
    expect(p.counts.scan_events.DELETE).toBe(1);
  });

  it("refuses deletions and updates outside the dataset and the exact lists", () => {
    const { snap, manifest } = showcase();
    const strayDelete = clone(manifest);
    strayDelete.desired.documents = strayDelete.desired.documents.filter((d) => d.id !== id("e2", 2));
    expect(codes(plan(strayDelete, snap))).toContain("delete-allowlist");
    const strayUpdate = clone(manifest);
    strayUpdate.desired.assets = strayUpdate.desired.assets.map((a) => (a.id === OTHER_ASSET ? { ...a, asset_name: "Renamed" } : a));
    expect(codes(plan(strayUpdate, snap))).toContain("update-bound");
    const strayScan = clone(manifest);
    strayScan.owned_history = { ...strayScan.owned_history, scan_events: [id("c2", 1)] };
    expect(codes(plan(strayScan, snap))).toEqual([]);
  });

  it("refuses future dataset timestamps and an anchor whose digest run may still be running", () => {
    const { snap, manifest } = showcase();
    expect(codes(plan(manifest, snap, new Date(ANCHOR + 30 * 60_000)))).toContain("anchor");
    const future = clone(manifest);
    future.desired.form_submissions[0].created_at = new Date(NOW.getTime() + 3600_000).toISOString().replace(".000Z", "+00:00");
    expect(codes(plan(future, snap))).toContain("future");
  });

  it("refuses dataset returns the next digest would summarize (the watermark)", () => {
    const snap = snapshot();
    snap.tables.notification_digest_runs[0].window_end = new Date(ANCHOR - 3 * 86_400_000).toISOString();
    const composed = composeShowcase({ snapshot: snap, dataset: DATASET, datasetSha256: "x", overlay: overlay() });
    expect(codes(plan(manifestOf("showcase", snap, composed), snap))).toContain("watermark");
  });

  it("refuses an overlapping rental and a display-reference collision", () => {
    const { snap, manifest } = showcase();
    const overlap = clone(manifest);
    overlap.desired.asset_rental_sessions.push(row("asset_rental_sessions", { id: id("b2", 9), organization_id: ORG, asset_id: EX3015.asset_id, status: "returned", started_at: "2026-10-15T16:00:00+00:00", returned_at: "2026-10-16T00:00:00+00:00" }));
    overlap.allow_insert.asset_rental_sessions = [id("b2", 9)];
    expect(codes(plan(overlap, snap))).toContain("overlap");
    const ref = clone(manifest);
    const victim = ref.desired.form_submissions.find((r) => r.form_type === "damage_report");
    const twin = { ...clone(victim), id: `${victim.id.slice(0, 6)}aa-0000-4000-8000-000000000001`, status: "new" };
    ref.desired.form_submissions.push(twin);
    ref.allow_insert.form_submissions = [twin.id];
    expect(codes(plan(ref, snap))).toContain("reference");
  });
});

describe("presenter reset and refresh (composed from the locked live rows)", () => {
  const applyShowcase = () => {
    const { snap, manifest } = showcase();
    return applied(manifest, snap);
  };

  it("is all KEEP right after the showcase", () => {
    const live = applyShowcase();
    const p = plan(manifestOf("presenter", live, composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x" })), live);
    expect(p.refusals).toEqual([]);
    expect(Object.values(p.counts).every((c) => c.UPDATE + c.INSERT + c.DELETE === 0)).toBe(true);
  });

  it("reverts dataset rows a live demo changed, keeps organic rows, and names a live return on the synthetic rental", () => {
    const live = applyShowcase();
    const t = live.tables;
    const support = t.form_submissions.find((r) => r.form_type === "support_request" && r.status === "new");
    support.status = "resolved";
    const active = t.asset_rental_sessions.find((s) => s.id === EX017.active_rental_session_id);
    active.status = "returned";
    active.returned_at = new Date(NOW.getTime() - 60_000).toISOString().replace(".000Z", "+00:00");
    t.assets.find((a) => a.id === EX017.asset_id).active_rental_session_id = null;
    const liveReturn = row("form_submissions", { id: id("f3", 1), organization_id: ORG, asset_id: EX017.asset_id, form_type: "return_checklist", submission_origin: "staff", rental_session_id: active.id, status: "resolved", created_at: active.returned_at, submission_data_json: {}, media_urls: [] });
    const organic = row("form_submissions", { id: id("f3", 2), organization_id: ORG, asset_id: TR014.asset_id, form_type: "damage_report", submission_origin: "public", status: "new", created_at: active.returned_at, submission_data_json: {}, media_urls: [] });
    const demoAck = row("asset_acknowledgements", { id: id("a3", 1), organization_id: ORG, asset_id: EX017.asset_id, rental_session_id: active.id, name: "Presenter", statement: "ok", acknowledged_at: active.returned_at, created_at: active.returned_at });
    t.form_submissions.push(liveReturn, organic);
    t.asset_acknowledgements.push(demoAck);
    t.scan_events.push(row("scan_events", { id: id("c3", 1), organization_id: ORG, asset_id: EX017.asset_id, qr_link_id: EX017.qr_link_id, scanned_at: active.returned_at, device_type: "mobile" }));

    const blocked = plan(manifestOf("presenter", live, composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x" })), live);
    expect(codes(blocked)).toContain("conflict");
    expect(blocked.refusals.find((r) => r.code === "conflict").message).toContain(id("f3", 1));

    const ok = plan(manifestOf("presenter", live, composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x", removeIds: { form_submissions: [id("f3", 1)], asset_acknowledgements: [id("a3", 1)] } })), live);
    expect(ok.refusals).toEqual([]);
    expect(ok.changes.form_submissions.update.map((u) => u.id)).toEqual([support.id]);
    expect(ok.changes.form_submissions.delete).toEqual([id("f3", 1)]);
    expect(ok.changes.asset_acknowledgements.delete).toEqual([id("a3", 1)]);
    expect(ok.changes.asset_rental_sessions.update.map((u) => u.id)).toEqual([active.id]);
    expect(ok.counts.scan_events).toMatchObject({ INSERT: 0, DELETE: 0, UPDATE: 0 });
    expect(ok.changes.form_submissions.insert).toEqual([]);
  });

  it("refuses a removal list that names a row the target does not hold", () => {
    const live = applyShowcase();
    expect(() => composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x", removeIds: { form_submissions: [id("f9", 9)] } })).toThrow(/not on the target/);
  });

  it("refuses an organic rental left open on a showcase asset until it is removed", () => {
    const live = applyShowcase();
    const session = row("asset_rental_sessions", { id: id("b3", 1), organization_id: ORG, asset_id: EX3015.asset_id, status: "active", started_at: new Date(NOW.getTime() - 60_000).toISOString().replace(".000Z", "+00:00") });
    live.tables.asset_rental_sessions.push(session);
    live.tables.assets.find((a) => a.id === EX3015.asset_id).active_rental_session_id = session.id;
    expect(codes(plan(manifestOf("presenter", live, composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x" })), live))).toContain("integrity");
    const ok = plan(manifestOf("presenter", live, composeDatasetReset({ live, dataset: DATASET, datasetSha256: "x", removeIds: { asset_rental_sessions: [session.id] } })), live);
    expect(ok.refusals).toEqual([]);
  });

  it("re-dates the dataset in a refresh, deletes rows only an earlier version owned, keeps everything else", () => {
    const live = applyShowcase();
    const organicScan = row("scan_events", { id: id("c4", 1), organization_id: ORG, asset_id: TR2041.asset_id, qr_link_id: TR2041.qr_link_id, scanned_at: "2026-10-20T15:30:00+00:00", device_type: "mobile" });
    live.tables.scan_events.push(organicScan);
    const moved = clone(DATASET);
    const shift = (v) => (v ? new Date(Date.parse(v) - 86_400_000).toISOString().replace(".000Z", "+00:00") : v);
    for (const r of moved.rows.asset_rental_sessions) for (const c of ["started_at", "returned_at", "created_at", "updated_at"]) r[c] = shift(r[c]);
    for (const r of moved.rows.scan_events) r.scanned_at = shift(r.scanned_at);
    const dropped = moved.rows.scan_events.pop();
    moved.retired_ids = [{ key: "scan:x", id: dropped.id, table: "scan_events" }];
    const manifest = manifestOf("refresh", live, composeDatasetReset({ live, dataset: moved, datasetSha256: "y" }));
    const p = plan(manifest, live);
    expect(p.refusals).toEqual([]);
    expect(p.counts.asset_rental_sessions.UPDATE).toBe(DATASET.rows.asset_rental_sessions.length);
    expect(p.counts.scan_events).toMatchObject({ UPDATE: DATASET.rows.scan_events.length - 1, DELETE: 1, INSERT: 0 });
    expect(p.changes.scan_events.delete).toEqual([dropped.id]);
    // The re-plan after the apply converges, although the retired scan the manifest saw is gone.
    const again = plan(manifest, applied(manifest, live));
    expect(again.refusals).toEqual([]);
    expect(Object.values(again.counts).every((c) => c.UPDATE + c.INSERT + c.DELETE === 0)).toBe(true);
  });

  it("lets a rollback remove the dataset's appended scans", () => {
    const { snap, manifest } = showcase();
    const live = applied(manifest, snap);
    expect(rollbackScanRemovals(manifest, live)).toEqual(expandDataset(DATASET).rows.scan_events.map((r) => r.id).sort());
  });
});
