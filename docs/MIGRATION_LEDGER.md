# Migration Ledger — Mulemark

Authoritative record of every SQL migration in `supabase/migrations/`. Created in Phase A1 from source inspection.
This ledger is the source of truth for **what each migration changes** and **which code assumes it**. It is **not**
proof of remote application.

## How to read "remote status"

- **Confirmed applied** — used **only** with direct remote evidence (a `supabase migration list` / `schema_migrations`
  readout from the linked project).
- **Operator verification required** — the default. The migration file exists locally and code assumes it, but its
  status on the linked Supabase project has **not** been verified from source.
- **Pending** — used **only** with remote evidence that it is not yet applied.

> **Remote status: CONFIRMED APPLIED (operator-verified, Phase A2, 2026-07).** The linked Supabase project was checked
> with `npx.cmd supabase migration list` (Local and Remote both contain every version 0001–0031, no unmatched
> versions) and `npx.cmd supabase db push --dry-run` (**"Remote database is up to date"** — no migrations would be
> applied). Because 0001–0031 are contiguous and all present remotely, the full supersession chains resolve to their
> authoritative endpoints (0019 / 0016 / 0022 / 0023 / 0028 / 0026 / 0029 / 0030 / 0031). The `supabase_migrations.
> schema_migrations` SQL query was unnecessary — the list + dry-run already provide sufficient remote evidence. The
> "ships unapplied" / "pending db push" notes in `docs/RETURN_INSPECTION_V2.md` and `docs/YARD_STAFF_SCANNER_MODE.md`
> are **historical, point-in-time** authoring notes and are superseded by this verification.
>
> Re-verify with the read-only commands below after any future migration is added; never claim applied without a fresh
> readout.
>
> **0032 (Phase A3.1) is NOT yet applied** — it was authored after the verification above and ships pending
> `npx.cmd supabase db push`. Its server-layer counterparts are already active in the app; the database backstop
> (role-aware write policies + the `profiles` privileged-column trigger) only takes effect once pushed. Run
> `npx.cmd supabase migration list` + `npx.cmd supabase db push --dry-run` first, then push.

### Operator verification commands (run against the linked project)

```bash
npx supabase migration list          # local vs remote applied (definitive)
npx supabase db push --dry-run       # shows migrations not yet applied
```
```sql
-- or, on the remote database:
select version, name from supabase_migrations.schema_migrations order by version;
```

Migrations are applied by the operator via `supabase db push`; there is **no automated migration step in CI or the
Vercel deploy**. Before the pilot, confirm **0001–0031 are all applied** on the target project (see A2).

---

## Supersession chains (apply the whole chain, not just the latest)

A later migration `CREATE OR REPLACE`s an earlier object; the **last** entry is authoritative but requires every
prior link to have run.

| Object | Chain | Authoritative |
|---|---|---|
| `current_org_id()` helper | 0001 → 0018 (disabled-aware) → 0019 (org-active-aware) | **0019** |
| export/commercial-field protection | 0015 (`protect_export_flags`) → 0016 (`protect_commercial_fields`, drops 0015 fn) → 0019 (adds `status`) | **0019** |
| `start_outbound_rental(...)` RPC | 0027 → 0028 → 0030 (attach-to-session) | **0030** |
| `complete_staff_return(...)` RPC | 0028 → 0029 (reconcile renter reports) | **0029** |
| return-submission session trigger (`set_return_submission_session`) | 0024 → 0027 → 0028 | **0028** |
| `assets_public_select` policy | 0001 → 0009 (adds `archived_at is null`) | **0009** |

---

## Ledger (0001–0031)

Legend — Contains: RLS = policy, RPC = function, TRG = trigger, G/R = grant/revoke, IDX = index. Remote status for
every row is **Confirmed applied (operator-verified, Phase A2)** — see the header for the evidence; omitted per-row to
keep the table scannable.

