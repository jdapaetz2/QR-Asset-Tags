import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getStackConfig } from "./stack";

/**
 * Deterministic fixture graph for the executed security suite (Phase A3.2).
 *
 * The service-role client is used HERE ONLY — for setup/teardown. Every assertion in the
 * test files runs through a REAL signed-in `supabase-js` client (or the anon client), so it
 * exercises PostgREST/Storage exactly as the app does. No production project is ever touched
 * (the local-only guard in stack.ts runs first).
 *
 * Two active orgs (A, B) prove cross-tenant isolation; a suspended org (C) proves the
 * disabled/suspended paths. Fixed UUIDs, all distinct from the demo org (11111111-…) seeded
 * by 0003/seed.sql, so fixtures never collide with seed data.
 */

// ---- Identities -------------------------------------------------------------

export const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
export const ORG_C_SUSPENDED = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// A shared local test password. Non-secret by default (a throwaway used only against the LOCAL stack);
// override via E2E_PASSWORD for a non-local target so no real credential is ever tracked in source. The
// default is unchanged, so the executed security suite behaves identically. Both the seeder (which creates
// the users with this password) and the E2E auth fixtures read from here, so they can never diverge.
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "A3dot2-Local-Test-Pw!";

export type ActorKey =
  | "owner"
  | "admin_a"
  | "staff_a"
  | "admin_b"
  | "staff_b"
  | "disabled_a"
  | "admin_c";

type ActorSpec = {
  email: string;
  orgId: string | null;
  role: "platform_owner" | "customer_admin" | "customer_staff";
  status: "active" | "invited" | "disabled";
};

export const ACTORS: Record<ActorKey, ActorSpec> = {
  owner: { email: "owner@platform.a3test", orgId: null, role: "platform_owner", status: "active" },
  admin_a: { email: "admin.a@orga.a3test", orgId: ORG_A, role: "customer_admin", status: "active" },
  staff_a: { email: "staff.a@orga.a3test", orgId: ORG_A, role: "customer_staff", status: "active" },
  admin_b: { email: "admin.b@orgb.a3test", orgId: ORG_B, role: "customer_admin", status: "active" },
  staff_b: { email: "staff.b@orgb.a3test", orgId: ORG_B, role: "customer_staff", status: "active" },
  disabled_a: { email: "disabled.a@orga.a3test", orgId: ORG_A, role: "customer_staff", status: "disabled" },
  admin_c: { email: "admin.c@orgc.a3test", orgId: ORG_C_SUSPENDED, role: "customer_admin", status: "active" },
};

// ---- Per-org data ids -------------------------------------------------------

export const ASSET = {
  A_PUBLIC: "a5501111-1111-1111-1111-111111111111",
  A_PRIVATE: "a5502222-2222-2222-2222-222222222222",
  A_ARCHIVED: "a5503333-3333-3333-3333-333333333333",
  B_PUBLIC: "b5501111-1111-1111-1111-111111111111",
  B_PRIVATE: "b5502222-2222-2222-2222-222222222222",
  C_PUBLIC: "c5501111-1111-1111-1111-111111111111",
} as const;

export const QR = {
  A: "a6601111-1111-1111-1111-111111111111",
  B: "b6601111-1111-1111-1111-111111111111",
} as const;

export const DOC = {
  A_PUBLIC: "a7701111-1111-1111-1111-111111111111",
  A_PRIVATE: "a7702222-2222-2222-2222-222222222222",
  B_PRIVATE: "b7702222-2222-2222-2222-222222222222",
} as const;

export const SUBMISSION = {
  A_RETURN: "a8801111-1111-1111-1111-111111111111",
  B_DAMAGE: "b8801111-1111-1111-1111-111111111111",
} as const;

export const TEMPLATE = {
  A: "a9901111-1111-1111-1111-111111111111",
  B: "b9901111-1111-1111-1111-111111111111",
} as const;

export const RENTAL = {
  A_ACTIVE: "aaa01111-1111-1111-1111-111111111111",
} as const;

