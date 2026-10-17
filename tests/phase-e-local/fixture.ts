import type pg from "pg";

import { NORTHRIDGE, db, serviceClient, stack } from "./support";

/**
 * Engineering Phase E1 — the synthetic Northridge used by the local recovery rehearsal. It is built on the LOCAL seed's
 * Northridge rows (same organization id and the same ids as the two seed-backed protected routes) and adds every shape
 * the real archive has to survive, with fictional data and `.invalid` addresses only:
 *
 *   - the asset <-> rental-session cycle (an active session the asset points at) and a returned session;
 *   - staff, public and pre-use submissions bound to sessions, a v2 submission with a template snapshot and photo paths;
 *   - a disabled QR row superseded by a production-primary row on the same asset;
 *   - a digest ledger (one sent window, one failed) whose last success is the watermark W;
 *   - a tenant profile and a platform-owner profile the tenant's rows reference (an identity outside the tenant);
 *   - Storage objects in all three buckets, one of them outside today's submissions MIME rules (image/gif), and two
 *     dangling references (a photo path and a document path with no object behind them).
 *
 * Exact states are written with `session_replication_role = replica` in one transaction (the insert triggers would
 * otherwise rewrite origin, actor and QR governance) — local synthetic data only.
 */

export const SEED = {
  exAsset: "21111111-1111-4111-8111-111111111101", // demo-ex017, a protected route
  trAsset: "21111111-1111-4111-8111-111111111102", // demo-tr014, a protected route
  genAsset: "21111111-1111-4111-8111-111111111103",
  compAsset: "21111111-1111-4111-8111-111111111104",
  qrEx017: "41111111-1111-4111-8111-111111111101",
  qrTr014: "41111111-1111-4111-8111-111111111102",
  qrComp003: "41111111-1111-4111-8111-111111111104",
  tagRequest: "61111111-1111-4111-8111-111111111101",
} as const;

/** Synthetic ids all start with `e1` so the rehearsal can tell its own rows from the seed's. */
export const FX = {
  adminAuth: "e1a00000-0000-4000-8000-000000000001",
  ownerAuth: "e1a00000-0000-4000-8000-000000000002",
  adminProfile: "e1b00000-0000-4000-8000-000000000001",
  ownerProfile: "e1b00000-0000-4000-8000-000000000002",
  qrComp004: "e1c00000-0000-4000-8000-000000000004",
  sessionActive: "e1d00000-0000-4000-8000-000000000001",
  sessionReturned: "e1d00000-0000-4000-8000-000000000002",
  subOutbound: "e1e00000-0000-4000-8000-000000000001",
  subStaffReturn: "e1e00000-0000-4000-8000-000000000002",
  subPublicReturn: "e1e00000-0000-4000-8000-000000000003",
  subDamage: "e1e00000-0000-4000-8000-000000000004",
  docPresent: "e1f00000-0000-4000-8000-000000000001",
  docDangling: "e1f00000-0000-4000-8000-000000000002",
  ack: "e1100000-0000-4000-8000-000000000001",
  ledgerSent: "e1200000-0000-4000-8000-000000000001",
  ledgerFailed: "e1200000-0000-4000-8000-000000000002",
  template: "e1300000-0000-4000-8000-000000000001",
  categoryDefault: "e1400000-0000-4000-8000-000000000001",
  pageTemplate: "e1500000-0000-4000-8000-000000000001",
  activity: "e1600000-0000-4000-8000-000000000001",
  cover: "e1700000-0000-4000-8000-000000000001",
  logo: "e1700000-0000-4000-8000-000000000002",
} as const;

export const FIXTURE_PASSWORD = process.env.E2E_PASSWORD ?? "phase-e-local-fixture-only";
export const ADMIN_EMAIL = "northridge.admin@phase-e-fixture.invalid";
export const OWNER_EMAIL = "platform.owner@phase-e-fixture.invalid";
export const NOTIFY_EMAIL = "northridge.notify@phase-e-fixture.invalid";
/** The last successful digest window end (a 6 AM Pacific cutoff, PDT). */
export const WATERMARK = "2026-09-30T13:00:00.000Z";

