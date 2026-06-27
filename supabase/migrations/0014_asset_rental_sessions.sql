-- 0014_asset_rental_sessions.sql — Lightweight rental sessions + ack linkage.
--
-- WHY: support a scan-time acknowledgement prompt that only appears while an asset
-- is actively rented, and let acknowledgements belong to a rental period for the
-- asset history. This is a lightweight OPERATIONAL state — NOT rental booking, a
-- contract, e-signature, payments, or scheduling.
--
-- An asset has at most one active session (enforced by a partial unique index).
-- The sessions table is authenticated + org-scoped only: the PUBLIC can never read
-- or change rental status. To let the public scan page know an asset is currently
-- rented (so it can prompt and link the acknowledgement), we denormalize an opaque
-- pointer onto assets.active_rental_session_id and grant anon read of THAT column
-- only — it carries no renter data (no reference/label).
--
-- APPLY: `supabase db push`.

-- asset_rental_sessions ------------------------------------------------------
create table public.asset_rental_sessions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  asset_id                 uuid not null references public.assets(id) on delete cascade,
  status                   text not null default 'active'
    check (status in ('active', 'returned', 'cancelled')),
  rental_reference         text,
  renter_label             text,
  started_at               timestamptz not null default now(),
  returned_at              timestamptz,
  created_by_profile_id    uuid references public.profiles(id) on delete set null,
  returned_by_profile_id   uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.asset_rental_sessions enable row level security;
create index asset_rental_sessions_asset_id_idx
  on public.asset_rental_sessions (asset_id);
-- At most one active session per asset.
create unique index asset_rental_sessions_one_active_idx
  on public.asset_rental_sessions (asset_id)
  where status = 'active';
create trigger asset_rental_sessions_set_updated_at
  before update on public.asset_rental_sessions
  for each row execute function public.set_updated_at();

-- Authenticated only; RLS scopes the rows. No anon access to this table at all.
grant select, insert, update, delete on public.asset_rental_sessions to authenticated;

create policy asset_rental_sessions_rw on public.asset_rental_sessions for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());

-- Denormalized pointer to the current active session (kept in sync by the admin
-- actions). Anon may read ONLY this opaque uuid so the public page can prompt + the
-- server can link an acknowledgement — it exposes no renter data.
alter table public.assets
  add column if not exists active_rental_session_id uuid
    references public.asset_rental_sessions(id) on delete set null;
grant select (active_rental_session_id) on public.assets to anon;

-- Link acknowledgements to the rental period when one is active (nullable; existing
-- acknowledgements with no session remain valid).
alter table public.asset_acknowledgements
  add column if not exists rental_session_id uuid
    references public.asset_rental_sessions(id) on delete set null;
