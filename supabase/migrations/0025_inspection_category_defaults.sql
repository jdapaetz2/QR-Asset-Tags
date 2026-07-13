-- 0025_inspection_category_defaults.sql — Return Inspection V2 (Phase 1B) organization category defaults.
--
-- WHY: Phase 1A stores an explicit return_inspection_template_key on every asset and resolves a template
-- from that stored key. Phase 1B lets a customer organization map its OWN exact category values to a
-- default system return-inspection template, so asset creation / CSV import / a deliberate bulk-apply can
-- pick the right template automatically. The final resolved key is still written onto each asset — this
-- table is an ADMIN-TIME convenience only.
--
-- ARCHITECTURE RULE: the public return route must never read this table. It resolves purely from the
-- asset's stored key (assets always get one at create/import time), so this table has NO anon grant.
--
-- Scope of "matching": exact, normalized (trim + lowercase + collapse repeated whitespace, computed
-- app-side in lib/assets/categories.ts#normalizeCategoryKey). No fuzzy matching, no category renaming.
--
-- return_template_key is validated app-side against the in-code system registry (lib/inspections/
-- templates.ts). Deliberately NO CHECK constraint listing keys, so adding a system template never needs
-- a schema migration (same rationale as assets.return_inspection_template_key in 0024).

create table public.inspection_category_defaults (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  category_value            text not null,               -- display spelling as entered
  normalized_category_value text not null,               -- trim + lowercase + collapse whitespace (app-side)
  return_template_key       text not null,               -- system template key (app-validated; no CHECK)
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- One default per normalized category within an organization.
  unique (organization_id, normalized_category_value)
);

alter table public.inspection_category_defaults enable row level security;

create index inspection_category_defaults_organization_id_idx
  on public.inspection_category_defaults (organization_id);

create trigger inspection_category_defaults_set_updated_at
  before update on public.inspection_category_defaults
  for each row execute function public.set_updated_at();

-- Own-organization only (platform owner may manage any). No anon: this table is never read publicly.
grant select, insert, update, delete on public.inspection_category_defaults to authenticated;

create policy inspection_category_defaults_rw
  on public.inspection_category_defaults for all to authenticated
  using (is_platform_owner() or organization_id = current_org_id())
  with check (is_platform_owner() or organization_id = current_org_id());