| # | Filename | Purpose | Depends on | Additive? | Contains | Code that assumes it | Safe verify query |
|---|---|---|---|---|---|---|---|
| 0001 | `0001_init.sql` | Core schema (organizations, profiles, assets, qr_links, equipment_pages, documents, form_submissions, scan_events, activity_log) + RLS on every table + anon column grants + `current_org_id`/`is_platform_owner`/`set_updated_at` helpers | pgcrypto, `auth.users` | Additive | RLS,RPC,TRG,G/R,IDX | everything (`lib/supabase/*`, all guards) | `select count(*) from pg_policies where schemaname='public';` |
| 0002 | `0002_storage.sql` | Buckets `public-assets` (public) + `submissions` (private) with org-path RLS | 0001 | Additive | RLS,G/R | `lib/assets/cover.ts`, `lib/forms/media.ts` | `select id,public from storage.buckets where id in ('public-assets','submissions');` |
| 0003 | `0003_seed.sql` | Seed Northridge Rentals + 4 demo assets (idempotent) | 0001 | Additive (data) | — | demo/local only | `select count(*) from public.assets where organization_id='11111111-1111-4111-8111-111111111111';` |
| 0004 | `0004_align_demo_seed.sql` | Rename demo rows to canonical codes (UPDATE-only) | 0003 | Altering (data) | — | demo/local only | `select short_code from public.qr_links where short_code='demo-tr014';` |
| 0005 | `0005_documents_storage.sql` | Private `documents` bucket + org RLS | 0002 | Additive | RLS | `lib/documents/*` | `select id,public from storage.buckets where id='documents';` |
| 0006 | `0006_documents_public_read.sql` | Anon SELECT on `storage.objects` for public docs of public assets | 0005 | Additive | RLS | `lib/public/documents.ts` (signed URLs) | `select policyname from pg_policies where tablename='objects' and policyname='documents public read';` |
| 0007 | `0007_demo_cover_images.sql` | Point demo assets at bundled cover SVGs (UPDATE-only) | 0003/0004 | Altering (data) | — | demo/local only | `select cover_image_url from public.assets where asset_code='GEN-008';` |
| 0008 | `0008_equipment_page_templates.sql` | `equipment_page_templates` table (org custom page templates) + RLS | 0001 | Additive | RLS,TRG,IDX | `lib/onboarding/*`, templates pages | `select count(*) from public.equipment_page_templates;` |
| 0009 | `0009_assets_archive.sql` | `assets.archived_at`; recreate `assets_public_select` to require `archived_at is null` | 0001 | Altering (drops+recreates policy) | RLS,IDX | `lib/assets/*` (archive/list), public resolver | `select archived_at from public.assets limit 1;` |
| 0010 | `0010_tag_requests.sql` | `tag_requests` + `tag_request_assets`; UPDATE restricted to owner | 0001 | Additive | RLS,TRG,G/R,IDX | `lib/tags/*`, tag-request routes | `select count(*) from public.tag_requests;` |
| 0011 | `0011_tag_request_viewed.sql` | `platform_viewed_at` / `platform_viewed_by_profile_id` + partial index | 0010 | Additive | IDX | owner tag-request viewed badge | `select platform_viewed_at from public.tag_requests limit 1;` |
| 0012 | `0012_notification_settings.sql` | Per-org notification email columns (not anon-granted) | 0001 | Additive | — | `lib/notifications/*`, settings form | `select notification_email from public.organizations limit 1;` |
| 0013 | `0013_asset_acknowledgements.sql` | `asset_acknowledgements` (public insert-only) | 0001 | Additive | RLS,G/R,IDX | `lib/acknowledgements/*`, ack prompt | `select count(*) from public.asset_acknowledgements;` |
| 0014 | `0014_asset_rental_sessions.sql` | `asset_rental_sessions` + `assets.active_rental_session_id` (anon reads that col) + ack link | 0013,0001 | Additive | RLS,TRG,G/R,IDX | `lib/rentals/*`, staff workflow, evidence | `select active_rental_session_id from public.assets limit 1;` |
| 0015 | `0015_export_settings.sql` | Per-org export flags + `protect_export_flags` (owner-only writes) | 0001 | Additive | RPC,TRG | `lib/export/*`, `canCustomerUseExport` | `select customer_exports_enabled from public.organizations limit 1;` |
| 0016 | `0016_plan_fields.sql` | Plan/commercial cols; `protect_commercial_fields` (supersedes 0015 fn); `enforce_qr_coverage_limit` on qr_links | 0015,0009 | Additive cols; drops 0015 fn/trigger | RPC,TRG | `lib/plans/*`, `lib/qr/actions.ts`, `lib/tags/actions.ts` | `select plan_key from public.organizations limit 1;` |
| 0017 | `0017_profile_status.sql` | `profiles.status` (active/invited/disabled) | 0001 | Additive | — | `lib/auth/session.ts`, invitations | `select status from public.profiles limit 1;` |
| 0018 | `0018_disabled_access.sql` | Make helpers deny disabled profiles | 0017 | Altering (REPLACE 2 fns) | RPC | `getProfile`/all guards | `select current_org_id();` (executes) |
| 0019 | `0019_org_suspension.sql` | `current_org_id()` also requires org `status='active'`; `protect_commercial_fields` coerces `status` | 0016,0017,0018 | Altering (REPLACE 2 fns) | RPC | `requireActiveOrg`, `/suspended` | suspend a test org → its customer `select current_org_id()` = NULL |
| 0020 | `0020_analytics_aggregation.sql` | 4 read-only analytics RPCs (SECURITY INVOKER, yard-local day) + 2 indexes; execute revoked from public | 0001,0009,0018 | Additive | RPC,G/R,IDX | `lib/analytics/rpc.ts`, analytics page | `select * from public.analytics_daily_activity(7);` as authenticated |
| 0021 | `0021_analytics_rpc_fixes.sql` | Fix ambiguous col; revoke execute from **anon** on all 4 RPCs | 0020 | Altering (REPLACE + re-grant) | RPC,G/R | analytics page | `select has_function_privilege('anon','public.analytics_daily_activity(integer)','execute');` → false |
| 0022 | `0022_mark_return_and_resolve.sql` | `mark_return_and_resolve(uuid)` atomic return-close + resolve | 0014,0001 | Additive | RPC,G/R | `MarkReturnedResolveButton`, `lib/submissions/actions.ts` | `select public.mark_return_and_resolve('00000000-0000-0000-0000-000000000000');` → `not_found` |
| 0023 | `0023_qr_short_code_rotation.sql` | QR governance: `is_production_primary`/`supersedes_qr_link_id`, partial unique idx, governance triggers, `set_qr_production_primary` RPC | 0001,0016 | Additive cols + backfill + triggers | RPC,TRG,G/R,IDX | `lib/qr/*`, production-primary selection | `select is_production_primary from public.qr_links limit 1;` |
| 0024 | `0024_return_inspection_v2.sql` | `assets.return_inspection_template_key` (anon read) + submission provenance cols; `set_return_submission_session` trigger | 0014,0001 | Additive | RPC,TRG,G/R,IDX | guided return checklists, `lib/inspections/*` | `select return_inspection_template_key from public.assets limit 1;` |
| 0025 | `0025_inspection_category_defaults.sql` | `inspection_category_defaults` (org category→template; no anon) | 0001 | Additive | RLS,TRG,G/R,IDX | category-default resolver, import | `select count(*) from public.inspection_category_defaults;` |
| 0026 | `0026_inspection_templates.sql` | Versioned `inspection_templates` + immutability trigger; `assets.return_inspection_template_id` (anon read) + org-match triggers; `get_asset_return_template` DEFINER RPC (anon grant) | 0025,0024,0001 | Additive | RLS,RPC,TRG,G/R,IDX | org templates, return-inspections pages | `select * from public.get_asset_return_template('<public asset id>');` |
| 0027 | `0027_outbound_scan.sql` | Extend session trigger to `pre_use_inspection`; `start_outbound_rental(...)` outbound RPC | 0024,0014 | Altering (REPLACE trigger) + RPC | RPC,TRG,G/R | staff outbound, `lib/inspections/outbound-*` | `select public.start_outbound_rental(...)` bogus asset → `not_found` |
| 0028 | `0028_staff_return.sql` | `submission_origin`/`submitted_by_profile_id`; stamping trigger; redefine `start_outbound_rental`; `complete_staff_return` RPC; 2 partial unique idx; backfill | 0027,0024,0001 | Altering (cols + REPLACE + data) | RPC,TRG,G/R,IDX | staff return, origin labels, inbox/timeline | `select submission_origin from public.form_submissions limit 1;` |
| 0029 | `0029_reconcile_staff_return.sql` | Redefine `complete_staff_return` to reconcile same-session renter reports | 0028 | Altering (REPLACE) | RPC,G/R | staff completion reconciliation | `select proname from pg_proc where proname='complete_staff_return';` |
| 0030 | `0030_outbound_attach_session.sql` | Redefine `start_outbound_rental` to attach to an existing active session; 1 partial unique idx | 0028,0027 | Altering (REPLACE) + IDX | RPC,G/R,IDX | outbound attach-to-session UI | call `start_outbound_rental` on a rented asset → `attached_to_existing_session`/`baseline_already_exists` |
| 0031 | `0031_history_indexes.sql` | 6 composite/covering indexes for timeline + rentals pagination | 0014,0001,0013,0010 | Additive | IDX | `getAssetTimelinePage`, `getRentalSessionsPage` | `select indexname from pg_indexes where indexname='form_submissions_asset_created_idx';` |
| 0032 | `0032_role_write_enforcement.sql` | **Phase A3.1** — `current_profile_role()` + `is_current_org_admin()` helpers; `protect_profile_privileged_fields` trigger (closes self-escalation of `profiles.role`); role-aware WRITE policies on organizations/tag requests/templates/category defaults; anon DML revokes | 0001,0008,0010,0018,0019,0025,0026 | Additive (adds fns/trigger; drops+recreates only the write policies it supersedes) | RLS,RPC,TRG,G/R | admin-only server actions (`requireCustomerAdmin`), all admin config UI | `select proname from pg_proc where proname in ('current_profile_role','is_current_org_admin');` → 2 rows; `select tgname from pg_trigger where tgname='profiles_protect_privileged_fields';` |

---

## Notes for A2 (deployment)

- The application code on `pilot-credibility` assumes **all** of 0001–0031 (including the authoritative supersession
  endpoints 0019 / 0030 / 0029 / 0028 / 0009). If any are unapplied on the target project, the corresponding flows
  fail at runtime (staff outbound/return, org templates, guided inspections, outbound-attach, reconciliation, and the
  additive history indexes that keep the timeline/rentals queries bounded).
- Do **not** edit already-authored migration files. To change an applied object, add a new forward migration.
- Remote application status is **confirmed applied (operator-verified, Phase A2)** — see the header. Re-run the
  read-only commands only after a new migration is added; never claim applied without a fresh readout.
