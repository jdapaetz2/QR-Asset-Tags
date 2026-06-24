-- 0013_asset_acknowledgements.sql — Lightweight public acknowledgements.
--
-- WHY: the public QR page offers an OPTIONAL acknowledgement that the renter has
-- access to the rental company's instructions, safety notes, and support contact.
-- This is NOT an e-signature or a contract — just a lightweight, timestamped record.
--
-- Modeled on form_submissions (0001_init.sql): the public/anon role may INSERT only,
-- and only against a public asset whose org matches; it can never read/list. Members
-- and the platform owner read their own org's records. organization_id, asset_id and
-- the statement text are all derived server-side, never from client input. No raw IP.
--
-- APPLY: `supabase db push`.

create table public.asset_acknowledgements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  asset_id         uuid not null references public.assets(id) on delete cascade,
  name             text not null,
  email            text,
  phone            text,
  statement        text not null,
  acknowledged_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
alter table public.asset_acknowledgements enable row level security;
create index asset_acknowledgements_asset_id_idx
  on public.asset_acknowledgements (asset_id);

-- Privileges: authenticated is RLS-scoped; anon is INSERT-only (no select/list).
grant select, insert, update, delete on public.asset_acknowledgements to authenticated;
grant insert on public.asset_acknowledgements to anon;

-- Policies -------------------------------------------------------------------
-- Members/owner manage their org's records; public may INSERT only, and only
-- against a public asset whose org matches (server also derives org).
create policy asset_acknowledgements_rw on public.asset_acknowledgements for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy asset_acknowledgements_public_insert on public.asset_acknowledgements for insert to anon
  with check (
    exists (
      select 1 from public.assets a
      where a.id = asset_acknowledgements.asset_id
        and a.organization_id = asset_acknowledgements.organization_id
        and a.public_status = 'public'
    )
  );
