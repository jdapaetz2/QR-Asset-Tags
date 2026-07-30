import { createHash, randomUUID } from "node:crypto";

import { serviceClient, ORG_A, STORAGE, RENTAL } from "../../security/setup/fixtures";
import { buildBucketKey, selectRules, type RateLimitAction } from "../../../lib/ratelimit/policy";
import { E2E_SCAN_SALT } from "./roles";

/**
 * Phase A6.2 — E2E data helpers.
 *
 * The shared baseline (seeded once by global-setup) is READ-ONLY and must stay stable — reseeding would
 * delete/recreate the fixture users and invalidate the saved auth storage state. So every state-mutating
 * browser test creates its OWN disposable entities here (unique ids + short codes) via the service-role
 * client, and asserts on those. Nothing a test does disturbs the baseline or another test.
 *
 * `seedE2eExtras()` (called from global-setup after seedFixtures) adds read-only enrichment the golden-path
 * READ tests need — content on the public equipment page, a resolvable return template, and one rich
 * rental-session evidence graph — without touching the A3.2 security fixtures.
 */

const admin = () => serviceClient();

/** Same salted-hash formula the app uses for scan IPs and rate-limit tokens (lib/scan, lib/ratelimit). */
function hash(value: string): string {
  return createHash("sha256").update(`${E2E_SCAN_SALT}:${value}`).digest("hex").slice(0, 32);
}

/** Derived RNT reference (RNT-YYYY-XXXXXX) — mirrors submissionReference()/rentalReference(). */
export function rntRef(id: string, startedAt: string): string {
  const year = String(new Date(startedAt).getUTCFullYear()).padStart(4, "0");
  const suffix = id.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase().padEnd(6, "0");
  return `RNT-${year}-${suffix}`;
}

/** A short, unique, human-readable short-code suffix for disposable QR links. */
function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

// ---- Fixed E2E-extra ids (read-only enrichment) -----------------------------

export const EVIDENCE = {
  assetId: "e11d0000-0000-4000-8000-000000000001",
  shortCode: "a3-evid",
  sessionId: "e551d000-0000-4000-8000-000000000001",
  startedAt: "2026-05-01T12:00:00.000Z",
  outboundId: "e5b00000-0000-4000-8000-000000000001",
  renterId: "e5b00000-0000-4000-8000-000000000002",
  staffId: "e5b00000-0000-4000-8000-000000000003",
} as const;

/** The RNT reference of the seeded rich evidence session (deterministic). */
export const EVIDENCE_RNT = rntRef(EVIDENCE.sessionId, EVIDENCE.startedAt);

// ---- Disposable factories (mutating tests) ----------------------------------

export type DisposableAsset = { assetId: string; shortCode: string };

/** Create a public asset in org A with an active QR link and a resolvable return template. */
export async function createAsset(opts: { templateKey?: string; category?: string } = {}): Promise<DisposableAsset> {
  const a = admin();
  const assetId = randomUUID();
  const shortCode = `e2e-${uniqueSuffix()}`;
  const { error: aErr } = await a.from("assets").insert({
    id: assetId,
    organization_id: ORG_A,
    asset_code: `E2E-${shortCode.slice(-6).toUpperCase()}`,
    asset_name: `E2E ${shortCode}`,
    category: opts.category ?? "Utility Trailer",
    public_status: "public",
    return_inspection_template_key: opts.templateKey ?? "utility_trailer",
  });
  if (aErr) throw new Error(`createAsset: ${aErr.message}`);
  const { error: pErr } = await a
    .from("equipment_pages")
    .insert({ asset_id: assetId, organization_id: ORG_A, headline: "E2E asset", is_published: true });
  if (pErr) throw new Error(`createAsset page: ${pErr.message}`);
  const { error: qErr } = await a.from("qr_links").insert({
    organization_id: ORG_A,
    asset_id: assetId,
    short_code: shortCode,
    public_url: `http://127.0.0.1/t/${shortCode}`,
    status: "active",
  });
  if (qErr) throw new Error(`createAsset qr: ${qErr.message}`);
  return { assetId, shortCode };
}