// Storage object paths (org-scoped). Distinct buckets exercise the three policies.
// Extensions/content types must satisfy each bucket's allowed-MIME list (0002/0005): submissions +
// public-assets take images, documents takes PDF.
export const STORAGE = {
  A_SUBMISSION: `org/${ORG_A}/submission-evidence.png`,
  B_SUBMISSION: `org/${ORG_B}/submission-evidence.png`,
  A_DOC_PUBLIC: `org/${ORG_A}/public-manual.pdf`,
  A_DOC_PRIVATE: `org/${ORG_A}/private-manual.pdf`,
  A_COVER: `org/${ORG_A}/cover.png`,
} as const;

// ---- Clients ----------------------------------------------------------------

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } } as const;

/** Service-role client — SETUP/TEARDOWN ONLY. Bypasses RLS. */
export function serviceClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = getStackConfig();
  return createClient(apiUrl, serviceRoleKey, noPersist);
}

/** A fresh anonymous client (the public scanner). */
export function anonClient(): SupabaseClient {
  const { apiUrl, anonKey } = getStackConfig();
  return createClient(apiUrl, anonKey, noPersist);
}

/** A real signed-in client for an actor — assertions run through this, exactly like the app. */
export async function signInAs(actor: ActorKey): Promise<SupabaseClient> {
  const { apiUrl, anonKey } = getStackConfig();
  const client = createClient(apiUrl, anonKey, noPersist);
  const { error } = await client.auth.signInWithPassword({
    email: ACTORS[actor].email,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`could not sign in fixture actor ${actor}: ${error.message}`);
  return client;
}

// ---- Seeding ----------------------------------------------------------------

async function upsertAuthUser(admin: SupabaseClient, spec: ActorSpec): Promise<string> {
  // Idempotent: delete any prior auth user for this email, then create fresh. Paginate to find it.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === spec.email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed for ${spec.email}: ${error?.message}`);
  return data.user.id;
}

/**
 * Wipe any prior fixtures for our three orgs (cascades to all child rows and profiles) and
 * remove our storage objects. Leaves the demo org (seed.sql) untouched.
 */
async function teardown(admin: SupabaseClient): Promise<void> {
  for (const path of Object.values(STORAGE)) {
    await admin.storage.from(path.includes("cover") ? "public-assets" : path.includes("manual") ? "documents" : "submissions").remove([path]).catch(() => {});
  }
  await admin.from("organizations").delete().in("id", [ORG_A, ORG_B, ORG_C_SUSPENDED]);
}

export type SeededActors = Record<ActorKey, { authUserId: string; profileId: string }>;

export async function seedFixtures(): Promise<SeededActors> {
  const admin = serviceClient();
  await teardown(admin);

  // Organizations. asset_limit=null so the coverage trigger (0016) never blocks qr_link seeding.
  // Org B has customer exports enabled (for the executed export-flag boundary). Commercial values
  // are set so the "customer cannot mutate them" assertions have a known baseline.
  const orgs: Array<Record<string, unknown>> = [
    {
      id: ORG_A, name: "Org A", slug: "org-a-a3", status: "active", asset_limit: null,
      plan_name: "Standard", monthly_fee: 100,
      customer_exports_enabled: false, export_submissions_enabled: false,
    },
    {
      id: ORG_B, name: "Org B", slug: "org-b-a3", status: "active", asset_limit: null,
      plan_name: "Standard", monthly_fee: 200,
      customer_exports_enabled: true, export_assets_enabled: true, export_submissions_enabled: true,
    },
    {
      id: ORG_C_SUSPENDED, name: "Org C", slug: "org-c-a3", status: "suspended", asset_limit: null,
    },
  ];
  // Insert one at a time: a batched insert unions the object keys and sends NULL for any key
  // absent from a row, which trips the NOT NULL defaults on the export-flag columns.
  for (const org of orgs) {
    const { error: orgErr } = await admin.from("organizations").insert(org);
    if (orgErr) throw new Error(`seed organization ${org.id} failed: ${orgErr.message}`);
  }

  // Auth users + profiles.
  const seeded = {} as SeededActors;
  for (const [key, spec] of Object.entries(ACTORS) as [ActorKey, ActorSpec][]) {
    const authUserId = await upsertAuthUser(admin, spec);
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        organization_id: spec.orgId,
        name: key,
        email: spec.email,
        role: spec.role,
        status: spec.status,
      })
      .select("id")
      .single();
    if (profErr || !prof) throw new Error(`seed profile failed for ${key}: ${profErr?.message}`);
    seeded[key] = { authUserId, profileId: prof.id as string };
  }

  // Assets (public / private / archived for A; public / private for B; one public for C).
  const { error: assetErr } = await admin.from("assets").insert([
    { id: ASSET.A_PUBLIC, organization_id: ORG_A, asset_code: "A-PUB", asset_name: "A Public", category: "Excavator", public_status: "public", internal_notes: "secret-a" },
    { id: ASSET.A_PRIVATE, organization_id: ORG_A, asset_code: "A-PRV", asset_name: "A Private", category: "Trailer", public_status: "private", internal_notes: "secret-a" },
    { id: ASSET.A_ARCHIVED, organization_id: ORG_A, asset_code: "A-ARC", asset_name: "A Archived", category: "Generator", public_status: "private", archived_at: new Date(0).toISOString() },
    { id: ASSET.B_PUBLIC, organization_id: ORG_B, asset_code: "B-PUB", asset_name: "B Public", category: "Excavator", public_status: "public", internal_notes: "secret-b" },
    { id: ASSET.B_PRIVATE, organization_id: ORG_B, asset_code: "B-PRV", asset_name: "B Private", category: "Trailer", public_status: "private", internal_notes: "secret-b" },
    { id: ASSET.C_PUBLIC, organization_id: ORG_C_SUSPENDED, asset_code: "C-PUB", asset_name: "C Public", category: "Excavator", public_status: "public" },
  ]);
  if (assetErr) throw new Error(`seed assets failed: ${assetErr.message}`);

  // QR links (active), equipment pages (published), documents (public + private).
  const { error: qrErr } = await admin.from("qr_links").insert([
    { id: QR.A, organization_id: ORG_A, asset_id: ASSET.A_PUBLIC, short_code: "a3-a-pub", public_url: "http://127.0.0.1/t/a3-a-pub", status: "active" },
    { id: QR.B, organization_id: ORG_B, asset_id: ASSET.B_PUBLIC, short_code: "a3-b-pub", public_url: "http://127.0.0.1/t/a3-b-pub", status: "active" },
  ]);
  if (qrErr) throw new Error(`seed qr_links failed: ${qrErr.message}`);

  const { error: pageErr } = await admin.from("equipment_pages").insert([
    { asset_id: ASSET.A_PUBLIC, organization_id: ORG_A, headline: "A", is_published: true },
    { asset_id: ASSET.B_PUBLIC, organization_id: ORG_B, headline: "B", is_published: true },
  ]);
  if (pageErr) throw new Error(`seed equipment_pages failed: ${pageErr.message}`);

  const { error: docErr } = await admin.from("documents").insert([
    { id: DOC.A_PUBLIC, organization_id: ORG_A, asset_id: ASSET.A_PUBLIC, title: "A public manual", document_type: "manual", storage_path: STORAGE.A_DOC_PUBLIC, visibility: "public" },
    { id: DOC.A_PRIVATE, organization_id: ORG_A, asset_id: ASSET.A_PRIVATE, title: "A private manual", document_type: "manual", storage_path: STORAGE.A_DOC_PRIVATE, visibility: "private" },
    { id: DOC.B_PRIVATE, organization_id: ORG_B, asset_id: ASSET.B_PRIVATE, title: "B private manual", document_type: "manual", storage_path: `org/${ORG_B}/private-manual.pdf`, visibility: "private" },
  ]);
  if (docErr) throw new Error(`seed documents failed: ${docErr.message}`);

  // Form submissions (a return for A, a damage report for B).
  const { error: subErr } = await admin.from("form_submissions").insert([
    { id: SUBMISSION.A_RETURN, organization_id: ORG_A, asset_id: ASSET.A_PUBLIC, form_type: "return_checklist", status: "new" },
    { id: SUBMISSION.B_DAMAGE, organization_id: ORG_B, asset_id: ASSET.B_PUBLIC, form_type: "damage_report", status: "new" },
  ]);
  if (subErr) throw new Error(`seed form_submissions failed: ${subErr.message}`);

  // Inspection templates (published) — needed so staff-SELECT / cross-org-deny have real rows.
  const def = { fields: [] };
  const { error: tplErr } = await admin.from("inspection_templates").insert([
    { id: TEMPLATE.A, organization_id: ORG_A, family_key: "fam-a", version: 1, status: "published", name: "A return", source_system_template_key: "generic_return", definition_json: def, published_at: new Date(0).toISOString() },
    { id: TEMPLATE.B, organization_id: ORG_B, family_key: "fam-b", version: 1, status: "published", name: "B return", source_system_template_key: "generic_return", definition_json: def, published_at: new Date(0).toISOString() },
  ]);
  if (tplErr) throw new Error(`seed inspection_templates failed: ${tplErr.message}`);

  const { error: catErr } = await admin.from("inspection_category_defaults").insert([
    { organization_id: ORG_A, category_value: "Excavator", normalized_category_value: "excavator", return_template_key: "generic_return" },
    { organization_id: ORG_B, category_value: "Excavator", normalized_category_value: "excavator", return_template_key: "generic_return" },
  ]);
  if (catErr) throw new Error(`seed inspection_category_defaults failed: ${catErr.message}`);

  const { error: eptErr } = await admin.from("equipment_page_templates").insert([
    { organization_id: ORG_A, key: "a-tpl", name: "A tpl", is_system: false },
    { organization_id: ORG_B, key: "b-tpl", name: "B tpl", is_system: false },
  ]);
  if (eptErr) throw new Error(`seed equipment_page_templates failed: ${eptErr.message}`);

  const { error: trErr } = await admin.from("tag_requests").insert([
    { organization_id: ORG_A, status: "requested" },
    { organization_id: ORG_B, status: "requested" },
  ]);
  if (trErr) throw new Error(`seed tag_requests failed: ${trErr.message}`);

  // An active rental session on A's public asset (for RPC boundary tests).
  const { error: rsErr } = await admin.from("asset_rental_sessions").insert([
    { id: RENTAL.A_ACTIVE, organization_id: ORG_A, asset_id: ASSET.A_PUBLIC, status: "active" },
  ]);
  if (rsErr) throw new Error(`seed asset_rental_sessions failed: ${rsErr.message}`);

  // Storage objects: a private submission (A + B), a public document, a private document, a cover.
  // The Blob's own type must carry the MIME (storage-js uses the body's type for the upload part).
  const body = (type: string) => new Blob([new Uint8Array([1, 2, 3, 4])], { type });
  const puts: [string, string, string][] = [
    ["submissions", STORAGE.A_SUBMISSION, "image/png"],
    ["submissions", STORAGE.B_SUBMISSION, "image/png"],
    ["documents", STORAGE.A_DOC_PUBLIC, "application/pdf"],
    ["documents", STORAGE.A_DOC_PRIVATE, "application/pdf"],
    ["public-assets", STORAGE.A_COVER, "image/png"],
  ];
  for (const [bucket, path, contentType] of puts) {
    const { error } = await admin.storage.from(bucket).upload(path, body(contentType), { upsert: true, contentType });
    if (error) throw new Error(`seed storage object ${bucket}/${path} failed: ${error.message}`);
  }

  return seeded;
}