const org = `org/${NORTHRIDGE}`;
export const OBJECTS = {
  outboundPhoto: { bucket: "submissions", path: `${org}/asset/${SEED.exAsset}/submission/${FX.subOutbound}/baseline-front.jpg`, type: "image/jpeg" },
  returnPhoto: { bucket: "submissions", path: `${org}/asset/${SEED.trAsset}/submission/${FX.subPublicReturn}/damage-closeup.jpg`, type: "image/jpeg" },
  damagePng: { bucket: "submissions", path: `${org}/asset/${SEED.genAsset}/submission/${FX.subDamage}/panel.png`, type: "image/png" },
  damageGif: { bucket: "submissions", path: `${org}/asset/${SEED.genAsset}/submission/${FX.subDamage}/legacy-clip.gif`, type: "image/gif" },
  manual: { bucket: "documents", path: `${org}/asset/${SEED.exAsset}/documents/${FX.docPresent}/${FX.docPresent}.pdf`, type: "application/pdf" },
  cover: { bucket: "public-assets", path: `${org}/asset/${SEED.exAsset}/cover/${FX.cover}.png`, type: "image/png" },
  logo: { bucket: "public-assets", path: `${org}/logo/${FX.logo}.png`, type: "image/png" },
} as const;
export const DANGLING = {
  damagePhoto: `${org}/asset/${SEED.genAsset}/submission/${FX.subDamage}/lost-upload.jpg`,
  document: `${org}/asset/${SEED.exAsset}/documents/${FX.docDangling}/${FX.docDangling}.pdf`,
} as const;

const publicUrl = (o: { bucket: string; path: string }) => `${stack().apiUrl}/storage/v1/object/public/${o.bucket}/${o.path}`;

async function ensureUser(id: string, email: string) {
  const admin = serviceClient();
  const existing = await admin.auth.admin.getUserById(id);
  if (existing.data?.user) await admin.auth.admin.deleteUser(id);
  const { error } = await admin.auth.admin.createUser({ id, email, password: FIXTURE_PASSWORD, email_confirm: true });
  if (error) throw new Error(`could not create the local fixture user (${error.message})`);
}

/** Upload one object, widening the bucket's MIME list only for that upload and restoring it afterwards. */
async function upload(client: pg.Client, object: { bucket: string; path: string; type: string }, bytes: Buffer) {
  const admin = serviceClient();
  const before = (await client.query(`select allowed_mime_types from storage.buckets where id = $1`, [object.bucket])).rows[0];
  const widen = Array.isArray(before?.allowed_mime_types) && !before.allowed_mime_types.includes(object.type);
  if (widen) await client.query(`update storage.buckets set allowed_mime_types = array_append(allowed_mime_types, $2) where id = $1`, [object.bucket, object.type]);
  try {
    await admin.storage.from(object.bucket).remove([object.path]);
    const { error } = await admin.storage.from(object.bucket).upload(object.path, bytes, { contentType: object.type, cacheControl: "3600", upsert: false });
    if (error) throw new Error(`fixture upload failed (${error.message})`);
  } finally {
    if (widen) await client.query(`update storage.buckets set allowed_mime_types = $2 where id = $1`, [object.bucket, before.allowed_mime_types]);
  }
}

const json = (value: unknown) => JSON.stringify(value);