/** Create a disposable submission directly (for status/badge/idempotency tests). Returns its id. */
export async function createSubmission(input: {
  assetId: string;
  formType?: "damage_report" | "support_request" | "return_checklist";
  status?: "new" | "reviewed" | "resolved" | "archived";
}): Promise<string> {
  const a = admin();
  const id = randomUUID();
  const { error } = await a.from("form_submissions").insert({
    id,
    organization_id: ORG_A,
    asset_id: input.assetId,
    form_type: input.formType ?? "damage_report",
    status: input.status ?? "new",
    submitted_by_name: "E2E Renter",
    submission_data_json: { description: "e2e" },
  });
  if (error) throw new Error(`createSubmission: ${error.message}`);
  return id;
}

/** An available asset (no active session) — outbound here should CREATE a session. */
export async function createAvailableStaffAsset(): Promise<DisposableAsset> {
  return createAsset();
}

export type RentedAsset = DisposableAsset & { sessionId: string; startedAt: string };

/** A rented asset with an active session but NO outbound baseline — outbound here should ATTACH. */
export async function createRentedStaffAsset(): Promise<RentedAsset> {
  const a = admin();
  const asset = await createAsset();
  const sessionId = randomUUID();
  const startedAt = "2026-04-01T09:00:00.000Z";
  const { error: sErr } = await a.from("asset_rental_sessions").insert({
    id: sessionId,
    organization_id: ORG_A,
    asset_id: asset.assetId,
    status: "active",
    started_at: startedAt,
    renter_label: "E2E Renter Co",
  });
  if (sErr) throw new Error(`createRentedStaffAsset session: ${sErr.message}`);
  const { error: uErr } = await a
    .from("assets")
    .update({ active_rental_session_id: sessionId })
    .eq("id", asset.assetId);
  if (uErr) throw new Error(`createRentedStaffAsset pointer: ${uErr.message}`);
  return { ...asset, sessionId, startedAt };
}

/** A rented asset that already has an authoritative outbound baseline — outbound here is BLOCKED. */
export async function createRentedWithBaseline(): Promise<RentedAsset & { baselineId: string }> {
  const a = admin();
  const rented = await createRentedStaffAsset();
  const baselineId = randomUUID();
  const { error } = await a.from("form_submissions").insert({
    id: baselineId,
    organization_id: ORG_A,
    asset_id: rented.assetId,
    form_type: "pre_use_inspection",
    status: "resolved",
    submission_data_json: minimalInspectionData("outbound"),
    media_urls: [],
  });
  if (error) throw new Error(`createRentedWithBaseline insert: ${error.message}`);
  // The BEFORE-INSERT trigger derived rental_session_id from the asset pointer; force origin=staff.
  await a
    .from("form_submissions")
    .update({ submission_origin: "staff", rental_session_id: rented.sessionId })
    .eq("id", baselineId);
  return { ...rented, baselineId };
}

/** Look up a fixture profile id by email (for actor columns on seeded evidence rows). */
async function profileIdByEmail(email: string): Promise<string> {
  const { data } = await admin().from("profiles").select("id").eq("email", email).maybeSingle();
  if (!data) throw new Error(`profileIdByEmail: no profile for ${email}`);
  return data.id as string;
}

function minimalInspectionData(audience: "outbound" | "renter" | "staff") {
  return {
    schema_version: 2,
    template_key: "utility_trailer",
    template_version: "2026-07-2",
    template_snapshot: { key: "utility_trailer", version: "2026-07-2", sections: [] },
    answers: { values: {}, photos: {} },
    flags: { damage_observed: "no", accessories_missing: false },
    ...(audience === "staff" ? { audience: "staff" } : {}),
  };
}

// ---- Read-only enrichment (global-setup) ------------------------------------

/**
 * Adds the content golden-path READ tests need, on top of the A3.2 baseline. Idempotent: it deletes the
 * fixed evidence graph first, then reinserts. Never touches the A3.2 security fixtures' assertions.
 */
