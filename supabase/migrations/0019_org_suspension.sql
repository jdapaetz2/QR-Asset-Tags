-- 0019_org_suspension.sql — account-level organization suspension (Wave 5E.1).
--
-- The platform owner can suspend/reactivate a whole customer organization. Suspension
-- must (a) revoke tenant data access for that org's customer users even on a stale
-- session, and (b) prevent a customer from reactivating (or suspending) themselves.
-- No data is deleted; `organizations.status` already exists (0001: active|suspended).
--
-- App-level guards (route redirects to /suspended) sit on top of this; the DB layer is
-- the backstop. Public scan pages were already gated: the anon `organizations_public_select`
-- policy requires status='active', so a suspended org's public pages/forms go unavailable.
--
-- Requires: profiles.status (0017), status-aware helpers (0018), commercial trigger (0016).

-- ---------------------------------------------------------------------------
-- current_org_id(): return the caller's org ONLY when the profile is not disabled
-- AND the organization is active. A suspended org yields NULL, so every tenant policy
-- of the form `organization_id = current_org_id()` denies access at once. Platform
-- owners are unaffected — they resolve access through is_platform_owner(), not this.
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.auth_user_id = auth.uid()
    and p.status <> 'disabled'
    and o.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Protect organizations.status from customer writes: only the platform owner may change
-- it. Recreates protect_commercial_fields (0016) with `status` added to the coerced set,
-- so a customer_admin cannot self-reactivate/self-suspend even with a crafted update.
-- (Unchanged: all plan/export fields stay owner-only; a customer branding update still
-- succeeds because those columns are not coerced.)
-- ---------------------------------------------------------------------------
create or replace function public.protect_commercial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    -- Account status (Wave 5E.1) — owner-only
    new.status := old.status;
    -- Export controls (from 0015)
    new.customer_exports_enabled   := old.customer_exports_enabled;
    new.export_assets_enabled      := old.export_assets_enabled;
    new.export_qr_mapping_enabled  := old.export_qr_mapping_enabled;
    new.export_documents_enabled   := old.export_documents_enabled;
    new.export_submissions_enabled := old.export_submissions_enabled;
    -- Plan / commercial fields (from 0016)
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

-- Trigger definition is unchanged (0016 already binds this function BEFORE UPDATE);
-- create-or-replace above swaps the body in place.
