-- 0032_role_write_enforcement.sql — Phase A3.1
--
-- WHY: route guards and navigation distinguish customer_admin from customer_staff, but the
-- database did not. Before this migration NO policy, trigger, or helper read `profiles.role`
-- except to test `= 'platform_owner'`, so every customer write policy was a pure org-membership
-- check. Two consequences:
--
--   1. CRITICAL — `profiles_update` (0001) validates WHICH ROW is written but never which
--      columns/values, so any authenticated user could `update profiles set role='platform_owner'
--      where auth_user_id = auth.uid()` through PostgREST and escalate across every tenant.
--   2. A customer_staff JWT could write organization settings (including the unique `slug` that
--      drives public tag URLs), create tag requests, and fully manage templates via direct REST,
--      even though the UI and route guards forbid it.
--
-- WHAT: adds two role helpers, a profiles column-protection trigger, and role-aware WRITE
-- policies. **Additive and write-only** — every SELECT predicate is preserved verbatim so staff
-- operational reads are unaffected.
--
-- DELIBERATELY UNTOUCHED (load-bearing for staff outbound/return): `assets`,
-- `asset_rental_sessions`, `form_submissions`, `scan_events`, `asset_acknowledgements`,
-- `qr_links`, `equipment_pages`, `documents`, every anon/public policy, `protect_commercial_fields`
-- (0016/0019), and the SECURITY INVOKER RPCs `start_outbound_rental` (0030) /
-- `complete_staff_return` (0029) — those run under the caller's own RLS and REQUIRE staff to keep
-- their INSERT/UPDATE rights on assets, rental sessions, and submissions.
--
-- Superseded by this migration: `organizations_update`, `tag_requests_insert`,
-- `tag_request_assets_insert`, `equipment_page_templates_{insert,update,delete}` (all 0001/0008/0010),
-- and the single FOR ALL policies `inspection_templates_rw` (0026) / `inspection_category_defaults_rw`
-- (0025), which are split into per-command policies.

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------
-- Mirrors current_org_id() (0019): SECURITY DEFINER so policies never recurse through profiles,
-- STABLE, search_path locked, and disabled profiles / suspended orgs fail closed. No client-supplied
-- organization id is ever trusted — scope is always derived from auth.uid().

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status <> 'disabled';
$$;

comment on function public.current_profile_role() is
  'The caller''s application role (platform_owner | customer_admin | customer_staff), or NULL when '
  'signed out or disabled. Derived from auth.uid(); never from client input.';

create or replace function public.is_current_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.auth_user_id = auth.uid()
      and p.status <> 'disabled'
      and p.role = 'customer_admin'
      and o.status = 'active'
  );
$$;

comment on function public.is_current_org_admin() is
  'True only for an active customer_admin in an active organization. Used by write policies to '
  'separate administrative writes from customer_staff operational access.';

revoke execute on function public.current_profile_role() from public;
revoke execute on function public.is_current_org_admin() from public;
grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.is_current_org_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. profiles — protect privileged columns (closes the escalation)
-- ---------------------------------------------------------------------------
-- profiles_update (0001) intentionally lets a user update their OWN row (name/email). This trigger
-- makes `role`, `organization_id`, and `status` immutable for that caller, mirroring the
-- protect_commercial_fields pattern: it coerces rather than raising, so legitimate self-edits keep
-- working.
--
-- Three carve-outs:
--   * platform owner — full authority (owner tooling).
--   * auth.uid() IS NULL — trusted server context (service-role team actions / SECURITY DEFINER).
--     anon can never reach this trigger: profiles_update requires auth_user_id = auth.uid()
--     (never true for anon) or is_platform_owner().
--   * the narrow invite -> set-password self-activation (invited -> active) with role and
--     organization unchanged, required by setPassword in lib/auth/actions.ts.

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_owner() then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if old.status = 'invited'
     and new.status = 'active'
     and new.role is not distinct from old.role
     and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;

  new.role := old.role;
  new.organization_id := old.organization_id;
  new.status := old.status;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- ---------------------------------------------------------------------------
