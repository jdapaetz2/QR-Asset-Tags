# Supabase Auth Configuration — AssetTag QR (MVP)

How auth is configured for the pilot. **The MVP does not require editing Supabase email
templates, configuring custom SMTP, or upgrading to Supabase Pro.**

## Invitations are app-generated copyable links

- The platform owner / customer admin creates an invite in the app
  (`/owner/organizations/[id]/users` or `/dashboard/settings/users`).
- The invite server action calls `auth.admin.generateLink({ type: 'invite', email })`
  (service-role, server-only) and builds an **app** URL from the returned token:
  `${SITE_URL}/auth/action?token_hash=<hash>&type=invite`.
- The inviter copies that link and sends it to the user manually (email, chat, etc.).
  **Supabase's default invitation email is not used**, so there is nothing to template.

### Why an `/auth/action` route (prefetch safety)

Supabase's default verify links (and any emailed link) can be **prefetched/consumed by
email-security scanners**, which fire GET requests and burn the single-use token before the
human clicks. Our `/auth/action` page renders a "Continue" button and **does not verify on
GET** — verification happens only in the POST server action after a real click. This is why
the old `/auth/confirm` GET-verify flow produced "Invalid or expired link."

### Set-password

After clicking Continue, an invited user is authenticated and sent to `/auth/set-password`
to choose a password. On success their profile flips from `invited` to `active` and they land
on their dashboard. From then on they sign in with **email + password**.

## Magic-link email (limited)

Passwordless magic-link login still uses Supabase's default email + the legacy `/auth/confirm`
route, which is unreliable without branded email/SMTP. The login form therefore **defaults to
email + password**; the magic-link option remains but carries a note that it depends on email
delivery. Full magic-link support returns once branded email is configured.

## Required Supabase URL configuration

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: your deployed app origin (e.g. `https://app.yourdomain.com`). Must match
  `NEXT_PUBLIC_SITE_URL`.
- **Redirect URLs** (allow-list): add both
  - `http://localhost:3000/**` (local dev), and
  - `https://<your-deployed-host>/**` (production/preview).

No email-template edits are needed for the invite flow.

## Deferred (future wave)

- **Branded email delivery** of the same generated link via Resend / custom SMTP (once
  brand/domain/email are finalized).
- **Invite-link regeneration** from the UI (today the link is shown once at creation).
- Full magic-link email support.

See also `docs/QR_DOMAIN_STRATEGY.md` (Site URL durability) and
`supabase/seed_profiles.example.sql` (first-owner bootstrap).
