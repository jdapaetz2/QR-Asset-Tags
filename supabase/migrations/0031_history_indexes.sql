-- 0031_history_indexes.sql — Composite indexes for the bounded timeline + rental-session browser.
--
-- WHY (Phase 3C.8): the asset timeline and the new /dashboard/rentals browser page each source with cursor
-- pagination — `ORDER BY <ts> DESC, id DESC LIMIT n` under a keyset bound. The existing single-column
-- (asset_id) / (organization_id) indexes don't cover that ordering, so at scale the planner would sort large
-- result sets. These composite `(scope, <ts> DESC, id DESC)` indexes let each paginated query walk the index
-- newest-first and stop after the page limit. Exact RNT/SUB reference search needs NO index here — it is a
-- PRIMARY-KEY uuid range (`id BETWEEN …`) and uses the existing pk btree.
--
-- Additive only: no table, column, RLS, or policy change. Existing single-column indexes are left in place.
-- Ships UNAPPLIED — APPLY: `npx.cmd supabase db push`.

-- Rental sessions: org browser (started_at desc) + asset-scoped timeline (started_at / returned_at desc).
create index if not exists asset_rental_sessions_org_started_idx
  on public.asset_rental_sessions (organization_id, started_at desc, id desc);

create index if not exists asset_rental_sessions_asset_started_idx
  on public.asset_rental_sessions (asset_id, started_at desc, id desc);

create index if not exists asset_rental_sessions_asset_returned_idx
  on public.asset_rental_sessions (asset_id, returned_at desc, id desc)
  where returned_at is not null;

-- Submissions: asset-scoped timeline (created_at desc).
create index if not exists form_submissions_asset_created_idx
  on public.form_submissions (asset_id, created_at desc, id desc);

-- Acknowledgements: asset-scoped timeline (created_at desc) — only (asset_id) existed before.
create index if not exists asset_acknowledgements_asset_created_idx
  on public.asset_acknowledgements (asset_id, created_at desc, id desc);

-- Tag-request links: the asset-scoped timeline filters this join table by asset_id, previously unindexed.
create index if not exists tag_request_assets_asset_idx
  on public.tag_request_assets (asset_id);
