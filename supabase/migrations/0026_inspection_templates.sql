-- 0026_inspection_templates.sql — Return Inspection V2 (Phase 2) versioned organization templates.
--
-- WHY: Phase 1 resolves every asset's return inspection from a code-owned system template. Phase 2 lets a
-- customer organization COPY a curated system template and customize it within strict boundaries: a
-- constrained, versioned, server-validated editor — NOT a form builder. System templates stay in
-- TypeScript (read-only); organization templates live here. A version is a row; all versions of one
-- template share a stable family_key. Published/retired versions are IMMUTABLE (enforced by a trigger),
-- editing a published version creates a NEW draft version, and every submission still stores an immutable
-- template snapshot (schema_version=2), so historical rows never change.
--
-- ARCHITECTURE RULE: the public inspection reads only the ONE published template assigned to a public
-- asset, and only via the SECURITY DEFINER function get_asset_return_template(). There is NO anon grant on
-- inspection_templates — anon can never list templates, read drafts, or see another organization's rows.
--
-- definition_json is an InspectionTemplate (lib/inspections/types.ts), validated app-side
-- (lib/inspections/org-templates.ts) on every draft save + publish. Deliberately no JSON CHECK.
--
-- APPLY: npx.cmd supabase db push.

-- ---------------------------------------------------------------------------
-- Organization templates (versioned).
-- ---------------------------------------------------------------------------
create table public.inspection_templates (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations(id) on delete cascade,
  inspection_type            text not null default 'return',   -- future-safe (only 'return' today)
  family_key                 text not null,                    -- stable lineage; every version shares it
  version                    int  not null,                    -- monotonic per (organization_id, family_key)
  status                     text not null default 'draft'
                               check (status in ('draft', 'published', 'retired')),
  name                       text not null,
  description                text,
  source_system_template_key text not null,                    -- the system template it was copied from
  definition_json            jsonb not null,                   -- an InspectionTemplate (app-validated)
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  published_at               timestamptz,
  unique (organization_id, family_key, version)
);

-- At most one editable draft per family (editing a published version creates the single next draft).
create unique index inspection_templates_one_draft
  on public.inspection_templates (organization_id, family_key)
  where status = 'draft';
create index inspection_templates_org_idx on public.inspection_templates (organization_id);

alter table public.inspection_templates enable row level security;

create trigger inspection_templates_set_updated_at
  before update on public.inspection_templates
  for each row execute function public.set_updated_at();

-- Own-organization only (platform owner manages any). NO anon grant: never read publicly via the table.
grant select, insert, update, delete on public.inspection_templates to authenticated;

create policy inspection_templates_rw
  on public.inspection_templates for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());

-- Lifecycle immutability (tenancy stays in RLS; this trigger enforces the state machine — mirrors the
-- protect_* triggers in 0015/0016). A published version may only transition to 'retired' with its content
-- unchanged; a retired version is fully immutable; a draft is freely editable. New versions are INSERTs
-- (a BEFORE UPDATE trigger never fires for them).
create or replace function public.enforce_inspection_template_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'retired' then
    raise exception 'retired inspection templates are immutable';
  elsif old.status = 'published' then
    if new.status = 'published' then
      if new.definition_json is distinct from old.definition_json
         or new.name is distinct from old.name
         or new.description is distinct from old.description
         or new.version <> old.version
         or new.family_key <> old.family_key
         or new.source_system_template_key <> old.source_system_template_key then
        raise exception 'published inspection templates are immutable; create a new version to edit';
      end if;
    elsif new.status = 'retired' then
      if new.definition_json is distinct from old.definition_json
         or new.version <> old.version
         or new.family_key <> old.family_key then
        raise exception 'cannot modify a published template while retiring it';
      end if;
    else
      raise exception 'a published inspection template can only be retired';
    end if;
  end if;
  return new;
end;
$$;

create trigger inspection_templates_enforce_lifecycle
  before update on public.inspection_templates
  for each row execute function public.enforce_inspection_template_lifecycle();

-- ---------------------------------------------------------------------------
-- Asset assignment to a specific (published) organization template version.
-- ---------------------------------------------------------------------------
alter table public.assets
  add column if not exists return_inspection_template_id uuid
    references public.inspection_templates(id) on delete set null;
-- Anon may read the opaque pointer (needed to resolve the public inspection); it is non-sensitive.
grant select (return_inspection_template_id) on public.assets to anon;

-- Defense in depth: an asset may only reference a template in its OWN organization, even if the app layer
-- is bypassed. SECURITY DEFINER so it can read inspection_templates regardless of the caller's RLS.
create or replace function public.enforce_asset_template_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.return_inspection_template_id is not null then
    if not exists (
      select 1 from public.inspection_templates t
      where t.id = new.return_inspection_template_id
        and t.organization_id = new.organization_id
    ) then
      raise exception 'return_inspection_template_id must reference a template in the same organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger assets_enforce_template_org
  before insert or update on public.assets
  for each row execute function public.enforce_asset_template_org();

-- ---------------------------------------------------------------------------
-- Category default may target a custom (published) template (future-safe; asset-create + apply use it).
-- ---------------------------------------------------------------------------
alter table public.inspection_category_defaults
  add column if not exists return_template_id uuid
    references public.inspection_templates(id) on delete set null;

create or replace function public.enforce_category_default_template_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.return_template_id is not null then
    if not exists (
      select 1 from public.inspection_templates t
      where t.id = new.return_template_id
        and t.organization_id = new.organization_id
    ) then
      raise exception 'return_template_id must reference a template in the same organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger inspection_category_defaults_enforce_template_org
  before insert or update on public.inspection_category_defaults
  for each row execute function public.enforce_category_default_template_org();

-- ---------------------------------------------------------------------------
-- Public read: the ONE published template assigned to a PUBLIC asset. No draft, no list, no other org.
-- SECURITY DEFINER (bypasses RLS) but returns only a published definition for the given public asset.
-- ---------------------------------------------------------------------------
create or replace function public.get_asset_return_template(p_asset_id uuid)
returns table (
  template_id uuid,
  family_key  text,
  version     int,
  name        text,
  definition  jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.family_key, t.version, t.name, t.definition_json
  from public.assets a
  join public.inspection_templates t
    on t.id = a.return_inspection_template_id
   and t.organization_id = a.organization_id
   and t.status = 'published'
  where a.id = p_asset_id
    and a.public_status = 'public';
$$;

revoke execute on function public.get_asset_return_template(uuid) from public;
grant execute on function public.get_asset_return_template(uuid) to anon, authenticated;
