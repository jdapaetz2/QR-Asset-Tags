-- 0008_equipment_page_templates.sql — Organization custom equipment-page templates.
--
-- WHY: built-in (system) templates live in app code; this table holds an
-- organization's OWN reusable equipment-page templates so a rental yard can
-- standardize its language and use it during CSV import. The 8 system templates
-- are NOT stored here (no seed drift); `is_system` exists for the data model and
-- the RLS write rule forbids customers from creating system rows.
--
-- Tenancy: customer admins read system + their own org's templates and may write
-- only their own non-system rows; the platform owner manages all (RLS bypass).
--
-- APPLY: `supabase db push`.

create table public.equipment_page_templates (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations(id) on delete cascade, -- null = system
  key                   text not null,
  name                  text not null,
  description           text,
  category              text,
  headline              text,
  quick_start_text      text,
  safety_notes          text,
  fuel_power_notes      text,
  return_notes          text,
  troubleshooting_notes text,
  emergency_notes       text,
  is_system             boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A key is unique within an organization (system rows would share a null org).
  unique (organization_id, key)
);
alter table public.equipment_page_templates enable row level security;
create index equipment_page_templates_organization_id_idx
  on public.equipment_page_templates (organization_id);
create trigger equipment_page_templates_set_updated_at
  before update on public.equipment_page_templates
  for each row execute function public.set_updated_at();

-- Read: system templates (org null / is_system), the caller's own org, or owner.
create policy equipment_page_templates_select
  on public.equipment_page_templates for select to authenticated
  using (
    is_system
    or organization_id = current_org_id()
    or is_platform_owner()
  );

-- Write: only the caller's OWN non-system rows (or the platform owner, any).
-- System rows (is_system = true) are never writable by a customer admin.
create policy equipment_page_templates_insert
  on public.equipment_page_templates for insert to authenticated
  with check (
    is_platform_owner()
    or (organization_id = current_org_id() and is_system = false)
  );
create policy equipment_page_templates_update
  on public.equipment_page_templates for update to authenticated
  using (
    is_platform_owner()
    or (organization_id = current_org_id() and is_system = false)
  )
  with check (
    is_platform_owner()
    or (organization_id = current_org_id() and is_system = false)
  );
create policy equipment_page_templates_delete
  on public.equipment_page_templates for delete to authenticated
  using (
    is_platform_owner()
    or (organization_id = current_org_id() and is_system = false)
  );
