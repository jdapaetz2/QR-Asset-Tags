/**
 * Engineering Phase E1 — the guarded showcase reset planner and its SQL emitter. Pure: no I/O, never executes anything.
 *
 * A reset is described by a NAMED MANIFEST for ONE exact organization (no wildcard): the rows it expects to find (id →
 * row hash, recorded from a snapshot), the rows it wants afterwards (full rows per table), the protected QR rows and
 * assets, and the digest watermark it was built against. `planReset` compares the manifest with a fresh live snapshot
 * and reports KEEP / UPDATE / INSERT / DELETE per table — or refuses. `emitResetSql` turns an accepted plan into one
 * reviewable SQL transaction (triggers ON, foreign keys enforced) that locks, re-checks, writes and post-checks.
 *
 * REFUSALS (any one stops the plan):
 *   drift      a live row that is neither the row the manifest saw nor already the row it wants (so a rerun after an
 *              apply converges to all KEEP), or a row it relies on that is gone; scan_events and the digest ledger are
 *              append-only (never listed, never written; new rows are legitimate, seen rows must remain);
 *   frozen     any write to qr_links (published destinations) or profiles;
 *   protected  deleting a protected asset or its page, changing its code / public status / archive state, unpublishing
 *              its page; a protected QR row or asset missing on the target;
 *   locked     organization status, plan, export and notification-routing columns (trigger-protected or seed-unsafe);
 *   integrity  a desired row outside the organization, a dangling or cross-tenant reference, a delete whose CASCADE /
 *              SET NULL / RESTRICT effect would touch a row the plan keeps, a new active-session or pointer
 *              inconsistency, a new duplicate staff return / outbound per session, a published template edit;
 *   watermark  an inserted or changed return checklist dated after the digest watermark — it would be summarized as a
 *              new return in the next daily email (seed-notification suppression, docs/phase-e/DEMO_RECOVERY_RUNBOOK.md).
 *
 * DATASET MANIFESTS (Engineering Phase E2B: kinds showcase, presenter, refresh) also carry `owned` — the ids of the
 * synthetic showcase dataset (docs/phase-e/showcase/dataset.json) — and may carry `owned_history` (ids of an earlier
 * dataset version), `remove` (exact ids of other rows to delete; nothing else is ever deleted), `allow_insert` /
 * `allow_update` (the exact other rows, and for updates the columns, the overlay may write), `append` (the dataset's own
 * scan rows: scans stay append-only for every row the dataset does not own) and `dataset` (its version and anchor).
 * They are refused on top of the rules above when a change falls outside those bounds (delete-allowlist, insert-bound,
 * update-bound), a dataset row is in the removal list, a dataset timestamp is in the future or its anchor's 6 AM
 * digest run may still be running (future, anchor), two rentals of one asset overlap (overlap), or a dataset row would
 * share its RNT- / SUB- display reference with another row (reference).
 */
import { createHash } from "node:crypto";

import { canonicalJson, rowHash } from "./showcase-archive.mjs";
import { integrityChecks, scopeWhere } from "./tenant-graph.mjs";

