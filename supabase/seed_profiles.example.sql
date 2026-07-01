-- seed_profiles.example.sql — First-account runbook (TEMPLATE, do not commit real UIDs).
--
-- Use this ONLY to create the very first platform owner (the super-admin). After
-- that, the platform owner invites customer admins/staff from the app
-- (/owner/organizations/[id]/users) and customer admins invite their own staff
-- (/dashboard/settings/users) — no more SQL needed (Wave 5B). Creating additional
-- platform owners stays manual via this runbook. See docs/MVP_SCOPE.md and
-- docs/OPEN_QUESTIONS.md #4.
--
-- ── App invite links (Wave 5B.1 — NO email template / SMTP / Pro needed) ─────
-- Invites are generated in the app (auth.admin.generateLink) as copyable links of the
-- form ${SITE_URL}/auth/action?token_hash=…&type=invite. The inviter sends the link
-- manually; Supabase's default invite email is NOT used, so there is no "Invite user"
-- template to edit. The invited user clicks Continue → sets a password → lands on their
-- dashboard. Just set Site URL + Redirect URLs (see docs/SUPABASE_AUTH_CONFIG.md).
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
  'PASTE_PLATFORM_OWNER_AUTH_UID_HERE',  -- ← replace with the owner's auth UID
  null,
  'Platform Owner',
  'your-real-email@example.com',                      -- ← replace
  'platform_owner'
)
on conflict (auth_user_id) do nothing;

-- Customer admin for Northridge Rentals (seeded org id from supabase/seed.sql).
insert into public.profiles (auth_user_id, organization_id, name, email, role)
values (
  'PASTE_NORTHRIDGE_ADMIN_AUTH_UID_HERE',  -- ← replace with the admin's auth UID
  '11111111-1111-4111-8111-111111111111',  -- Northridge Rentals
  'Northridge Admin',
  'admin@northridge-rentals.example',       -- ← replace
  'customer_admin'
)
on conflict (auth_user_id) do nothing;
