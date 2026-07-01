-- 0017_profile_status.sql — user lifecycle status for team management (Wave 5B).
--
-- Adds a lifecycle status to profiles so the platform owner / customer admins can
-- invite and disable users from the app. Enforcement of "disabled" is app-level in
-- getProfile() (lib/auth/session.ts): a disabled profile resolves to no session, so
-- requireProfile/requireRole redirect the user to /login. RLS-level disable hardening
-- (status-aware current_org_id()) is a Wave-5C follow-up.
--
-- - active   : normal member.
-- - invited  : invited via Supabase Auth, profile created, may not have logged in yet.
-- - disabled : deactivated; denied app access by the session helpers.

alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'invited', 'disabled'));

-- Existing rows keep app access (default 'active'). No RLS change: profile writes go
-- through gated, service-role server actions (invite requires creating an auth user,
-- which RLS cannot do); listing continues to use the org-scoped profiles_select policy.
