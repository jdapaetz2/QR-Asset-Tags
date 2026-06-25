-- 0015_export_settings.sql — Platform-controlled customer data exports.
--
-- WHY: data export is a buyer-trust / offboarding capability, not something every
-- rental yard needs exposed by default. Customer self-serve export access is OFF by
-- default and is enabled per-organization by the AssetTag QR platform owner. The
-- platform owner can always export an org's data for support/offboarding regardless
-- of these flags.
--
-- These flags live on organizations. They are NOT added to the anon column-grant, so
-- the public never sees them. A customer admin may read their own org row, and the
-- organizations_update policy permits a customer to update their own row — so a
-- trigger (below) prevents anyone but the platform owner from changing the export
-- flags, keeping this a platform-controlled capability at the database boundary.
--
-- APPLY: `supabase db push`.

alter table public.organizations
  add column if not exists customer_exports_enabled boolean not null default false,
  add column if not exists export_assets_enabled boolean not null default false,
  add column if not exists export_qr_mapping_enabled boolean not null default false,
  add column if not exists export_documents_enabled boolean not null default false,
  add column if not exists export_submissions_enabled boolean not null default false;

-- Only the platform owner may change export flags. For any other caller, coerce the
-- export* columns back to their previous values (so a customer's legitimate branding
-- update still succeeds, it just can't touch these flags).
create or replace function public.protect_export_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    new.customer_exports_enabled   := old.customer_exports_enabled;
    new.export_assets_enabled      := old.export_assets_enabled;
    new.export_qr_mapping_enabled  := old.export_qr_mapping_enabled;
    new.export_documents_enabled   := old.export_documents_enabled;
    new.export_submissions_enabled := old.export_submissions_enabled;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_export_flags on public.organizations;
create trigger organizations_protect_export_flags
  before update on public.organizations
  for each row execute function public.protect_export_flags();
