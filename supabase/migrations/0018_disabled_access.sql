-- 0018_disabled_access.sql — deny disabled users at the RLS layer (Wave 5C).
--
-- App-level enforcement already exists: getProfile() (lib/auth/session.ts) returns null
-- for a disabled profile, so requireProfile/requireRole/requireOrgId redirect them to
-- /login. This migration adds belt-and-suspenders at the database layer by making the two
-- SECURITY DEFINER resolvers status-aware, so a disabled user who still holds a valid
-- Supabase session gets NO org/owner scope through RLS on any tenant table.
--
-- `invited` and `active` keep access (matches getProfile, which only denies `disabled`).
-- Existing rows default to `active`, so there is no behavior change for current users.
-- Requires the profiles.status column from migration 0017.

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where auth_user_id = auth.uid()
    and status <> 'disabled';
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role = 'platform_owner'
      and status <> 'disabled'
  );
$$;