export async function seedE2eExtras(): Promise<void> {
  const a = admin();

  // 1. Give A_PUBLIC's equipment page real content so the public <details> accordions render.
  const A_PUBLIC = "a5501111-1111-1111-1111-111111111111";
  await a
    .from("equipment_pages")
    .update({
      headline: "Read this before you start",
      quick_start_text: "Check the fluids, then start the engine and let it warm up.",
      safety_notes: "Wear a hard hat and hi-vis. Keep bystanders clear of the swing radius.",
      fuel_power_notes: "Diesel only. Do not run below a quarter tank.",
      return_notes: "Return with a full tank and the cab swept out.",
      troubleshooting_notes: "If it won't start, check the battery isolator switch.",
      emergency_notes: "In an emergency call the number on the tag.",
    })
    .eq("asset_id", A_PUBLIC);

  // 2. Assign a concrete system return template so the public return form renders known fields, and point
  //    A_PUBLIC at its seeded active rental session (the A3.2 fixtures create the session but never set the
  //    asset pointer) so the once-per-rental acknowledgement prompt actually renders on the scan page.
  await a
    .from("assets")
    .update({ return_inspection_template_key: "utility_trailer", active_rental_session_id: RENTAL.A_ACTIVE })
    .eq("id", A_PUBLIC);

  // 3. A rich rental-session evidence graph (fixed ids → deterministic RNT). Delete-then-insert.
  await a.from("asset_rental_sessions").delete().eq("id", EVIDENCE.sessionId);
  await a.from("form_submissions").delete().in("id", [EVIDENCE.outboundId, EVIDENCE.renterId, EVIDENCE.staffId]);
  await a.from("assets").delete().eq("id", EVIDENCE.assetId);

  // Insert the asset WITHOUT the active-session pointer first: the asset↔session FKs are circular
  // (session.asset_id → asset, asset.active_rental_session_id → session), so the pointer is set by UPDATE
  // after the session exists.
  const { error: assetErr } = await a.from("assets").insert({
    id: EVIDENCE.assetId,
    organization_id: ORG_A,
    asset_code: "E2E-EVID",
    asset_name: "E2E Evidence Rig",
    category: "Utility Trailer",
    public_status: "public",
    return_inspection_template_key: "utility_trailer",
  });
  if (assetErr) throw new Error(`seedE2eExtras asset: ${assetErr.message}`);
  await a
    .from("equipment_pages")
    .insert({ asset_id: EVIDENCE.assetId, organization_id: ORG_A, headline: "Evidence rig", is_published: true });
  await a.from("qr_links").insert({
    organization_id: ORG_A,
    asset_id: EVIDENCE.assetId,
    short_code: EVIDENCE.shortCode,
    public_url: `http://127.0.0.1/t/${EVIDENCE.shortCode}`,
    status: "active",
  });
  const { error: sErr } = await a.from("asset_rental_sessions").insert({
    id: EVIDENCE.sessionId,
    organization_id: ORG_A,
    asset_id: EVIDENCE.assetId,
    status: "active",
    started_at: EVIDENCE.startedAt,
    rental_reference: "PO-4471",
    renter_label: "Acme Framing",
  });
  if (sErr) throw new Error(`seedE2eExtras session: ${sErr.message}`);

  // Now the session exists — point the asset at it.
  const { error: ptrErr } = await a
    .from("assets")
    .update({ active_rental_session_id: EVIDENCE.sessionId })
    .eq("id", EVIDENCE.assetId);
  if (ptrErr) throw new Error(`seedE2eExtras pointer: ${ptrErr.message}`);

  const staffProfile = await profileIdByEmail("staff.a@orga.a3test");
  const media = [STORAGE.A_SUBMISSION]; // a real seeded storage object → signs to a photo tile

  // Insert the three submissions (trigger will link rental_session_id via the asset pointer), then patch
  // origin/actor/status so the outbound + staff rows are deterministically staff-origin.
  await a.from("form_submissions").insert([
    { id: EVIDENCE.outboundId, organization_id: ORG_A, asset_id: EVIDENCE.assetId, form_type: "pre_use_inspection", status: "resolved", submission_data_json: minimalInspectionData("outbound"), media_urls: media },
    { id: EVIDENCE.renterId, organization_id: ORG_A, asset_id: EVIDENCE.assetId, form_type: "return_checklist", status: "new", submitted_by_name: "Renter Rita", submission_data_json: minimalInspectionData("renter"), media_urls: media },
    { id: EVIDENCE.staffId, organization_id: ORG_A, asset_id: EVIDENCE.assetId, form_type: "return_checklist", status: "reviewed", submission_data_json: minimalInspectionData("staff"), media_urls: media },
  ]);
  await a.from("form_submissions").update({ submission_origin: "staff", submitted_by_profile_id: staffProfile, rental_session_id: EVIDENCE.sessionId }).eq("id", EVIDENCE.outboundId);
  await a.from("form_submissions").update({ submission_origin: "public", rental_session_id: EVIDENCE.sessionId }).eq("id", EVIDENCE.renterId);
  await a.from("form_submissions").update({ submission_origin: "staff", submitted_by_profile_id: staffProfile, rental_session_id: EVIDENCE.sessionId }).eq("id", EVIDENCE.staffId);

  await a.from("asset_acknowledgements").insert({
    organization_id: ORG_A,
    asset_id: EVIDENCE.assetId,
    rental_session_id: EVIDENCE.sessionId,
    name: "Renter Rita",
    email: "rita@example.test",
    statement: "I acknowledge access to the instructions, safety notes, and support contact.",
  });
}

