-- 0009_assets_archive.sql — Asset archive (retire) lifecycle.
--
-- WHY: a real rental yard retires equipment. `archived_at` lets the admin hide
-- retired assets from the working list without deleting any history (qr_links,
-- scan_events, form_submissions, documents, equipment_pages are preserved).
--
-- Archived assets must NOT be publicly reachable: the anon select policy is
-- recreated to require `archived_at is null`, so an archived asset's row stops
-- being anon-visible and its public /t/{short_code} page resolves to the
-- "unavailable" notice — no application change needed.
--
-- SAFETY: additive + idempotent (add column if not exists; drop/recreate policy).
-- APPLY: `supabase db push`.

alter table public.assets
  add column if not exists archived_at timestamptz;

create index if not exists assets_archived_at_idx
  on public.assets (archived_at);

-- Public (anon) may read only PUBLIC, NON-ARCHIVED assets' public-safe columns.
drop policy if exists assets_public_select on public.assets;
create policy assets_public_select on public.assets for select to anon
  using (public_status = 'public' and archived_at is null);