export async function buildSyntheticNorthridge(): Promise<void> {
  await ensureUser(FX.adminAuth, ADMIN_EMAIL);
  await ensureUser(FX.ownerAuth, OWNER_EMAIL);

  const client = await db();
  try {
    for (const [name, object] of Object.entries(OBJECTS)) {
      await upload(client, object, Buffer.from(`phase-e synthetic ${name} bytes`));
    }

    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    const q = (sql: string, params: unknown[] = []) => client.query(sql, params);

    await q(
      `insert into public.profiles (id, auth_user_id, organization_id, name, email, role, status) values
         ($1, $2, $3, 'Synthetic Northridge Admin', $4, 'customer_admin', 'active'),
         ($5, $6, null, 'Synthetic Platform Owner', $7, 'platform_owner', 'active')`,
      [FX.adminProfile, FX.adminAuth, NORTHRIDGE, ADMIN_EMAIL, FX.ownerProfile, FX.ownerAuth, OWNER_EMAIL]
    );
    await q(
      `update public.organizations set logo_url = $2, notification_email = $3, return_notification_mode = 'instant_renter' where id = $1`,
      [NORTHRIDGE, publicUrl(OBJECTS.logo), NOTIFY_EMAIL]
    );
    await q(
      `insert into public.equipment_page_templates (id, organization_id, key, name, description, headline, is_system, is_active)
       values ($1, $2, 'nr-standard', 'Northridge standard page', 'Synthetic org template', 'Before you start', false, true)`,
      [FX.pageTemplate, NORTHRIDGE]
    );
    await q(
      `insert into public.inspection_templates (id, organization_id, inspection_type, family_key, version, status, name, description, source_system_template_key, definition_json, published_at)
       values ($1, $2, 'return', 'nr-excavator-return', 1, 'published', 'Northridge excavator return', 'Synthetic', 'excavator', $3::jsonb, '2026-09-01T16:00:00Z')`,
      [FX.template, NORTHRIDGE, json({ sections: [{ key: "condition", fields: [{ key: "damage_observed", type: "yes_no" }] }] })]
    );
    await q(
      `insert into public.inspection_category_defaults (id, organization_id, category_value, normalized_category_value, return_template_key, return_template_id)
       values ($1, $2, 'Excavator', 'excavator', 'excavator', $3)`,
      [FX.categoryDefault, NORTHRIDGE, FX.template]
    );
    await q(
      `insert into public.notification_digest_runs (id, organization_id, digest_type, window_start, window_end, status, item_count, provider_id, failure_class, created_at, completed_at) values
         ($1, $3, 'return_exceptions', '2026-09-28T13:00:00Z', '2026-09-29T13:00:00Z', 'failed', 1, null, 'provider_5xx', '2026-09-29T13:05:00Z', '2026-09-29T13:05:30Z'),
         ($2, $3, 'return_exceptions', '2026-09-28T13:00:00Z', $4, 'sent', 1, 'fixture-provider-id', null, '2026-09-30T13:05:00Z', '2026-09-30T13:05:20Z')`,
      [FX.ledgerFailed, FX.ledgerSent, NORTHRIDGE, WATERMARK]
    );
    await q(
      `insert into public.activity_log (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       values ($1, $2, $3, 'asset.updated', 'asset', $4, $5::jsonb, '2026-10-01T17:00:00Z')`,
      [FX.activity, NORTHRIDGE, FX.adminProfile, SEED.exAsset, json({ fields: ["cover_image_url"] })]
    );
    // Sessions: a returned one on the trailer, an active one on the excavator (the asset points back at it).
    await q(
      `insert into public.asset_rental_sessions (id, organization_id, asset_id, status, rental_reference, renter_label, started_at, returned_at, created_by_profile_id, returned_by_profile_id, created_at, updated_at) values
         ($1, $3, $4, 'returned', 'SYN-1001', 'Synthetic Renter A', '2026-09-20T15:00:00Z', '2026-09-25T18:30:00Z', $6, $6, '2026-09-20T15:00:00Z', '2026-09-25T18:30:00Z'),
         ($2, $3, $5, 'active', 'SYN-1002', 'Synthetic Renter B', '2026-10-10T15:00:00Z', null, $6, null, '2026-10-10T15:00:00Z', '2026-10-10T15:00:00Z')`,
      [FX.sessionReturned, FX.sessionActive, NORTHRIDGE, SEED.trAsset, SEED.exAsset, FX.adminProfile]
    );
    await q(
      `update public.assets set active_rental_session_id = $2, cover_image_url = $3, return_inspection_template_id = $4, return_inspection_template_key = 'excavator' where id = $1`,
      [SEED.exAsset, FX.sessionActive, publicUrl(OBJECTS.cover), FX.template]
    );
    await q(
      `insert into public.asset_acknowledgements (id, organization_id, asset_id, name, email, phone, statement, acknowledged_at, created_at, rental_session_id)
       values ($1, $2, $3, 'Synthetic Renter B', 'renter.b@phase-e-fixture.invalid', null, 'I have read the safety notes.', '2026-10-10T15:10:00Z', '2026-10-10T15:10:00Z', $4)`,
      [FX.ack, NORTHRIDGE, SEED.exAsset, FX.sessionActive]
    );
    const v2 = {
      version: 2,
      template_snapshot: { key: "excavator", version: 1, sections: [{ key: "condition", fields: ["damage_observed", "accessories_returned"] }] },
      answers: { damage_observed: "yes", accessories_returned: "yes", photos: { damage_closeup: [{ path: OBJECTS.returnPhoto.path, mimetype: "image/jpeg" }] } },
    };
    await q(
      `insert into public.form_submissions (id, organization_id, asset_id, form_type, submitted_by_name, submitted_by_email, submission_data_json, media_urls, status, created_at, rental_session_id, inspection_template_key, inspection_template_version, submission_origin, submitted_by_profile_id) values
         ($1, $5, $6, 'pre_use_inspection', 'Synthetic Northridge Admin', null, $9::jsonb, $10::jsonb, 'reviewed', '2026-10-10T15:05:00Z', $11, null, null, 'staff', $13),
         ($2, $5, $7, 'return_checklist', 'Synthetic Northridge Admin', null, $12::jsonb, '[]'::jsonb, 'resolved', '2026-09-25T18:20:00Z', $14, null, null, 'staff', $13),
         ($3, $5, $7, 'return_checklist', 'Synthetic Renter A', 'renter.a@phase-e-fixture.invalid', $15::jsonb, $16::jsonb, 'new', '2026-09-25T18:00:00Z', $14, 'excavator', 1, 'public', null),
         ($4, $5, $8, 'damage_report', 'Synthetic Visitor', null, $17::jsonb, $18::jsonb, 'new', '2026-10-05T20:00:00Z', null, null, null, 'public', null)`,
      [
        FX.subOutbound,
        FX.subStaffReturn,
        FX.subPublicReturn,
        FX.subDamage,
        NORTHRIDGE,
        SEED.exAsset,
        SEED.trAsset,
        SEED.genAsset,
        json({ fuel_level: "full", hour_meter: 412 }),
        json([OBJECTS.outboundPhoto.path]),
        FX.sessionActive,
        json({ damage_observed: "no", accessories_returned: "yes" }),
        FX.adminProfile,
        FX.sessionReturned,
        json(v2),
        json([OBJECTS.returnPhoto.path]),
        json({ urgency: "medium", description: "Synthetic: panel cracked." }),
        json([OBJECTS.damagePng.path, OBJECTS.damageGif.path, DANGLING.damagePhoto]),
      ]
    );
    await q(
      `insert into public.documents (id, organization_id, asset_id, title, document_type, url, storage_path, visibility, link_status) values
         ($1, $3, $4, 'Synthetic operator manual', 'manual', null, $5, 'private', 'ok'),
         ($2, $3, $4, 'Synthetic lost upload', 'other', null, $6, 'private', 'unknown')`,
      [FX.docPresent, FX.docDangling, NORTHRIDGE, SEED.exAsset, OBJECTS.manual.path, DANGLING.document]
    );
    // QR lineage: the seed's demo-comp003 is disabled and superseded by a production-primary row on the same asset.
    const comp003 = (await q(`select public_url from public.qr_links where id = $1`, [SEED.qrComp003])).rows[0];
    await q(`update public.qr_links set status = 'disabled', is_production_primary = false where id = $1`, [SEED.qrComp003]);
    await q(
      `insert into public.qr_links (id, organization_id, asset_id, short_code, public_url, status, is_production_primary, supersedes_qr_link_id, created_at, updated_at)
       values ($1, $2, $3, 'demo-comp004', $4, 'active', true, $5, '2026-09-15T16:00:00Z', '2026-09-15T16:00:00Z')`,
      [FX.qrComp004, NORTHRIDGE, SEED.compAsset, String(comp003.public_url).replace("demo-comp003", "demo-comp004"), SEED.qrComp003]
    );
    await q(
      `update public.tag_requests set requested_by_profile_id = $2, platform_viewed_by_profile_id = $3, platform_viewed_at = '2026-09-16T17:00:00Z' where id = $1`,
      [SEED.tagRequest, FX.adminProfile, FX.ownerProfile]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
