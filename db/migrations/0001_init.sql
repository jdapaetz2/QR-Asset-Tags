-- 0001_init.sql — AssetTag QR core schema + row-level security.
--
-- Target: Postgres on Supabase. RLS is ENABLED on every tenant-scoped table in
-- the same migration that creates it (per docs/CODE_HANDOFF.md). Policies resolve
-- the caller's organization/role from their `profiles` row via SECURITY DEFINER
-- helper functions (so policies never recurse through `profiles` RLS).
--
-- See docs/DATA_MODEL.md and docs/SECURITY_MODEL.md.

-- ---------------------------------------------------------------------------
-- Extensions & shared functions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- Keep updated_at fresh on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Resolve the caller's organization. SECURITY DEFINER so it bypasses RLS on
-- `profiles` and cannot cause recursive policy evaluation.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where auth_user_id = auth.uid();
$$;

-- True when the caller is a platform owner (cross-org access).
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role = 'platform_owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables (+ RLS enabled + updated_at triggers)
-- ---------------------------------------------------------------------------

-- organizations -------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  logo_url         text,
  primary_color    text,
  support_phone    text,
  support_email    text,
  website_url      text,
  powered_by_label text,
  status           text not null default 'active' check (status in ('active', 'suspended')),
  -- Manual billing fields (informational in MVP; Stripe later). Never public.
  plan_name        text,
  monthly_fee      numeric,
  asset_limit      int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.organizations enable row level security;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- profiles ------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade, -- null for platform_owner
  name            text,
  email           text,
  role            text not null check (role in ('platform_owner', 'customer_admin', 'customer_staff')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;
create index profiles_organization_id_idx on public.profiles (organization_id);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- assets --------------------------------------------------------------------
create table public.assets (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  asset_code             text not null,
  asset_name             text not null,
  category               text,
  make                   text,
  model                  text,
  serial_number          text,
  year                   int,
  public_status          text not null default 'private' check (public_status in ('public', 'private')),
  cover_image_url        text,
  support_phone_override text,
  support_email_override text,
  internal_notes         text, -- PRIVATE: never exposed to the public/anon role
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, asset_code)
);
alter table public.assets enable row level security;
create index assets_organization_id_idx on public.assets (organization_id);
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- qr_links ------------------------------------------------------------------
create table public.qr_links (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  asset_id         uuid not null references public.assets(id) on delete cascade,
  short_code       text not null unique,
  public_url       text not null,
  status           text not null default 'active' check (status in ('active', 'disabled')),
  last_scanned_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.qr_links enable row level security;
create index qr_links_organization_id_idx on public.qr_links (organization_id);
create index qr_links_asset_id_idx on public.qr_links (asset_id);
create trigger qr_links_set_updated_at
  before update on public.qr_links
  for each row execute function public.set_updated_at();

-- equipment_pages (1:1 with asset; carries organization_id for RLS) ----------
create table public.equipment_pages (
  id                   uuid primary key default gen_random_uuid(),
  asset_id             uuid not null unique references public.assets(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  headline             text,
  quick_start_text     text,
  safety_notes         text,
  fuel_power_notes     text,
  return_notes         text,
  troubleshooting_notes text,
  emergency_notes      text,
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.equipment_pages enable row level security;
create index equipment_pages_organization_id_idx on public.equipment_pages (organization_id);
create trigger equipment_pages_set_updated_at
  before update on public.equipment_pages
  for each row execute function public.set_updated_at();

-- documents -----------------------------------------------------------------
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id        uuid not null references public.assets(id) on delete cascade,
  title           text not null,
  document_type   text not null check (document_type in ('manual', 'startup_guide', 'safety_sheet', 'video', 'return_checklist', 'other')),
  url             text,         -- external link (null if hosted)
  storage_path    text,         -- storage object path (null if external)
  visibility      text not null default 'private' check (visibility in ('public', 'private')),
  link_status     text not null default 'unknown' check (link_status in ('unknown', 'ok', 'broken', 'needs_review')),
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.documents enable row level security;
create index documents_organization_id_idx on public.documents (organization_id);
create index documents_asset_id_idx on public.documents (asset_id);
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- form_submissions (public insert-only; never publicly readable) -------------
create table public.form_submissions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  asset_id            uuid not null references public.assets(id) on delete cascade,
  form_type           text not null check (form_type in ('damage_report', 'support_request', 'return_checklist', 'pre_use_inspection')),
  submitted_by_name   text,
  submitted_by_email  text,
  submitted_by_phone  text,
  submission_data_json jsonb not null default '{}'::jsonb,
  media_urls          jsonb not null default '[]'::jsonb,
  status              text not null default 'new' check (status in ('new', 'reviewed', 'resolved', 'archived')),
  created_at          timestamptz not null default now()
);
alter table public.form_submissions enable row level security;
create index form_submissions_organization_id_idx on public.form_submissions (organization_id);
create index form_submissions_asset_id_idx on public.form_submissions (asset_id);

-- scan_events (public insert-only; hashed/truncated IP only) -----------------
create table public.scan_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id        uuid not null references public.assets(id) on delete cascade,
  qr_link_id      uuid not null references public.qr_links(id) on delete cascade,
  scanned_at      timestamptz not null default now(),
  user_agent      text,
  ip_hash         text, -- HASHED or TRUNCATED only — never a raw IP
  referrer        text,
  device_type     text
);
alter table public.scan_events enable row level security;
create index scan_events_organization_id_idx on public.scan_events (organization_id);
create index scan_events_qr_link_id_idx on public.scan_events (qr_link_id);

-- activity_log --------------------------------------------------------------
create table public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id   uuid references public.profiles(id) on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  metadata_json   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index activity_log_organization_id_idx on public.activity_log (organization_id);

-- ---------------------------------------------------------------------------
-- Privileges
--   * authenticated: full DML on all tables; RLS policies scope the rows.
--   * anon (public scanner): narrowly granted, column-restricted where needed.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Public read of branding columns only — never billing fields.
revoke select on public.organizations from anon;
grant select (
  id, name, slug, logo_url, primary_color,
  support_phone, support_email, website_url, powered_by_label, status
) on public.organizations to anon;

-- Public read of public-safe asset columns only — never internal_notes.
revoke select on public.assets from anon;
grant select (
  id, organization_id, asset_code, asset_name, category, make, model,
  serial_number, year, public_status, cover_image_url,
  support_phone_override, support_email_override, created_at, updated_at
) on public.assets to anon;

-- Public read of published page content and public documents/QR routing.
grant select on public.equipment_pages to anon;
grant select on public.documents to anon;
grant select on public.qr_links to anon;

-- Public is insert-only on submissions and scan events.
grant insert on public.form_submissions to anon;
grant insert on public.scan_events to anon;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- profiles: self-access + org admins see their org + owner sees all.
create policy profiles_select on public.profiles for select to authenticated
  using (auth_user_id = auth.uid() or is_platform_owner() or organization_id = current_org_id());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (is_platform_owner());
create policy profiles_update on public.profiles for update to authenticated
  using (auth_user_id = auth.uid() or is_platform_owner())
  with check (auth_user_id = auth.uid() or is_platform_owner());
create policy profiles_delete on public.profiles for delete to authenticated
  using (is_platform_owner());

-- organizations: members read/update their own org; owner manages all.
create policy organizations_select on public.organizations for select to authenticated
  using (is_platform_owner() or id = current_org_id());
create policy organizations_insert on public.organizations for insert to authenticated
  with check (is_platform_owner());
create policy organizations_update on public.organizations for update to authenticated
  using (is_platform_owner() or id = current_org_id())
  with check (is_platform_owner() or id = current_org_id());
create policy organizations_delete on public.organizations for delete to authenticated
  using (is_platform_owner());
-- Public can read active organizations' branding columns (column grant above).
create policy organizations_public_select on public.organizations for select to anon
  using (status = 'active');

-- assets: org-scoped for members/owner; public reads public assets only.
create policy assets_rw on public.assets for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy assets_public_select on public.assets for select to anon
  using (public_status = 'public');

-- qr_links: org-scoped for members/owner; public reads active links.
create policy qr_links_rw on public.qr_links for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy qr_links_public_select on public.qr_links for select to anon
  using (status = 'active');

-- equipment_pages: org-scoped; public reads published pages of public assets.
create policy equipment_pages_rw on public.equipment_pages for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy equipment_pages_public_select on public.equipment_pages for select to anon
  using (
    is_published = true
    and exists (
      select 1 from public.assets a
      where a.id = equipment_pages.asset_id and a.public_status = 'public'
    )
  );

-- documents: org-scoped; public reads public docs of public assets.
create policy documents_rw on public.documents for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy documents_public_select on public.documents for select to anon
  using (
    visibility = 'public'
    and exists (
      select 1 from public.assets a
      where a.id = documents.asset_id and a.public_status = 'public'
    )
  );

-- form_submissions: members/owner manage their org's; public may INSERT only,
-- and only against a public asset whose org matches (server also derives org).
create policy form_submissions_rw on public.form_submissions for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy form_submissions_public_insert on public.form_submissions for insert to anon
  with check (
    exists (
      select 1 from public.assets a
      where a.id = form_submissions.asset_id
        and a.organization_id = form_submissions.organization_id
        and a.public_status = 'public'
    )
  );

-- scan_events: members/owner read their org's; public may INSERT only against a
-- matching active QR link.
create policy scan_events_rw on public.scan_events for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
create policy scan_events_public_insert on public.scan_events for insert to anon
  with check (
    exists (
      select 1 from public.qr_links q
      where q.id = scan_events.qr_link_id
        and q.asset_id = scan_events.asset_id
        and q.organization_id = scan_events.organization_id
        and q.status = 'active'
    )
  );

-- activity_log: members/owner within their org; no public access.
create policy activity_log_rw on public.activity_log for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
