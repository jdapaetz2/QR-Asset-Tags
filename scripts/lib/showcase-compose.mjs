/**
 * Engineering Phase E2B — compose the dataset reset manifests from a live snapshot, the tracked synthetic dataset and the
 * four E2A import manifests. Pure: no I/O, never executes anything; scripts/lib/showcase-reset.mjs plans and emits them.
 *
 *   showcase   first application (rehearsal targets now, the E2C cutover later): the approved draft-e2c shape, the old
 *              rentals of the four showcase assets removed by exact id, the E2A content overlaid, the dataset inserted.
 *              Built from a snapshot; refused once any dataset row exists on the target.
 *   presenter  the bounded presenter reset, composed from the LOCKED live rows: dataset rows go back to their authored
 *              values, the four rental pointers to the dataset's, the given exact ids are removed; every other row (a
 *              visitor's report, a scan) is kept.
 *   refresh    an explicit owner-run new snapshot: like presenter, with a rebuilt dataset (new anchor, same ids); rows only
 *              an earlier dataset version owned are deleted. Never re-runs draft-e2c.
 *
 * Every non-dataset write a manifest may make is listed exactly (allow_insert / allow_update with columns, remove), and
 * the planner refuses anything outside those lists.
 */
import { draftE2cDesired, noopDesired } from "./showcase-reset.mjs";
import { DATASET_TABLES, expandDataset, ownedIds, retiredIds } from "./showcase-dataset.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const PAGE_COLUMNS = ["headline", "quick_start_text", "safety_notes", "fuel_power_notes", "return_notes", "troubleshooting_notes", "emergency_notes", "is_published"];

/** Public URL of a public-assets object, the way supabase-js getPublicUrl builds it. */
export function publicObjectUrl(apiUrl, path) {
  return `${String(apiUrl).replace(/\/+$/, "")}/storage/v1/object/public/public-assets/${path}`;
}

/**
 * The E2A overlay of the four import manifests: per asset the field values, the page fields, the documents to insert,
 * the documents made private and the objects to upload. Statuses (READY / REVIEW_REQUIRED / BLOCKED) are carried so a
 * dry run can show what is still draft; on rehearsal targets the whole draft is applied.
 */
export function e2aOverlay(importManifests, { apiUrl, repoRoot, createdAt }) {
  const overlay = { assets: new Map(), pages: new Map(), insertDocuments: [], privateDocuments: new Set(), uploads: [], statuses: [], applyAllowed: true };
  for (const im of importManifests) {
    overlay.applyAllowed &&= Boolean(im.apply?.allowed);
    for (const op of im.operations ?? []) {
      if (op.op === "upload") {
        overlay.uploads.push({ bucket: op.bucket, path: op.path, sha256: op.sha256, bytes: op.bytes, mimetype: op.content_type, cacheControl: "3600", source: `${repoRoot}/${op.from}` });
        overlay.statuses.push({ pack: im.pack, what: `upload ${op.key}`, status: op.status });
      } else if (op.op === "update" && op.table === "assets") {
        const fields = {};
        for (const [column, f] of Object.entries(op.fields)) {
          fields[column] = f.to && typeof f.to === "object" && "public_url_of" in f.to ? publicObjectUrl(apiUrl, f.to.public_url_of) : f.to;
          overlay.statuses.push({ pack: im.pack, what: `asset.${column}`, status: f.status });
        }
        overlay.assets.set(op.match.id, fields);
      } else if (op.op === "upsert" && op.table === "equipment_pages") {
        const fields = {};
        for (const [column, f] of Object.entries(op.fields)) {
          if (!PAGE_COLUMNS.includes(column)) throw new Error(`E2A page field ${column} is not an equipment_pages column the overlay writes`);
          fields[column] = f.to;
          overlay.statuses.push({ pack: im.pack, what: `page.${column}`, status: f.status });
        }
        overlay.pages.set(op.match.asset_id, fields);
      } else if (op.op === "insert" && op.table === "documents") {
        overlay.insertDocuments.push({ ...op.row, last_checked_at: null, created_at: createdAt, updated_at: createdAt });
        overlay.statuses.push({ pack: im.pack, what: `document ${op.row.document_type}`, status: op.status });
      } else if (op.op === "update" && op.table === "documents") {
        if (Object.keys(op.set ?? {}).join(",") !== "visibility" || op.set.visibility !== "private") throw new Error("E2A document updates only make documents private");
        overlay.privateDocuments.add(op.match.id);
      } else if (op.op === "none") {
        continue;
      } else {
        throw new Error(`unknown E2A operation ${op.op} ${op.table ?? ""}`);
      }
    }
  }
  return overlay;
}

