-- 0016_plan_fields.sql — Plan tiers, covered-asset limits, and DB protection.
--
-- WHY: AssetTag QR prices on COVERED ASSETS per yard (scans are unlimited). A covered
-- asset is a non-archived asset that has at least one qr_links row (an assigned durable
-- tag) — disabled links still count; archived assets don't; scan/rental activity is
-- irrelevant. Plan fields are platform-owner-only, so they are DB-protected below.
-- No billing/Stripe — these are commercial metadata + coverage enforcement only.
--
-- APPLY: `supabase db push`.

-- Commercial fields (plan_name / monthly_fee / asset_limit already exist from 0001).
alter table public.organizations
  add column if not exists plan_key text,
  add column if not exists billing_interval text,
  add column if not exists intro_price_cents integer,
  add column if not exists renewal_price_cents integer,
  add column if not exists tag_credit_cents integer,
  add column if not exists storage_limit_mb integer,
  add column if not exists video_uploads_enabled boolean not null default false,
  add column if not exists plan_notes text;

-- ---------------------------------------------------------------------------
-- Protect ALL commercial fields (plan + export) from non-owner writes.
-- Supersedes protect_export_flags: the organizations_update policy lets a customer
-- update their own row, so we coerce commercial columns back to OLD for any caller
-- who is not the platform owner. A customer's branding update still succeeds.
-- ---------------------------------------------------------------------------
create or replace function public.protect_commercial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    -- Export controls (from 0015)
    new.customer_exports_enabled   := old.customer_exports_enabled;
    new.export_assets_enabled      := old.export_assets_enabled;
    new.export_qr_mapping_enabled  := old.export_qr_mapping_enabled;
    new.export_documents_enabled   := old.export_documents_enabled;
    new.export_submissions_enabled := old.export_submissions_enabled;
    -- Plan / commercial fields
    new.plan_name             := old.plan_name;
    new.monthly_fee           := old.monthly_fee;
    new.asset_limit           := old.asset_limit;
    new.plan_key              := old.plan_key;
    new.billing_interval      := old.billing_interval;
    new.intro_price_cents     := old.intro_price_cents;
    new.renewal_price_cents   := old.renewal_price_cents;
    new.tag_credit_cents      := old.tag_credit_cents;
    new.storage_limit_mb      := old.storage_limit_mb;
    new.video_uploads_enabled := old.video_uploads_enabled;
    new.plan_notes            := old.plan_notes;
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_export_flags on public.organizations;
drop trigger if exists organizations_protect_commercial_fields on public.organizations;
create trigger organizations_protect_commercial_fields
  before update on public.organizations
  for each row execute function public.protect_commercial_fields();

drop function if exists public.protect_export_flags();

-- ---------------------------------------------------------------------------
-- Hard coverage guard: block a customer from creating NEW covered coverage past the
-- plan's asset_limit. Fires only on INSERT of the FIRST qr_links row for a
-- non-archived asset, so existing links, scans, and demo data are never affected.
-- Bypassed for the platform owner and when asset_limit is null (unlimited/custom).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_qr_coverage_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_archived timestamptz;
  v_has_link boolean;
  v_covered int;
begin
  if public.is_platform_owner() then
    return new;
  end if;

  select asset_limit into v_limit
    from public.organizations where id = new.organization_id;
  if v_limit is null then
    return new; -- unlimited / custom / unset
  end if;

  -- Asset already covered (has a link) → no new coverage consumed.
  select exists (select 1 from public.qr_links where asset_id = new.asset_id)
    into v_has_link;
  if v_has_link then
    return new;
  end if;

  -- Archived assets never count toward coverage.
  select archived_at into v_archived from public.assets where id = new.asset_id;
  if v_archived is not null then
    return new;
  end if;

  -- Current covered count = non-archived assets with >= 1 qr link.
  select count(*) into v_covered
    from public.assets a
    where a.organization_id = new.organization_id
      and a.archived_at is null
      and exists (select 1 from public.qr_links q where q.asset_id = a.id);

  if v_covered >= v_limit then
    raise exception
      'Covered asset limit reached (% of %). Contact AssetTag QR to add more covered assets.',
      v_covered, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists qr_links_enforce_coverage on public.qr_links;
create trigger qr_links_enforce_coverage
  before insert on public.qr_links
  for each row execute function public.enforce_qr_coverage_limit();