export const RESET_MANIFEST_SCHEMA = "mulemark.phase-e.reset-manifest/v1";
export const RESET_PLAN_SCHEMA = "mulemark.phase-e.reset-plan/v1";
export const MANIFEST_KINDS = Object.freeze(["noop", "draft-e2c", "restore", "fixture", "showcase", "presenter", "refresh"]);
/** Kinds that carry the synthetic showcase dataset: their rows are `owned` and every change is bounded (E2B). */
export const OWNED_KINDS = Object.freeze(["showcase", "presenter", "refresh"]);
/** Kinds composed from the locked live rows inside the apply transaction, so organic rows arriving meanwhile are kept. */
export const IN_LOCK_KINDS = Object.freeze(["presenter", "refresh"]);
/** Optional manifest fields a dataset manifest may carry (buildManifest copies only these). */
const MANIFEST_EXTRAS = Object.freeze(["owned", "owned_history", "remove", "allow_insert", "allow_update", "append", "dataset", "storage", "e2a", "notes"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Tables a reset never writes, with the reason. */
export const FROZEN_TABLES = Object.freeze({
  qr_links: "published QR destinations: no rotation, status change, insert or deletion",
  profiles: "identities are not managed by a reset",
});

/**
 * Tables other writers append to while a reset waits: a manifest never lists them, a plan keeps every live row and never
 * writes them, new rows are legitimate, and rows the manifest saw must still exist.
 */
export const APPEND_ONLY_TABLES = Object.freeze({
  scan_events: "visitor scans are kept; scans during a reset are legitimate",
  notification_digest_runs: "the digest ledger is written only by the daily digest (no forged sends, no deleted history)",
});

/** organizations columns a reset never changes: trigger-protected commercial fields (M0016/M0019) and notification routing. */
export const ORGANIZATION_LOCKED_COLUMNS = Object.freeze([
  "id",
  "slug",
  "status",
  "customer_exports_enabled",
  "export_assets_enabled",
  "export_qr_mapping_enabled",
  "export_documents_enabled",
  "export_submissions_enabled",
  "plan_name",
  "monthly_fee",
  "asset_limit",
  "plan_key",
  "billing_interval",
  "intro_price_cents",
  "renewal_price_cents",
  "tag_credit_cents",
  "storage_limit_mb",
  "video_uploads_enabled",
  "plan_notes",
  "notification_email",
  "urgent_notification_email",
  "return_notification_mode",
  "notify_damage_reports",
  "notify_support_requests",
  "notify_return_checklists",
  "notify_tag_request_updates",
  "notify_urgent_reports",
  "notify_include_photo_previews",
]);

/** Columns of a protected asset a reset never changes: its public route must keep resolving to it. */
export const PROTECTED_ASSET_COLUMNS = Object.freeze(["organization_id", "asset_code", "public_status", "archived_at"]);

/** Submission columns the insert trigger (M0028) rewrites for a non-user caller; inserted unbound, then set exactly. */
const SUBMISSION_FIXUP_COLUMNS = Object.freeze(["form_type", "submission_origin", "submitted_by_profile_id", "rental_session_id"]);
const UNBOUND_SUBMISSION = Object.freeze({ form_type: "damage_report", submission_origin: "public", submitted_by_profile_id: null, rental_session_id: null });

/**
 * The desired rows of an append-only table: every live row, minus the exact ids the manifest removes and the dataset
 * rows (this version's or an earlier one's) it no longer carries, plus the dataset's own appended rows. Without `append`
 * and `remove` this is the live table itself (every row KEEP), as before E2B.
 */
function appendOnlyDesired(table, manifest, liveMap) {
  const map = new Map(liveMap);
  const appended = manifest?.append?.[table] ?? [];
  const carried = new Set(appended.map((r) => r?.id));
  for (const id of manifest?.remove?.[table] ?? []) map.delete(id);
  for (const id of [...(manifest?.owned?.[table] ?? []), ...(manifest?.owned_history?.[table] ?? [])]) if (!carried.has(id)) map.delete(id);
  for (const row of appended) map.set(row.id, row);
  return map;
}

const idSet = (lists, table) => new Set(lists?.[table] ?? []);
const yearOf = (value) => String(new Date(value).getUTCFullYear()).padStart(4, "0");

/** Columns the database re-stamps on every UPDATE (set_updated_at); never compared, never written by an update. */
export function managedColumns(graph) {
  const out = {};
  for (const [table, info] of Object.entries(graph.tables)) {
    if ((info.triggers ?? []).some((t) => t.function === "public.set_updated_at" && t.events.includes("UPDATE"))) out[table] = ["updated_at"];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Digest watermark — a mirror of lib/notifications/digest-window.ts (parity-tested in showcase-reset.test.mjs)
// ---------------------------------------------------------------------------------------------------------------------

const DIGEST_TIME_ZONE = "America/Vancouver";
const DIGEST_LOCAL_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DIGEST_MAX_LOOKBACK_DAYS = 14;
const PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DIGEST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function pacificParts(instant) {
  const parts = Object.fromEntries(
    PARTS_FORMAT.formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

export function pacificWallTimeToUtc(year, month, day, hour) {
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = pacificParts(new Date(guess));
    const diff = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** The 6 AM Pacific cutoff of the calendar day `offsetDays` after the Pacific date of `instant`. */
function cutoffOfDay(instant, offsetDays) {
  const p = pacificParts(instant);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays));
  return pacificWallTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), DIGEST_LOCAL_HOUR);
}

/** The window start digestWindow() computes (null when this cutoff was already summarized). */
export function digestWindowStart(cutoff, lastSuccessfulEnd, firstAttemptStart = null) {
  if (lastSuccessfulEnd && lastSuccessfulEnd.getTime() >= cutoff.getTime()) return null;
  const floor = cutoff.getTime() - DIGEST_MAX_LOOKBACK_DAYS * DAY_MS;
  const wanted = lastSuccessfulEnd
    ? lastSuccessfulEnd.getTime()
    : firstAttemptStart && firstAttemptStart.getTime() < cutoff.getTime()
      ? firstAttemptStart.getTime()
      : cutoff.getTime() - DAY_MS;
  return new Date(Math.max(wanted, floor));
}

/**
 * The seed watermark: the start of the window the NEXT digest run that can still happen will cover. Runs fire within
 * the hour after a cutoff, so the earliest such run is today's while now < cutoff + 1 h. Window starts never move
 * backwards while the ledger is untouched (a reset never writes it), so a return checklist dated at or before
 * `effectiveStart` is never summarized — not by the next run, nor by any later one.
 */
export function seedWatermark({ now, lastSuccessfulEnd = null, firstAttemptStart = null }) {
  let offset = 0;
  let cutoff = cutoffOfDay(now, 0);
  if (now.getTime() >= cutoff.getTime() + HOUR_MS) cutoff = cutoffOfDay(now, ++offset);
  let start = digestWindowStart(cutoff, lastSuccessfulEnd, firstAttemptStart);
  if (!start) {
    cutoff = cutoffOfDay(now, ++offset);
    start = digestWindowStart(cutoff, lastSuccessfulEnd, firstAttemptStart);
  }
  return { nextCutoff: cutoff, effectiveStart: start };
}

/** W (latest sent/skipped window_end) and F (earliest window_start of any run) from ledger rows, like digest-store.ts. */
export function ledgerWatermark(rows) {
  const ofType = (rows ?? []).filter((r) => r.digest_type === "return_exceptions");
  const success = ofType.filter((r) => r.status === "sent" || r.status === "skipped_quiet").map((r) => Date.parse(r.window_end));
  const starts = ofType.map((r) => Date.parse(r.window_start));
  return {
    last_success_window_end: success.length ? new Date(Math.max(...success)).toISOString() : null,
    first_window_start: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------------------------------------------------

/** id → row hash for every table of a snapshot (the drift guard). */
export function expectedFromSnapshot(snapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([t, rows]) => [t, Object.fromEntries(rows.map((r) => [r.id, rowHash(r)]))]));
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Desired = the snapshot itself (append-only tables omitted): every row KEEP. */
export function noopDesired(snapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).filter(([t]) => !APPEND_ONLY_TABLES[t]).map(([t, rows]) => [t, clone(rows)]));
}

/**
 * The relational shape of the E2C cutover from the approved archive boundary (docs/phase-e/manifests/
 * northridge-archive-boundary.json), without the E2A/E2B content that does not exist yet: open sessions are closed
 * (cancelled, asset pointers cleared), the access-restricted submissions and acknowledgements are removed (to be
 * rebuilt synthetic), and hosted documents of unknown rights become private. Everything else is kept. Dry-run material
 * for the E2C approval; never applied to a hosted project.
 */
export function draftE2cDesired(snapshot) {
  const desired = noopDesired(snapshot);
  const closing = new Set((desired.asset_rental_sessions ?? []).filter((s) => s.status === "active").map((s) => s.id));
  desired.asset_rental_sessions = (desired.asset_rental_sessions ?? []).map((s) => (closing.has(s.id) ? { ...s, status: "cancelled" } : s));
  desired.assets = (desired.assets ?? []).map((a) => (closing.has(a.active_rental_session_id) ? { ...a, active_rental_session_id: null } : a));
  desired.form_submissions = [];
  desired.asset_acknowledgements = [];
  desired.documents = (desired.documents ?? []).map((d) => (d.storage_path ? { ...d, visibility: "private" } : d));
  return desired;
}

/**
 * Roll back to an archive while keeping legitimate later interactions: desired = the archived rows, plus every live row
 * that is in neither the archive nor the cutover's own inserts (a visitor's report after the cutover, say). The
 * organization's locked columns keep their LIVE values — a reset never changes status, plan or notification routing in
 * either direction — so a rollback works whether the archive was taken before or during a suspension window. The planner
 * refuses if a kept row depends on something the rollback removes; that decision belongs to the operator.
 */
export function restoreDesired({ snapshot, archiveRows, cutoverInsertIds = {} }) {
  const desired = {};
  for (const [table, live] of Object.entries(snapshot.tables)) {
    if (APPEND_ONLY_TABLES[table]) continue;
    const archived = archiveRows[table] ?? [];
    const archivedIds = new Set(archived.map((r) => r.id));
    const inserted = new Set(cutoverInsertIds[table] ?? []);
    desired[table] = [...clone(archived), ...clone(live.filter((r) => !archivedIds.has(r.id) && !inserted.has(r.id)))];
  }
  const liveOrg = new Map((snapshot.tables.organizations ?? []).map((o) => [o.id, o]));
  desired.organizations = (desired.organizations ?? []).map((o) => {
    const current = liveOrg.get(o.id);
    return current ? { ...o, ...Object.fromEntries(ORGANIZATION_LOCKED_COLUMNS.map((c) => [c, current[c]])) } : o;
  });
  return desired;
}

export function buildManifest({ name, kind, target, organizationId, snapshot, graph, protectedSet, desired, extra = {}, now = new Date() }) {
  if (!MANIFEST_KINDS.includes(kind)) throw new Error(`unknown manifest kind ${kind}`);
  if (OWNED_KINDS.includes(kind) !== Boolean(extra.owned)) throw new Error(`a ${kind} manifest ${OWNED_KINDS.includes(kind) ? "needs" : "never carries"} owned dataset ids`);
  return {
    ...Object.fromEntries(MANIFEST_EXTRAS.filter((k) => extra[k] !== undefined).map((k) => [k, extra[k]])),
    schema: RESET_MANIFEST_SCHEMA,
    name,
    kind,
    target,
    organization_id: organizationId,
    graph_sha256: graph.graph_sha256,
    created_at: now.toISOString(),
    snapshot_taken_at: snapshot.taken_at,
    protected: { qr_link_ids: [...protectedSet.qrLinkIds].sort(), asset_ids: [...protectedSet.assetIds].sort() },
    watermark: ledgerWatermark(snapshot.tables.notification_digest_runs),
    expected: expectedFromSnapshot(snapshot),
    desired,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------------

function changedColumns(current, desired, managed) {
  return Object.keys(desired).filter((c) => !managed.includes(c) && canonicalJson(current[c]) !== canonicalJson(desired[c]));
}

function sample(ids) {
  return ids.length <= 5 ? ids.join(", ") : `${ids.slice(0, 5).join(", ")} … (+${ids.length - 5})`;
}

/** Session/pointer inconsistencies of a state, as stable strings (so only NEW ones are refused). */
function sessionInconsistencies(assets, sessions) {
  const out = new Set();
  const active = new Map();
  for (const s of sessions.values()) {
    if (s.status !== "active") continue;
    if (active.has(s.asset_id)) out.add(`asset ${s.asset_id} has more than one active session`);
    active.set(s.asset_id, s.id);
  }
  for (const a of assets.values()) {
    if (a.active_rental_session_id) {
      const s = sessions.get(a.active_rental_session_id);
      if (!s || s.asset_id !== a.id || s.status !== "active") out.add(`asset ${a.id} points at a session that is not its active session`);
    }
  }
  for (const [assetId, sessionId] of active) {
    if (assets.get(assetId)?.active_rental_session_id !== sessionId) out.add(`active session ${sessionId} is not its asset's pointer`);
  }
  return out;
}

/** Duplicate staff returns / outbound inspections per session (the partial unique indexes of M0027/M0028). */
function submissionUniqueness(submissions) {
  const out = new Set();
  const seen = new Map();
  for (const s of submissions.values()) {
    if (!s.rental_session_id) continue;
    const key =
      s.form_type === "pre_use_inspection"
        ? `outbound:${s.rental_session_id}`
        : s.form_type === "return_checklist" && s.submission_origin === "staff"
          ? `staff-return:${s.rental_session_id}`
          : null;
    if (!key) continue;
    if (seen.has(key)) out.add(`session ${s.rental_session_id} would have two ${key.split(":")[0]} submissions`);
    seen.set(key, s.id);
  }
  return out;
}

/**
 * Plan a reset. `live` = { tables: { table: rows }, identity: profiles outside the tenant that its rows reference }.
 * Returns { ok, refusals, counts, changes, watermark, … }; `ok` is false when anything was refused.
 */
export function planReset({ manifest, live, graph, now = new Date() }) {
  const refusals = [];
  const refuse = (code, message) => refusals.push({ code, message });
  const org = manifest?.organization_id;
  const base = { schema: RESET_PLAN_SCHEMA, name: manifest?.name ?? null, kind: manifest?.kind ?? null, organization_id: org ?? null, planned_at: now.toISOString() };

  if (manifest?.schema !== RESET_MANIFEST_SCHEMA) refuse("manifest", "not a Phase E reset manifest");
  if (!UUID_RE.test(String(org))) refuse("manifest", "organization_id must be one exact organization id (no wildcard)");
  if (manifest?.graph_sha256 !== graph.graph_sha256) refuse("manifest", "the manifest was built against a different schema graph");
  if (OWNED_KINDS.includes(manifest?.kind) !== Boolean(manifest?.owned)) refuse("manifest", "dataset rows (owned) belong to showcase, presenter and refresh manifests only");
  if (refusals.length > 0) return { ...base, ok: false, refusals, counts: {}, changes: {} };

  const { classes } = graph;
  const order = graph.insert_order;
  const managed = managedColumns(graph);
  const liveById = Object.fromEntries(order.map((t) => [t, new Map((live.tables[t] ?? []).map((r) => [r.id, r]))]));
  const identityById = new Map((live.identity ?? []).map((p) => [p.id, p]));
  const desiredById = {};
  const counts = {};
  const changes = {};

  if (!liveById.organizations.has(org)) refuse("scope", "the organization does not exist on the target");

  // 1. Desired state and the diff.
  for (const table of order) {
    counts[table] = { KEEP: 0, UPDATE: 0, INSERT: 0, DELETE: 0 };
    changes[table] = { insert: [], update: [], delete: [] };
    const columns = (graph.tables[table].columns ?? []).map((c) => c.name);
    const checkRow = (row, map) => {
      if (!UUID_RE.test(String(row?.id))) {
        refuse("manifest", `${table} has a desired row without an exact uuid id`);
        return false;
      }
      if (map.has(row.id)) refuse("manifest", `${table} lists ${row.id} twice`);
      if (Object.keys(row).length !== columns.length || columns.some((c) => !(c in row))) refuse("columns", `${table} row ${row.id} does not carry exactly the table's columns`);
      return true;
    };
    let map;
    if (APPEND_ONLY_TABLES[table]) {
      if (manifest.desired?.[table] !== undefined) refuse("append-only", `${table} is append-only; a manifest never lists its rows`);
      const appended = manifest.append?.[table];
      const writes = (appended?.length ?? 0) + (manifest.remove?.[table]?.length ?? 0) + (manifest.owned_history?.[table]?.length ?? 0);
      if (writes > 0 && table !== "scan_events") refuse("append-only", `${table} is never written by a reset (no appended or removed rows)`);
      if (appended !== undefined && !manifest.owned) refuse("manifest", `appended ${table} rows need a dataset manifest (owned ids)`);
      const seen = new Map();
      for (const row of appended ?? []) if (checkRow(row, seen)) seen.set(row.id, row);
      if (manifest.owned && [...seen.keys()].sort().join(",") !== [...idSet(manifest.owned, table)].sort().join(",")) {
        refuse("manifest", `the appended ${table} rows are not exactly the dataset's owned ${table} ids`);
      }
      map = appendOnlyDesired(table, manifest, liveById[table]);
    } else {
      const rows = manifest.desired?.[table];
      if (!Array.isArray(rows)) {
        refuse("manifest", `the manifest has no desired rows for ${table} (an empty list means none)`);
        desiredById[table] = liveById[table];
        continue;
      }
      map = new Map();
      for (const row of rows) if (checkRow(row, map)) map.set(row.id, row);
    }
    desiredById[table] = map;
    for (const row of map.values()) {
      const info = classes[table];
      if (info.class === "organization" && row.id !== org) refuse("scope", `organizations may only hold ${org}`);
      if (info.class === "tenant" && row.organization_id !== org) refuse("cross-org", `${table} row ${row.id} belongs to another organization`);
    }
    for (const [id, row] of map) {
      const current = liveById[table].get(id);
      if (!current) {
        counts[table].INSERT++;
        changes[table].insert.push(id);
        continue;
      }
      const cols = changedColumns(current, row, managed[table] ?? []);
      if (cols.length === 0) counts[table].KEEP++;
      else {
        counts[table].UPDATE++;
        changes[table].update.push({ id, columns: cols });
      }
    }
    for (const id of liveById[table].keys()) {
      if (!map.has(id)) {
        counts[table].DELETE++;
        changes[table].delete.push(id);
      }
    }
  }
  for (const [table, info] of Object.entries(classes)) {
    if (info.class !== "tenant-child" || !desiredById[table]) continue;
    for (const row of desiredById[table].values()) {
      if (!desiredById[info.scope.parent]?.has(row[info.scope.column])) refuse("scope", `${table} row ${row.id} hangs off a ${info.scope.parent} row outside the organization's desired state`);
    }
  }
  const touched = (table) => changes[table] && changes[table].insert.length + changes[table].update.length + changes[table].delete.length > 0;

  // 2. Drift. Every live row must be either the row the manifest saw or already the row it wants (a rerun after an
  // apply converges to all KEEP instead of writing again); anything else changed under the manifest. Append-only tables
  // may gain rows but never lose the ones the manifest saw.
  for (const table of order) {
    const expected = manifest.expected?.[table];
    if (!expected) {
      refuse("manifest", `the manifest records no expected rows for ${table}`);
      continue;
    }
    // Append-only rows the manifest itself removes (exact removals, earlier dataset versions, dataset rows it no longer
    // carries) may be gone — that is the applied state, so a re-plan after the apply still converges.
    const carried = new Set((manifest.append?.[table] ?? []).map((r) => r?.id));
    const intended = APPEND_ONLY_TABLES[table]
      ? new Set([...idSet(manifest.remove, table), ...idSet(manifest.owned_history, table), ...[...idSet(manifest.owned, table)].filter((id) => !carried.has(id))])
      : null;
    const gone = Object.keys(expected).filter((id) => !liveById[table].has(id) && (APPEND_ONLY_TABLES[table] ? !intended.has(id) : desiredById[table].has(id)));
    if (gone.length) refuse("drift-missing", `${table}: ${gone.length} row(s) the manifest relies on are gone (${sample(gone)})`);
    if (APPEND_ONLY_TABLES[table]) continue;
    const unexpected = [];
    const changed = [];
    for (const [id, row] of liveById[table]) {
      if (id in expected && rowHash(row) === expected[id]) continue;
      const wanted = desiredById[table].get(id);
      if (wanted && changedColumns(row, wanted, managed[table] ?? []).length === 0) continue;
      (id in expected ? changed : unexpected).push(id);
    }
    if (unexpected.length) refuse("drift-new", `${table}: ${unexpected.length} row(s) the manifest did not expect (${sample(unexpected)})`);
    if (changed.length) refuse("drift-changed", `${table}: ${changed.length} row(s) changed since the manifest was built (${sample(changed)})`);
  }

  // 3. Rules.
  for (const [table, reason] of Object.entries(FROZEN_TABLES)) if (touched(table)) refuse("frozen", `${table}: ${reason}`);
  if (changes.organizations) {
    if (changes.organizations.insert.length || changes.organizations.delete.length) refuse("locked", "a reset never creates or deletes the organization");
    for (const u of changes.organizations.update) {
      const locked = u.columns.filter((c) => ORGANIZATION_LOCKED_COLUMNS.includes(c));
      if (locked.length) refuse("locked", `organization columns a reset never changes: ${locked.join(", ")}`);
    }
  }
  const protectedAssets = new Set(manifest.protected?.asset_ids ?? []);
  const protectedQr = new Set(manifest.protected?.qr_link_ids ?? []);
  for (const id of protectedQr) if (!liveById.qr_links.has(id)) refuse("protected", `protected QR row ${id} is missing on the target`);
  for (const id of protectedAssets) {
    if (!liveById.assets.has(id)) refuse("protected", `protected asset ${id} is missing on the target`);
    else if (!desiredById.assets.has(id)) refuse("protected", `protected asset ${id} would be deleted`);
  }
  for (const u of changes.assets?.update ?? []) {
    if (!protectedAssets.has(u.id)) continue;
    const bad = u.columns.filter((c) => PROTECTED_ASSET_COLUMNS.includes(c));
    if (bad.length) refuse("protected", `protected asset ${u.id}: ${bad.join(", ")} never change`);
  }
  for (const page of liveById.equipment_pages?.values() ?? []) {
    if (!protectedAssets.has(page.asset_id)) continue;
    const next = desiredById.equipment_pages.get(page.id);
    if (!next) refuse("protected", `the page of protected asset ${page.asset_id} would be deleted`);
    else if (page.is_published && next.is_published !== true) refuse("protected", `the page of protected asset ${page.asset_id} would be unpublished`);
  }
  for (const u of changes.inspection_templates?.update ?? []) {
    if (liveById.inspection_templates.get(u.id)?.status !== "draft") refuse("integrity", `inspection template ${u.id} is published or retired (immutable; insert a new version instead)`);
  }

  // 3b. Dataset manifests (E2B): every change stays inside the dataset, the exact removals and the allowed overlay;
  // dataset dates are in the past; one rental at a time per asset; display references stay unique.
  if (manifest.owned) {
    for (const table of order) {
      const owned = idSet(manifest.owned, table);
      const history = idSet(manifest.owned_history, table);
      const removal = idSet(manifest.remove, table);
      const ch = changes[table];
      const strayDeletes = ch.delete.filter((id) => !owned.has(id) && !history.has(id) && !removal.has(id));
      if (strayDeletes.length) refuse("delete-allowlist", `${table}: ${strayDeletes.length} deletion(s) are neither dataset rows nor named in the exact removal list (${sample(strayDeletes)})`);
      const allowInsert = idSet(manifest.allow_insert, table);
      const strayInserts = ch.insert.filter((id) => !owned.has(id) && !allowInsert.has(id));
      if (strayInserts.length) refuse("insert-bound", `${table}: ${strayInserts.length} insert(s) are neither dataset rows nor allowed overlay rows (${sample(strayInserts)})`);
      const allowUpdate = manifest.allow_update?.[table] ?? {};
      const strayUpdates = ch.update.filter((u) => !owned.has(u.id) && !u.columns.every((c) => (allowUpdate[u.id] ?? []).includes(c)));
      if (strayUpdates.length) refuse("update-bound", `${table}: ${strayUpdates.length} update(s) outside the dataset and the allowed overlay (${sample(strayUpdates.map((u) => `${u.id} ${u.columns.join("/")}`))})`);
      const ownedRemoved = [...removal].filter((id) => owned.has(id));
      if (ownedRemoved.length) refuse("manifest", `${table}: dataset rows are never in the removal list (${sample(ownedRemoved)})`);
      const stamps = (graph.tables[table].columns ?? []).filter((c) => c.type === "timestamp with time zone").map((c) => c.name);
      const future = [];
      for (const id of owned) {
        const row = desiredById[table].get(id);
        if (!row) continue;
        for (const c of stamps) if (row[c] !== null && row[c] !== undefined && !(Date.parse(row[c]) <= now.getTime())) future.push(`${id} ${c}`);
      }
      if (future.length) refuse("future", `${table}: ${future.length} dataset timestamp(s) are later than now (${sample(future)})`);
    }
    const anchor = Date.parse(manifest.dataset?.anchor_utc ?? "");
    if (!Number.isFinite(anchor)) refuse("manifest", "a dataset manifest records its anchor (dataset.anchor_utc)");
    else if (now.getTime() < anchor + HOUR_MS) refuse("anchor", `the dataset's anchor ${manifest.dataset.anchor_utc} is less than an hour ago: its 6 AM digest run may still be running`);
    // One rental at a time on every asset that has dataset rentals (a closed session without returned_at is a point).
    const ownedSessions = idSet(manifest.owned, "asset_rental_sessions");
    const datasetAssets = new Set([...ownedSessions].map((id) => desiredById.asset_rental_sessions.get(id)?.asset_id).filter(Boolean));
    for (const assetId of datasetAssets) {
      const list = [...desiredById.asset_rental_sessions.values()].filter((s) => s.asset_id === assetId).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const end = prev.status === "active" ? Infinity : Date.parse(prev.returned_at ?? prev.started_at);
        if (Date.parse(list[i].started_at) < end) refuse("overlap", `asset ${assetId}: rentals ${prev.id} and ${list[i].id} overlap`);
      }
    }
    // A kept return checklist that is not the dataset's, on a dataset rental the reset leaves (or makes) active, records a
    // return the authored state contradicts — a live demo staff or renter return on the synthetic active rental. Name it.
    const ownedSubmissions = idSet(manifest.owned, "form_submissions");
    for (const row of desiredById.form_submissions.values()) {
      if (ownedSubmissions.has(row.id) || row.form_type !== "return_checklist" || !row.rental_session_id) continue;
      const session = desiredById.asset_rental_sessions.get(row.rental_session_id);
      if (session && ownedSessions.has(session.id) && session.status === "active") {
        refuse("conflict", `return checklist ${row.id} records a return on dataset rental ${session.id}, which stays active: name it in --remove to reset`);
      }
    }
    // RNT-YYYY-XXXXXX / SUB-YYYY-XXXXXX are derived from the id and the start/creation year: a dataset row's must be unique.
    for (const [table, column] of [["asset_rental_sessions", "started_at"], ["form_submissions", "created_at"]]) {
      const owned = idSet(manifest.owned, table);
      const byRef = new Map();
      for (const row of desiredById[table].values()) {
        const ref = `${yearOf(row[column])}-${String(row.id).slice(0, 6)}`;
        byRef.set(ref, [...(byRef.get(ref) ?? []), row.id]);
      }
      const clashes = [...byRef.entries()].filter(([, ids]) => ids.length > 1 && ids.some((id) => owned.has(id))).map(([ref]) => ref);
      if (clashes.length) refuse("reference", `${table}: dataset rows share a display reference with another row (${sample(clashes)})`);
    }
  }

  // 4. Every reference in the desired state resolves inside the organization (or to a shared identity).
  const dangling = [];
  const crossOrg = [];
  for (const table of order) {
    for (const fk of graph.tables[table].foreign_keys ?? []) {
      if (fk.references.schema !== "public" || fk.columns.length !== 1) continue;
      const target = fk.references.table;
      if (!classes[target] || classes[target].class === "shared") continue;
      const col = fk.columns[0];
      for (const row of desiredById[table].values()) {
        const value = row[col];
        if (value === null || value === undefined) continue;
        const hit = desiredById[target]?.get(value) ?? (target === "profiles" ? identityById.get(value) : undefined);
        if (!hit) dangling.push(`${table}.${col} of ${row.id}`);
        else if (target !== "organizations" && hit.organization_id && hit.organization_id !== org) crossOrg.push(`${table}.${col} of ${row.id}`);
      }
    }
  }
  if (dangling.length) refuse("integrity", `dangling references in the desired state: ${sample(dangling)}`);
  if (crossOrg.length) refuse("cross-org", `references into another organization: ${sample(crossOrg)}`);

  // 5. Deletes must not reach rows the plan keeps (CASCADE / SET NULL / RESTRICT side effects).
  for (const table of order) {
    const deleted = new Set(changes[table]?.delete ?? []);
    if (deleted.size === 0) continue;
    for (const source of order) {
      for (const fk of graph.tables[source].foreign_keys ?? []) {
        if (fk.references.schema !== "public" || fk.references.table !== table || fk.columns.length !== 1) continue;
        const col = fk.columns[0];
        for (const row of liveById[source].values()) {
          if (!deleted.has(row[col]) || !desiredById[source].has(row.id)) continue;
          if (fk.on_delete === "cascade") refuse("integrity", `deleting ${table} ${row[col]} would cascade-delete ${source} row ${row.id}, which the plan keeps`);
          else if (fk.on_delete === "set null") {
            // Harmless when the plan rewrites the column itself (updates run after deletes); a refusal when the kept
            // row still wants the deleted row, which the database would silently clear.
            if (desiredById[source].get(row.id)[col] === row[col]) refuse("integrity", `deleting ${table} ${row[col]} would silently clear ${source}.${col} on ${row.id}`);
          } else refuse("integrity", `${table} ${row[col]} is still referenced by ${source}.${col} (${fk.on_delete})`);
        }
      }
    }
  }

  // 6. No NEW session/pointer inconsistency and no NEW duplicate per-session submission.
  const before = sessionInconsistencies(liveById.assets, liveById.asset_rental_sessions);
  for (const problem of sessionInconsistencies(desiredById.assets, desiredById.asset_rental_sessions)) if (!before.has(problem)) refuse("integrity", problem);
  const uniqueBefore = submissionUniqueness(liveById.form_submissions);
  for (const problem of submissionUniqueness(desiredById.form_submissions)) if (!uniqueBefore.has(problem)) refuse("integrity", problem);

  // 7. Seed-notification suppression: written return checklists must sit at or before the digest watermark. The
  // watermark only moves forward (daily summaries); if it moved backwards, ledger history was removed — stop.
  const ledger = ledgerWatermark([...liveById.notification_digest_runs.values()]);
  const recorded = manifest.watermark?.last_success_window_end ?? null;
  if (recorded && !(ledger.last_success_window_end && Date.parse(ledger.last_success_window_end) >= Date.parse(recorded))) {
    refuse("drift-changed", "the digest watermark moved backwards since the manifest was built (ledger history is missing)");
  }
  const wm = seedWatermark({
    now,
    lastSuccessfulEnd: ledger.last_success_window_end ? new Date(ledger.last_success_window_end) : null,
    firstAttemptStart: ledger.first_window_start ? new Date(ledger.first_window_start) : null,
  });
  const written = [...(changes.form_submissions?.insert ?? []), ...(changes.form_submissions?.update ?? []).map((u) => u.id)];
  const late = written.filter((id) => {
    const row = desiredById.form_submissions.get(id);
    return row?.form_type === "return_checklist" && !(Date.parse(row.created_at) <= wm.effectiveStart.getTime());
  });
  if (late.length) {
    refuse("watermark", `${late.length} return checklist(s) dated after the digest watermark ${wm.effectiveStart.toISOString()} would be summarized as new returns (${sample(late)})`);
  }

  return {
    ...base,
    ok: refusals.length === 0,
    refusals,
    counts,
    changes,
    watermark: { ...ledger, next_cutoff: wm.nextCutoff.toISOString(), effective_start: wm.effectiveStart.toISOString() },
  };
}

/** Per-table action counts and refusal codes only: what a tracked report may carry (no ids, no row values). */
export function planSummary(plan) {
  return {
    schema: "mulemark.phase-e.reset-plan-summary/v1",
    name: plan.name,
    kind: plan.kind,
    organization_id: plan.organization_id,
    planned_at: plan.planned_at,
    ok: plan.ok,
    counts: plan.counts,
    refusal_codes: [...new Set(plan.refusals.map((r) => r.code))].sort(),
    refusals: plan.refusals.length,
    watermark: plan.watermark ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------------------------------------------------

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
const md5 = (text) => createHash("md5").update(text).digest("hex");

function uuidLiteral(id) {
  if (!UUID_RE.test(String(id))) throw new Error("refusing to emit SQL for a value that is not an exact uuid");
  return `'${id}'::uuid`;
}
const uuidArray = (ids) => {
  for (const id of ids) uuidLiteral(id);
  return `'{${ids.join(",")}}'::uuid[]`;
};
const textLiteral = (text) => `'${String(text).replace(/'/g, "''")}'`;

/** A dollar-quoted literal whose tag does not occur in the text. */
function dollar(text, base = "j") {
  let tag = base;
  for (let i = 0; text.includes(`$${tag}$`); i++) tag = `${base}${i}`;
  return `$${tag}$${text}$${tag}$`;
}

/** md5 over the sorted ids joined by commas; '' for none — matches the SQL guard's coalesce(md5(string_agg(...)), ''). */
export function idSetMd5(ids) {
  return ids.length === 0 ? "" : md5([...ids].sort().join(","));
}

/**
 * One SQL transaction for an accepted plan, in sections: prelude (lock the organization row — which makes every new
 * row that references the organization wait, and no other tenant — lock the in-scope rows, re-check the id sets and
 * the watermark, snapshot the protected rows), writes (clear changing pointers, close sessions, delete children first,
 * insert parents first, update, set pointers; every statement checks its row count), postchecks (integrity, protected
 * rows byte-equal, final counts, no new pointer inconsistency) and commit. Triggers stay ON.
 */
export function emitResetSql({ plan, manifest, live, graph }) {
  if (!plan.ok) throw new Error("refusing to emit SQL for a plan with refusals");
  const org = uuidLiteral(plan.organization_id);
  const { classes } = graph;
  const order = graph.insert_order;
  const scope = (table, alias = "t") => scopeWhere(table, classes, alias).replace(/\$1/g, org);
  const managed = managedColumns(graph);
  const liveById = Object.fromEntries(order.map((t) => [t, new Map((live.tables[t] ?? []).map((r) => [r.id, r]))]));
  const desiredById = Object.fromEntries(
    order.map((t) => [t, APPEND_ONLY_TABLES[t] ? appendOnlyDesired(t, manifest, liveById[t]) : new Map((manifest.desired[t] ?? []).map((r) => [r.id, r]))])
  );
  let block = 0;
  const doBlock = (body) => {
    block++;
    return `do ${dollar(`\ndeclare n bigint;\nbegin\n${body}\nend\n`, `phase_e_${block}`)};`;
  };
  const expectRows = (what, expected) =>
    `  get diagnostics n = row_count;\n  if n <> ${expected} then raise exception 'phase-e reset: ${what} affected % rows, expected ${expected}', n; end if;`;

  // Prelude ---------------------------------------------------------------------------------------------------------
  const prelude = [
    "begin;",
    "set local lock_timeout = '5s';",
    "set local statement_timeout = '120s';",
    "set local timezone = 'UTC';",
    `-- Demo-only lock: inserts that reference this organization wait for this transaction; other tenants are unaffected.`,
    `select id from public.organizations where id = ${org} for update;`,
  ];
  for (const table of order) {
    if (APPEND_ONLY_TABLES[table]) continue;
    prelude.push(`select count(*) from (select t.id from public.${ident(table)} t where ${scope(table)} for update) locked_${table};`);
  }
  // Guards: the id sets the plan was computed on (append-only tables: the rows it saw are all still there) and a digest
  // watermark that has not moved backwards.
  const guards = [];
  for (const table of order) {
    const ids = [...liveById[table].keys()];
    if (APPEND_ONLY_TABLES[table]) {
      if (ids.length > 0) {
        guards.push(
          `  if (select count(*) from public.${ident(table)} t where ${scope(table)} and t.id = any(${uuidArray(ids)})) <> ${ids.length} then\n    raise exception 'phase-e reset guard: ${table} rows the plan saw are gone';\n  end if;`
        );
      }
      continue;
    }
    guards.push(
      `  if (select coalesce(md5(string_agg(t.id::text, ',' order by t.id)), '') from public.${ident(table)} t where ${scope(table)}) <> '${idSetMd5(ids)}' then\n    raise exception 'phase-e reset guard: the ${table} id set differs from the plan';\n  end if;`
    );
  }
  const wm = plan.watermark;
  if (wm.last_success_window_end) {
    guards.push(
      `  if coalesce((select max(window_end) from public.notification_digest_runs where organization_id = ${org} and digest_type = 'return_exceptions' and status in ('sent', 'skipped_quiet')) < ${textLiteral(wm.last_success_window_end)}::timestamptz, true) then\n    raise exception 'phase-e reset guard: the digest watermark moved backwards';\n  end if;`
    );
  }
  prelude.push(doBlock(guards.join("\n")));
  const protectedQr = manifest.protected?.qr_link_ids ?? [];
  const protectedAssets = manifest.protected?.asset_ids ?? [];
  prelude.push(
    `create temp table phase_e_protected_qr on commit drop as select q.id, md5(to_jsonb(q)::text) as h from public.qr_links q where q.id = any(${uuidArray(protectedQr)});`,
    `create temp table phase_e_protected_assets on commit drop as select a.id, a.asset_code, a.public_status, a.archived_at from public.assets a where a.id = any(${uuidArray(protectedAssets)});`,
    `create temp table phase_e_protected_pages on commit drop as select e.id, e.is_published from public.equipment_pages e where e.asset_id = any(${uuidArray(protectedAssets)});`
  );

  // Writes ----------------------------------------------------------------------------------------------------------
  const writes = [];
  const updateStatement = (table, id, row, columns) => {
    const json = dollar(JSON.stringify(row), "r");
    const set =
      columns.length === 1
        ? `${ident(columns[0])} = (select r.${ident(columns[0])} from jsonb_populate_record(null::public.${ident(table)}, ${json}::jsonb) r)`
        : `(${columns.map(ident).join(", ")}) = (select ${columns.map((c) => `r.${ident(c)}`).join(", ")} from jsonb_populate_record(null::public.${ident(table)}, ${json}::jsonb) r)`;
    return doBlock(`  update public.${ident(table)} t set ${set} where t.id = ${uuidLiteral(id)} and ${scope(table)};\n${expectRows(`${table} update`, 1)}`);
  };

  // 1. Clear asset pointers that change (a session being closed, replaced or deleted is no longer pointed at).
  const pointerChanges = (plan.changes.assets?.update ?? []).filter((u) => u.columns.includes("active_rental_session_id"));
  const clearIds = pointerChanges.filter((u) => liveById.assets.get(u.id)?.active_rental_session_id).map((u) => u.id);
  if (clearIds.length) {
    writes.push(
      doBlock(`  update public.assets t set active_rental_session_id = null where ${scope("assets")} and t.id = any(${uuidArray(clearIds)});\n${expectRows("pointer clear", clearIds.length)}`)
    );
  }
  // 2. Close sessions leaving the active state before any new active session is inserted.
  const closing = new Set();
  for (const u of plan.changes.asset_rental_sessions?.update ?? []) {
    if (liveById.asset_rental_sessions.get(u.id)?.status === "active" && desiredById.asset_rental_sessions.get(u.id)?.status !== "active") {
      closing.add(u.id);
      writes.push(updateStatement("asset_rental_sessions", u.id, desiredById.asset_rental_sessions.get(u.id), u.columns));
    }
  }
  // 3. Deletes, children first.
  for (const table of [...order].reverse()) {
    const ids = plan.changes[table]?.delete ?? [];
    if (ids.length === 0) continue;
    writes.push(doBlock(`  delete from public.${ident(table)} t where ${scope(table)} and t.id = any(${uuidArray(ids)});\n${expectRows(`${table} delete`, ids.length)}`));
  }
  // 4. Inserts, parents first. Pointers are set in step 6; submissions go in unbound and are corrected in step 5.
  for (const table of order) {
    const ids = plan.changes[table]?.insert ?? [];
    if (ids.length === 0) continue;
    let rows = ids.map((id) => desiredById[table].get(id));
    if (table === "assets") rows = rows.map((r) => ({ ...r, active_rental_session_id: null }));
    if (table === "form_submissions") rows = rows.map((r) => ({ ...r, ...UNBOUND_SUBMISSION }));
    writes.push(
      doBlock(
        `  insert into public.${ident(table)} select * from jsonb_populate_recordset(null::public.${ident(table)}, ${dollar(JSON.stringify(rows), "r")}::jsonb);\n${expectRows(`${table} insert`, rows.length)}`
      )
    );
  }
  // 5. Updates (managed columns are the database's), then the corrections of the unbound submissions.
  for (const table of order) {
    for (const u of plan.changes[table]?.update ?? []) {
      if (table === "asset_rental_sessions" && closing.has(u.id)) continue;
      const columns = u.columns.filter((c) => !(managed[table] ?? []).includes(c) && !(table === "assets" && c === "active_rental_session_id"));
      if (columns.length) writes.push(updateStatement(table, u.id, desiredById[table].get(u.id), columns));
    }
  }
  for (const id of plan.changes.form_submissions?.insert ?? []) {
    const row = desiredById.form_submissions.get(id);
    const columns = SUBMISSION_FIXUP_COLUMNS.filter((c) => canonicalJson(row[c]) !== canonicalJson(UNBOUND_SUBMISSION[c]));
    if (columns.length) writes.push(updateStatement("form_submissions", id, row, columns));
  }
  // 6. Set the pointers of assets whose desired pointer is new.
  const pointerSets = [
    ...pointerChanges.filter((u) => desiredById.assets.get(u.id)?.active_rental_session_id).map((u) => u.id),
    ...(plan.changes.assets?.insert ?? []).filter((id) => desiredById.assets.get(id)?.active_rental_session_id),
  ];
  for (const id of pointerSets) writes.push(updateStatement("assets", id, desiredById.assets.get(id), ["active_rental_session_id"]));

  // Post-checks -----------------------------------------------------------------------------------------------------
  const post = [];
  const check = (name, expr, comparison = "<> 0") =>
    post.push(`  n := (${expr});\n  if n ${comparison} then raise exception 'phase-e reset post-check failed: ${String(name).replace(/'/g, "''")} (%)', n; end if;`);
  for (const c of integrityChecks(graph)) check(c.name, `select x.n from (${c.sql.replace(/\$1/g, org)}) x`);
  check("protected QR rows changed", `select count(*) from pg_temp.phase_e_protected_qr p left join public.qr_links q on q.id = p.id where q.id is null or md5(to_jsonb(q)::text) <> p.h`);
  check(
    "protected asset fields changed",
    `select count(*) from pg_temp.phase_e_protected_assets p left join public.assets a on a.id = p.id where a.id is null or a.asset_code is distinct from p.asset_code or a.public_status is distinct from p.public_status or a.archived_at is distinct from p.archived_at`
  );
  check(
    "protected pages removed or unpublished",
    `select count(*) from pg_temp.phase_e_protected_pages p left join public.equipment_pages e on e.id = p.id where e.id is null or (p.is_published and e.is_published is not true)`
  );
  for (const table of order) {
    const expected = desiredById[table].size;
    check(`${table} final row count`, `select count(*) from public.${ident(table)} t where ${scope(table)}`, APPEND_ONLY_TABLES[table] ? `< ${expected}` : `<> ${expected}`);
  }
  const pointerProblems = sessionInconsistencies(desiredById.assets, desiredById.asset_rental_sessions).size;
  check(
    "asset pointers and active sessions disagree",
    `select (select count(*) from public.assets a where ${scope("assets", "a")} and a.active_rental_session_id is not null and not exists (select 1 from public.asset_rental_sessions s where s.id = a.active_rental_session_id and s.asset_id = a.id and s.status = 'active')) + (select count(*) from public.asset_rental_sessions s where ${scope("asset_rental_sessions", "s")} and s.status = 'active' and not exists (select 1 from public.assets a where a.id = s.asset_id and a.active_rental_session_id = s.id))`,
    `> ${pointerProblems}`
  );
  const postchecks = [doBlock(post.join("\n"))];

  const sections = { prelude: prelude.join("\n"), writes: writes.join("\n"), postchecks: postchecks.join("\n"), commit: "commit;" };
  return {
    ...sections,
    statements: writes.length,
    full: [
      `-- Phase E reset plan ${plan.name} for organization ${plan.organization_id}, planned ${plan.planned_at}.`,
      "-- One transaction; triggers on; any failed guard, write or post-check rolls everything back.",
      sections.prelude,
      sections.writes,
      sections.postchecks,
      sections.commit,
      "",
    ].join("\n"),
  };
}
