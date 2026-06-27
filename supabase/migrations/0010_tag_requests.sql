-- 0010_tag_requests.sql — Customer tag requests + platform production queue.
--
-- WHY: customers request physical QR tags for selected assets; AssetTag QR (the
-- platform owner) manages those requests through a production queue. Customers
-- create + view their own org's requests; only the platform owner updates status
-- and internal production notes. AssetTag QR keeps all production outputs.
--
-- APPLY: `supabase db push`.

-- tag_requests --------------------------------------------------------------
create table public.tag_requests (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  requested_by_profile_id  uuid references public.profiles(id) on delete set null,
  status                   text not null default 'requested'
    check (status in ('requested', 'in_review', 'in_production', 'ready', 'delivered', 'cancelled')),
  material                 text,
  mounting_method          text,
  tag_size                 text,
  quantity_notes           text,
  production_notes         text, -- INTERNAL: platform-owner only
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  delivered_at             timestamptz,
  completed_at             timestamptz
);
alter table public.tag_requests enable row level security;
create index tag_requests_organization_id_idx on public.tag_requests (organization_id);
create trigger tag_requests_set_updated_at
  before update on public.tag_requests
  for each row execute function public.set_updated_at();

-- tag_request_assets --------------------------------------------------------
create table public.tag_request_assets (
  id              uuid primary key default gen_random_uuid(),
  tag_request_id  uuid not null references public.tag_requests(id) on delete cascade,
  asset_id        uuid not null references public.assets(id) on delete cascade,
  quantity        int not null default 1,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (tag_request_id, asset_id)
);
alter table public.tag_request_assets enable row level security;
create index tag_request_assets_request_idx on public.tag_request_assets (tag_request_id);

-- Privileges (RLS scopes the rows).
grant select, insert, update, delete on public.tag_requests to authenticated;
grant select, insert, update, delete on public.tag_request_assets to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- tag_requests: members read/create their org's requests; the platform owner
-- reads all and is the ONLY role that can update (status + production_notes).
create policy tag_requests_select on public.tag_requests for select to authenticated
  using (is_platform_owner() or organization_id = current_org_id());
create policy tag_requests_insert on public.tag_requests for insert to authenticated
  with check (is_platform_owner() or organization_id = current_org_id());
create policy tag_requests_update on public.tag_requests for update to authenticated
  using (is_platform_owner())
  with check (is_platform_owner());
create policy tag_requests_delete on public.tag_requests for delete to authenticated
  using (is_platform_owner());

-- tag_request_assets: scoped through the parent request's organization.
create policy tag_request_assets_select on public.tag_request_assets for select to authenticated
  using (
    is_platform_owner()
    or exists (
      select 1 from public.tag_requests r
      where r.id = tag_request_assets.tag_request_id
        and r.organization_id = current_org_id()
    )
  );
create policy tag_request_assets_insert on public.tag_request_assets for insert to authenticated
  with check (
    is_platform_owner()
    or exists (
      select 1 from public.tag_requests r
      where r.id = tag_request_assets.tag_request_id
        and r.organization_id = current_org_id()
    )
  );
create policy tag_request_assets_delete on public.tag_request_assets for delete to authenticated
  using (is_platform_owner());
