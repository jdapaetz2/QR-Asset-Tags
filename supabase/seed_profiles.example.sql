-- seed_profiles.example.sql — First-account runbook (TEMPLATE, do not commit real UIDs).
--
-- Sprint 1 onboarding is manual (no self-signup, no platform-owner "create
-- admin" UI yet). Use this to create the first platform owner and the first
-- customer admin so they can log in. See docs/MVP_SCOPE.md and
-- docs/OPEN_QUESTIONS.md #4.
--
-- ── Steps ──────────────────────────────────────────────────────────────────
-- 1. Create the auth users (one of):
--      • Supabase Dashboard → Authentication → Users → "Add user" / "Invite",
--        OR
--      • Auth admin API / `supabase` CLI.
--    For magic-link login, no password is needed. For password login, set a
--    password when creating the user.
-- 2. Copy each user's UID (auth.users.id).
-- 3. Replace the placeholder UIDs below and run this in the SQL editor.
--    `auth_user_id` is UNIQUE, so re-running with the same UID is a no-op.
--
-- ── Magic-link email template (required for magic-link login) ───────────────
-- Supabase Dashboard → Authentication → Email Templates → "Magic Link":
--   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
--     Sign in
--   </a>
-- This points the link at app/auth/confirm/route.ts (verifyOtp).

-- Platform owner (organization_id is NULL — cross-org access via RLS).
insert into public.profiles (auth_user_id, organization_id, name, email, role)
values (
  '00000000-0000-0000-0000-000000000000',  -- ← replace with the owner's auth UID
  null,
  'Platform Owner',
  'owner@example.com',                      -- ← replace
  'platform_owner'
)
on conflict (auth_user_id) do nothing;

-- Customer admin for Northridge Rentals (seeded org id from supabase/seed.sql).
insert into public.profiles (auth_user_id, organization_id, name, email, role)
values (
  '00000000-0000-0000-0000-000000000001',  -- ← replace with the admin's auth UID
  '11111111-1111-4111-8111-111111111111',  -- Northridge Rentals
  'Northridge Admin',
  'admin@northridge-rentals.example',       -- ← replace
  'customer_admin'
)
on conflict (auth_user_id) do nothing;