/** Storage stage entries for the dataset's evidence objects (uploaded only if missing, never overwritten). */
export function datasetStage(dataset, mediaItems, repoRoot) {
  const files = new Map(mediaItems.map((m) => [m.key, m.file]));
  return dataset.objects.map((o) => ({
    bucket: o.bucket,
    path: o.path,
    sha256: o.sha256,
    bytes: o.bytes,
    mimetype: o.content_type,
    cacheControl: "3600",
    source: `${repoRoot}/docs/phase-e/showcase/media/${files.get(o.media)}`,
  }));
}

function datasetInfo(dataset, datasetSha256) {
  return {
    schema: dataset.schema,
    scenario_version: dataset.scenario.version,
    scenario_sha256: dataset.scenario.sha256,
    sha256: datasetSha256,
    anchor_utc: dataset.anchor.utc,
    anchor_local: `${dataset.anchor.local} ${dataset.anchor.time_zone}`,
  };
}

const setPointers = (desired, dataset) => {
  const pointers = new Map(dataset.assets.map((a) => [a.asset_id, a.active_rental_session_id ?? null]));
  desired.assets = desired.assets.map((a) => (pointers.has(a.id) ? { ...a, active_rental_session_id: pointers.get(a.id) } : a));
};

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

/** Replace or add the dataset's rows by id (dataset tables other than the append-only scans). */
function overlayDatasetRows(desired, expanded) {
  for (const table of DATASET_TABLES) {
    if (table === "scan_events") continue;
    const rows = byId(desired[table] ?? []);
    for (const row of expanded.rows[table]) rows.set(row.id, clone(row));
    desired[table] = [...rows.values()];
  }
}

/**
 * The first application. `options.removeShowcaseScans` also removes every scan of the four showcase assets that the
 * snapshot holds (an E2C decision; off by default — scans stay append-only).
 */
export function composeShowcase({ snapshot, dataset, datasetSha256, overlay, stage = [], options = {} }) {
  const expanded = expandDataset(dataset);
  const owned = ownedIds(dataset);
  const showcaseAssets = new Set(dataset.assets.map((a) => a.asset_id));
  const live = snapshot.tables;
  for (const table of DATASET_TABLES) {
    const present = new Set((live[table] ?? []).map((r) => r.id));
    const already = owned[table].filter((id) => present.has(id));
    if (already.length) throw new Error(`the showcase dataset is already on this target (${already.length} ${table} rows): use a presenter reset or a refresh`);
  }
  for (const id of showcaseAssets) if (!live.assets.some((a) => a.id === id)) throw new Error(`showcase asset ${id} is missing on the target (run the bootstrap on a rehearsal target)`);

  const desired = draftE2cDesired(snapshot);
  const remove = {
    asset_rental_sessions: live.asset_rental_sessions.filter((s) => showcaseAssets.has(s.asset_id)).map((s) => s.id).sort(),
    form_submissions: live.form_submissions.map((s) => s.id).sort(),
    asset_acknowledgements: live.asset_acknowledgements.map((s) => s.id).sort(),
  };
  if (options.removeShowcaseScans) remove.scan_events = live.scan_events.filter((s) => showcaseAssets.has(s.asset_id)).map((s) => s.id).sort();
  desired.asset_rental_sessions = desired.asset_rental_sessions.filter((s) => !showcaseAssets.has(s.asset_id));

  const allowUpdate = { assets: {}, equipment_pages: {}, documents: {}, asset_rental_sessions: {} };
  // draft-e2c side effects on the rest of the organization (its approved shape): open rentals cancelled, pointers
  // cleared, hosted documents of unknown rights private.
  const liveSessions = byId(live.asset_rental_sessions);
  for (const s of desired.asset_rental_sessions) if (liveSessions.get(s.id)?.status === "active" && s.status === "cancelled") allowUpdate.asset_rental_sessions[s.id] = ["status"];
  for (const a of live.assets) if (a.active_rental_session_id) allowUpdate.assets[a.id] = ["active_rental_session_id"];
  for (const d of live.documents) if (d.storage_path && d.visibility !== "private") allowUpdate.documents[d.id] = ["visibility"];

  // E2A: asset fields, pages, documents (every older document of the four assets becomes private).
  desired.assets = desired.assets.map((a) => {
    const fields = overlay.assets.get(a.id);
    if (!showcaseAssets.has(a.id)) return a;
    if (!fields) throw new Error(`the E2A overlay has no fields for showcase asset ${a.id}`);
    allowUpdate.assets[a.id] = [...new Set([...Object.keys(fields), "active_rental_session_id"])];
    return { ...a, ...fields };
  });
  for (const assetId of showcaseAssets) {
    const fields = overlay.pages.get(assetId);
    const page = desired.equipment_pages.find((p) => p.asset_id === assetId);
    if (!fields) throw new Error(`the E2A overlay has no page for showcase asset ${assetId}`);
    if (!page) throw new Error(`showcase asset ${assetId} has no equipment page on the target (run the bootstrap on a rehearsal target)`);
    allowUpdate.equipment_pages[page.id] = Object.keys(fields);
  }
  desired.equipment_pages = desired.equipment_pages.map((p) => (showcaseAssets.has(p.asset_id) ? { ...p, ...overlay.pages.get(p.asset_id) } : p));
  desired.documents = desired.documents.map((d) => {
    if (!showcaseAssets.has(d.asset_id) && !overlay.privateDocuments.has(d.id)) return d;
    if (d.visibility !== "private" || allowUpdate.documents[d.id]) allowUpdate.documents[d.id] = ["visibility"];
    return { ...d, visibility: "private" };
  });
  const liveDocs = new Set(live.documents.map((d) => d.id));
  const inserts = overlay.insertDocuments.filter((d) => showcaseAssets.has(d.asset_id));
  for (const d of inserts) if (liveDocs.has(d.id)) throw new Error(`E2A document ${d.id} already exists on the target`);
  desired.documents.push(...clone(inserts));

  // The dataset, then the four pointers.
  overlayDatasetRows(desired, expanded);
  setPointers(desired, dataset);
  for (const table of Object.keys(allowUpdate)) if (Object.keys(allowUpdate[table]).length === 0) delete allowUpdate[table];

  return {
    desired,
    extra: {
      owned,
      owned_history: retiredIds(dataset),
      remove,
      allow_insert: { documents: inserts.map((d) => d.id).sort() },
      allow_update: allowUpdate,
      append: { scan_events: clone(expanded.rows.scan_events) },
      dataset: datasetInfo(dataset, datasetSha256),
      storage: { stage: [...overlay.uploads, ...stage] },
      e2a: { applied_as: "draft", apply_allowed: overlay.applyAllowed, statuses: summarizeStatuses(overlay.statuses) },
    },
  };
}