-- 3. organizations — administrative configuration is customer_admin only
-- ---------------------------------------------------------------------------
-- SELECT is unchanged (staff need it: ownOrgActive on /dashboard, org name/asset_limit).
-- Commercial/export/status columns stay owner-only via protect_commercial_fields (0016/0019).

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (
    public.is_platform_owner()
    or (id = public.current_org_id() and public.is_current_org_admin())
  )
  with check (
    public.is_platform_owner()
    or (id = public.current_org_id() and public.is_current_org_admin())
  );

-- ---------------------------------------------------------------------------
-- 4. tag requests — administrative; staff keeps SELECT (dashboard counts)
-- ---------------------------------------------------------------------------

drop policy if exists tag_requests_insert on public.tag_requests;
create policy tag_requests_insert on public.tag_requests
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

drop policy if exists tag_request_assets_insert on public.tag_request_assets;
create policy tag_request_assets_insert on public.tag_request_assets
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (
      public.is_current_org_admin()
      and exists (
        select 1
        from public.tag_requests r
        where r.id = tag_request_assets.tag_request_id
          and r.organization_id = public.current_org_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. equipment page templates — administrative writes only
-- ---------------------------------------------------------------------------
-- SELECT (0008) is unchanged: system rows + own-org rows stay readable.

drop policy if exists equipment_page_templates_insert on public.equipment_page_templates;
create policy equipment_page_templates_insert on public.equipment_page_templates
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (
      organization_id = public.current_org_id()
      and is_system = false
      and public.is_current_org_admin()
    )
  );

drop policy if exists equipment_page_templates_update on public.equipment_page_templates;
create policy equipment_page_templates_update on public.equipment_page_templates
  for update to authenticated
  using (
    public.is_platform_owner()
    or (
      organization_id = public.current_org_id()
      and is_system = false
      and public.is_current_org_admin()
    )
  )
  with check (
    public.is_platform_owner()
    or (
      organization_id = public.current_org_id()
      and is_system = false
      and public.is_current_org_admin()
    )
  );

drop policy if exists equipment_page_templates_delete on public.equipment_page_templates;
create policy equipment_page_templates_delete on public.equipment_page_templates
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (
      organization_id = public.current_org_id()
      and is_system = false
      and public.is_current_org_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. inspection templates — split FOR ALL into read (unchanged) + admin writes
-- ---------------------------------------------------------------------------
-- The public return form reads published templates through the SECURITY DEFINER RPC
-- get_asset_return_template (0026), which is unaffected by these policies.

drop policy if exists inspection_templates_rw on public.inspection_templates;

create policy inspection_templates_select on public.inspection_templates
  for select to authenticated
  using (public.is_platform_owner() or organization_id = public.current_org_id());

create policy inspection_templates_insert on public.inspection_templates
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

create policy inspection_templates_update on public.inspection_templates
  for update to authenticated
  using (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  )
  with check (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

create policy inspection_templates_delete on public.inspection_templates
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

-- ---------------------------------------------------------------------------
-- 7. inspection category defaults — same split
-- ---------------------------------------------------------------------------

drop policy if exists inspection_category_defaults_rw on public.inspection_category_defaults;

create policy inspection_category_defaults_select on public.inspection_category_defaults
  for select to authenticated
  using (public.is_platform_owner() or organization_id = public.current_org_id());

create policy inspection_category_defaults_insert on public.inspection_category_defaults
  for insert to authenticated
  with check (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

create policy inspection_category_defaults_update on public.inspection_category_defaults
  for update to authenticated
  using (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  )
  with check (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

create policy inspection_category_defaults_delete on public.inspection_category_defaults
  for delete to authenticated
  using (
    public.is_platform_owner()
    or (organization_id = public.current_org_id() and public.is_current_org_admin())
  );

-- ---------------------------------------------------------------------------
-- 8. Defense in depth: anon holds no DML on administrative tables
-- ---------------------------------------------------------------------------
-- These tables were created without explicit anon revokes and relied only on RLS default-deny
-- (no anon policy). Revoking the table privileges Supabase's default grants add makes that
-- explicit. The public return form is unaffected — it reads templates via the SECURITY DEFINER
-- RPC, which does not consult anon's table grants.

revoke all on public.profiles from anon;
revoke all on public.tag_requests from anon;
revoke all on public.tag_request_assets from anon;
revoke all on public.equipment_page_templates from anon;
revoke all on public.inspection_templates from anon;
revoke all on public.inspection_category_defaults from anon;