// ---- Rate limit ------------------------------------------------------------

/**
 * Pre-consume the shared-store rate limit for (action, ip, shortCode) so the NEXT real browser submit is
 * over the limit. The app derives the same key from the injected E2E salt; the browser must send the same
 * `x-forwarded-for` ip. Calls the private RPC via the service-role client (which the app also uses).
 */
export async function exhaustRateLimit(action: RateLimitAction, shortCode: string, ip: string): Promise<void> {
  const key = buildBucketKey(action, hash(ip), hash(shortCode));
  const rules = selectRules(action, false);
  const max = Math.max(...rules.map((r) => r.max));
  const a = admin();
  for (let i = 0; i <= max; i++) {
    const { error } = await a.rpc("rate_limit_touch", { p_key: key, p_rules: rules });
    if (error) throw new Error(`exhaustRateLimit: ${error.message}`);
  }
}

/** Count submissions for an asset (service read) — for idempotency assertions. */
export async function countSubmissions(assetId: string, formType?: string): Promise<number> {
  let q = admin().from("form_submissions").select("id", { count: "exact", head: true }).eq("asset_id", assetId);
  if (formType) q = q.eq("form_type", formType);
  const { count } = await q;
  return count ?? 0;
}

/** The asset's current active_rental_session_id (null when available) — for outbound "created a session". */
export async function readAssetActiveSession(assetId: string): Promise<string | null> {
  const { data } = await admin().from("assets").select("active_rental_session_id").eq("id", assetId).maybeSingle();
  return (data?.active_rental_session_id as string | null) ?? null;
}

/** A rental session's started_at (for the outbound-attach "started_at unchanged" assertion). */
export async function readSessionStartedAt(sessionId: string): Promise<string | null> {
  const { data } = await admin().from("asset_rental_sessions").select("started_at").eq("id", sessionId).maybeSingle();
  return (data?.started_at as string | null) ?? null;
}

/** Read a rental session's status + the asset's active pointer (staff workflow assertions). */
export async function readSessionState(sessionId: string, assetId: string): Promise<{ status: string; activePointer: string | null }> {
  const a = admin();
  const { data: s } = await a.from("asset_rental_sessions").select("status").eq("id", sessionId).maybeSingle();
  const { data: asset } = await a.from("assets").select("active_rental_session_id").eq("id", assetId).maybeSingle();
  return { status: (s?.status as string) ?? "missing", activePointer: (asset?.active_rental_session_id as string | null) ?? null };
}