function summarizeStatuses(statuses) {
  const out = {};
  for (const s of statuses) {
    out[s.pack] ??= { READY: 0, REVIEW_REQUIRED: 0, BLOCKED: 0 };
    out[s.pack][s.status] = (out[s.pack][s.status] ?? 0) + 1;
  }
  return out;
}

/**
 * Presenter reset and refresh, from the locked live rows: dataset rows to their authored values (re-inserted when a
 * presenter deleted one), pointers to the dataset's, `removeIds` (exact ids, e.g. a live demo staff return) deleted, rows
 * only an earlier dataset version owned deleted. Everything else stays exactly as it is.
 */
export function composeDatasetReset({ live, dataset, datasetSha256, removeIds = {}, stage = [] }) {
  const expanded = expandDataset(dataset);
  const owned = ownedIds(dataset);
  const history = retiredIds(dataset);
  const desired = noopDesired(live);
  const removal = {};
  for (const [table, ids] of Object.entries(removeIds)) {
    if (!Array.isArray(ids) || ids.length === 0) continue;
    const present = new Set((live.tables[table] ?? []).map((r) => r.id));
    const absent = ids.filter((rowId) => !present.has(rowId));
    if (absent.length) throw new Error(`the removal list names ${absent.length} ${table} row(s) that are not on the target (${absent.slice(0, 3).join(", ")})`);
    removal[table] = [...new Set(ids)].sort();
    if (desired[table]) {
      const drop = new Set(removal[table]);
      desired[table] = desired[table].filter((r) => !drop.has(r.id));
    }
  }
  for (const table of DATASET_TABLES) {
    if (table === "scan_events" || !desired[table]) continue;
    const drop = new Set(history[table]);
    desired[table] = desired[table].filter((r) => !drop.has(r.id));
  }
  overlayDatasetRows(desired, expanded);
  setPointers(desired, dataset);
  const showcaseAssets = dataset.assets.map((a) => a.asset_id);
  const liveHistory = Object.fromEntries(DATASET_TABLES.map((t) => [t, history[t].filter((id) => (live.tables[t] ?? []).some((r) => r.id === id))]));
  return {
    desired,
    extra: {
      owned,
      owned_history: liveHistory,
      remove: removal,
      allow_insert: {},
      allow_update: { assets: Object.fromEntries(showcaseAssets.map((id) => [id, ["active_rental_session_id"]])) },
      append: { scan_events: clone(expanded.rows.scan_events) },
      dataset: datasetInfo(dataset, datasetSha256),
      storage: { stage },
    },
  };
}

/** The appended scans a rollback removes: the cutover manifest's own scan rows that are on the target. */
export function rollbackScanRemovals(cutover, live) {
  const ids = new Set((cutover?.append?.scan_events ?? []).map((r) => r.id));
  return (live.tables.scan_events ?? []).filter((r) => ids.has(r.id)).map((r) => r.id).sort();
}
