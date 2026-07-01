# Onboarding Runbook — AssetTag QR

How the **AssetTag QR platform admin** manually onboards a new pilot rental
company and takes it from an empty organization to a live, scannable fleet.
Onboarding is manual by design for the MVP — there is no self-signup and no
in-app "create organization" UI. Everything below is done by the platform admin
through the Supabase dashboard (or SQL) plus the customer admin dashboard.

> **Business rule:** QR/tag production is controlled by the AssetTag QR platform
> admin only. Customer admins manage assets, content, documents, submissions, and
> QR readiness, but they never get production QR exports or tag-production controls.
> Those live under `/owner/production` and are gated to the `platform_owner` role.

See also: [PILOT_DEMO_SCRIPT.md](PILOT_DEMO_SCRIPT.md) (call script),
[MVP_PILOT_READINESS.md](MVP_PILOT_READINESS.md) (go/no-go checklist + limitations),
[SECURITY_MODEL.md](SECURITY_MODEL.md), and [DATA_MODEL.md](DATA_MODEL.md).

## Terminology

| Term in this doc | Role value (`profiles.role`) | What they do |
| --- | --- | --- |
| **AssetTag QR platform admin** | `platform_owner` | Creates organizations and first admins, runs QR/tag production, sees all orgs. `organization_id` is `NULL`. |
| **Customer admin** | `customer_admin` | Manages one org's assets, pages, documents, and submissions. Scoped to their `organization_id`. |
| Staff | `customer_staff` | Mirrors customer admin for the MVP (differentiated later if a pilot needs it). |

After login, a `platform_owner` lands on `/owner`; everyone else lands on
`/dashboard`. Role values are defined once in `lib/auth/roles.ts` and enforced by
the database CHECK constraint on `profiles.role`.

---

## 1. Environment & deployment checklist

Do this once per environment (local, and again for the hosted pilot).

### Required environment variables

Set in `.env.local` for local dev and in Vercel project settings for the deploy.
Never commit real values.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (browser/RLS client) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Service-role key — never exposed to the browser; never engraved in any doc |
| `NEXT_PUBLIC_SITE_URL` | public | Base host for permanent QR URLs (`{SITE_URL}/t/{short_code}`) |
| `SCAN_IP_HASH_SALT` | server only | Salt for hashing scan-event IPs. Optional, but **set a strong value for the pilot** so scan IPs are salted |

### `NEXT_PUBLIC_SITE_URL` behavior

- **Local:** `http://localhost:3000`. Fine for development and testing the flow.
- **Production / custom domain:** the stable host you will engrave on physical
  tags (e.g. `https://app.yourdomain.com`).

> ⚠️ **Production QR URL caution.** For physical QR tags, `NEXT_PUBLIC_SITE_URL`
> must be a stable production/custom domain. **Do not engrave `localhost` or a
> Vercel preview URL (`*.vercel.app`) onto tags** unless you are intentionally
> testing — those URLs are not permanent. The production workspace
> (`/owner/production`) shows an amber warning and treats `localhost`,
> `127.0.0.1`, `0.0.0.0`, `::1`, and `*.vercel.app` as non-production base URLs.

### Supabase Auth settings

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** the same value as `NEXT_PUBLIC_SITE_URL` for the environment.
- **Redirect URLs:** add the app origin(s) you log in from, including
  `http://localhost:3000` for local and the production/custom domain for the deploy,
  so invite/magic-link and login redirects resolve.

### Database, seed, and storage

1. Apply all migrations in order (`0001`–`0006`): `supabase db push`.
   - `0006_documents_public_read.sql` is **required** for hosted public documents
     to surface on the public page — apply it before the pilot.
2. (Optional, demo only) Apply `supabase/seed.sql` to load the **Northridge
   Rentals** demo org and four demo assets. The seed does **not** create auth
   users or `profiles` — that is the bootstrap step below.
3. Storage buckets (created by `0002_storage.sql` / `0005_documents_storage.sql`):
   - `submissions` — **private** (form media; anon insert-only, no read-back).
   - `documents` — **private** (hosted manuals; public docs served via short-lived
     signed URLs).
   - `public-assets` — **public-read** (cover images only).

---

## 2. First-account bootstrap

`profiles` rows require a real `auth.users` user, so create the auth user first
(dashboard or invite), then insert the matching `profiles` row.

### a. AssetTag QR platform admin (`platform_owner`)

One-time per environment.

1. Supabase dashboard → **Authentication → Users → Add user** (or send an invite).
   Note the new user's UUID.
2. Insert the profile (`organization_id` is `NULL` for the platform admin):

```sql
-- Replace <platform-admin-auth-uuid> with the auth.users id from step 1.
insert into public.profiles (auth_user_id, organization_id, name, email, role)
values (
  '<platform-admin-auth-uuid>',
  null,
  'Platform Admin',
  'platform-admin@example.com',
  'platform_owner'
);
```

3. Log in at `/login`; you should land on `/owner` and see the organizations list.

### b. Customer admin (`customer_admin`)

One per pilot organization — see step 3 below (it depends on the org existing first).

> **Credential delivery:** deliver login access to the customer admin via the
> Supabase **invite / magic-link email** (Authentication → Users → invite). Do not
> set or share passwords in plaintext, and never put real keys or passwords in any
> doc or commit.

---

## 3. Onboard a pilot customer (step by step)

Run these in order. SQL examples use **placeholders only** — substitute the real
organization name, contact details, and UUIDs.

### 3.1 Create the organization

```sql
insert into public.organizations (
  name, slug, primary_color,
  support_phone, support_email, website_url,
  powered_by_label, status, plan_name, monthly_fee, asset_limit
) values (
  'Pilot Rentals Co',                 -- name
  'pilot-rentals-co',                 -- slug (lowercase, hyphenated, unique)
  '#1d4ed8',                          -- primary brand color
  '+1-555-0100',                      -- support phone
  'support@pilot-rentals.example',    -- support email
  'https://pilot-rentals.example',    -- website
  'Powered by AssetTag QR',           -- footer label
  'active', 'pilot', 0, 100           -- status, plan, monthly fee, asset limit
)
returning id;  -- capture this org UUID for the steps below
```

### 3.2 Create the customer admin auth user + profile

1. Supabase dashboard → **Authentication → Users** → invite the customer admin's
   email. Note their auth UUID.
2. Insert their profile, scoped to the org from 3.1:

```sql
insert into public.profiles (auth_user_id, organization_id, name, email, role)
values (
  '<customer-admin-auth-uuid>',
  '<org-uuid-from-3.1>',
  'Pilot Admin',
  'admin@pilot-rentals.example',
  'customer_admin'
);
```

The customer admin can now log in at `/login` and lands on `/dashboard`, scoped by
RLS to their organization only.

### 3.3 Confirm org support email/phone

These power the public page's **Contact Support** action (asset-level overrides win;
otherwise the org fallback is used). Confirm `support_phone` / `support_email` on the
organization are correct — set in 3.1, or update later in SQL.

### 3.4 Add the first assets

The customer admin can do this in the UI at **`/dashboard/assets` → New**
(`/dashboard/assets/new`), or the platform admin can seed them in SQL:

```sql
insert into public.assets (
  organization_id, asset_code, asset_name, category,
  make, model, serial_number, year, public_status, internal_notes
) values (
  '<org-uuid>', 'EXCAVATOR-001', 'Excavator 001', 'Mini Excavator',
  'Kubota', 'U17', 'SERIAL-PLACEHOLDER', 2022,
  'private',                          -- start private; flip to public when ready (3.7)
  'Internal note — never shown publicly.'
);
```

`asset_code` is unique within an organization. `internal_notes` is private and
never appears on public surfaces.

### 3.5 Create & publish equipment pages

Per asset, in the UI at **`/dashboard/assets/[assetId]/page`**: fill the content
sections (headline, quick start, safety, fuel/power, return, troubleshooting,
emergency) and **Publish**. Only published pages render publicly. Equipment-page
fields map to the `equipment_pages` table (`is_published = true` when published).

### 3.6 Create QR links

Each asset needs a permanent QR link (short code → `/t/{short_code}`):

```sql
insert into public.qr_links (
  organization_id, asset_id, short_code, public_url, status
) values (
  '<org-uuid>', '<asset-uuid>', 'pilot-ex001',
  'https://app.yourdomain.com/t/pilot-ex001',  -- must match NEXT_PUBLIC_SITE_URL
  'active'
);
```

`public_url` must match the environment's `NEXT_PUBLIC_SITE_URL`. Keep one active
QR link per asset for the MVP.

### 3.7 Set assets public / private

Flip `assets.public_status` to `'public'` when the asset's page and content are
ready to be seen by renters:

```sql
update public.assets set public_status = 'public' where id = '<asset-uuid>';
```

A public page renders only when the asset is `public`, its equipment page is
published, and (for documents) the doc is `visibility = 'public'`.

### 3.8 Add manuals / documents

In the UI at **`/dashboard/assets/[assetId]/documents`**, add manuals/guides as
hosted files or external links, set **visibility** (`public`/`private`) and
**link status**. Or via SQL:

```sql
-- External-link manual, public on the equipment page:
insert into public.documents (
  organization_id, asset_id, title, document_type, url, visibility, link_status
) values (
  '<org-uuid>', '<asset-uuid>', 'Operator Manual', 'manual',
  'https://manuals.example/excavator-001.pdf', 'public', 'ok'
);
```

`document_type` is one of `manual`, `startup_guide`, `safety_sheet`, `video`,
`return_checklist`, `other`. Hosted files use `storage_path` instead of `url` and
are served via short-lived signed URLs; `storage_path` is never exposed publicly.

### 3.9 Test the public QR page

Open `/t/<short_code>` (e.g. the demo `/t/demo-ex017`) on a phone or browser.
Verify: org branding, asset name/code, photo, content sections, support contact,
action buttons (Start-Up Guide, Manual, Report Damage, Return Checklist, Contact
Support), and the "Powered by" footer + disclaimer. Editing content in the
dashboard updates this page **without** reprinting the tag.

### 3.10 Test the public forms

From the public page (or directly), exercise each form for a public asset:

- `/forms/<short_code>/damage`
- `/forms/<short_code>/support`
- `/forms/<short_code>/return`

The asset is prefilled and not editable; `organization_id` is derived server-side.
Submit a damage report with a photo to confirm media upload works.

### 3.11 Review submissions

As the customer admin, open **`/dashboard/submissions`**, open the submission you
just filed (`/dashboard/submissions/[submissionId]`), view its media, change status
(new → reviewed → resolved → archived), and export CSV. Confirm a different org's
admin cannot see these submissions (RLS isolation).

### 3.12 Generate AssetTag QR owner production outputs

As the **platform admin only**, open **`/owner/production`**:

1. Pick the organization, then select assets (each shows readiness: QR link, page
   status, public status).
2. Confirm the **Tag base URL** banner shows your production domain (no amber
   warning).
3. Download per-asset **QR SVG** (`/owner/production/qr.svg`), the **SVG sheet**
   (`/owner/production/qr-sheet.svg`), the **CSV**
   (`/owner/production/export.csv` — `asset_code`, `asset_name`, `short_url`,
   `organization_name`), and the printable **production sheet**
   (`/owner/production/sheet`) with tag metadata (size, material, mounting, code,
   short URL).

Customer admins have no access to these routes.

### 3.13 Review analytics

- Customer admin: **`/dashboard/analytics`** — scan and submission counts for their org.
- Platform admin: **`/owner/analytics`** — usage across organizations.

---

## Onboarding checklist (per pilot)

- [ ] Migrations `0001`–`0006` applied; storage buckets present.
- [ ] `NEXT_PUBLIC_SITE_URL` set to the production/custom domain; Supabase Auth Site
      URL + redirect URLs match.
- [ ] Platform admin account exists (`platform_owner`, `organization_id` NULL).
- [ ] Organization created; support phone/email set.
- [ ] Customer admin invited and `profiles` row created (`customer_admin`, org-scoped).
- [ ] Assets added; equipment pages written and **published**.
- [ ] QR links created (`active`, `public_url` matches `NEXT_PUBLIC_SITE_URL`).
- [ ] Assets flipped to `public` when ready; public docs set to `visibility='public'`.
- [ ] Public page, all three forms, and submissions verified end to end.
- [ ] QR production outputs generated by the platform admin; base URL is production.
- [ ] Analytics reviewed.
- [ ] **Production domain confirmed durable** before any physical tags are produced —
      a stable production/custom host, not `localhost`/preview; redirect plan exists if
      the domain ever changes. See [QR_DOMAIN_STRATEGY.md](QR_DOMAIN_STRATEGY.md).
- [ ] Customer exports left **disabled by default**; enable per org only on request at
      `/owner/organizations/[id]/settings` (master + per-type toggles). The platform
      admin can export an org's data anytime at `/owner/organizations/[id]/export` for
      support/offboarding.
- [ ] **Plan set** at `/owner/organizations/[id]/settings` → Plan & coverage (pick a
      preset or Custom; set the covered-asset limit). Covered assets = non-archived
      assets with an assigned QR tag; scans are unlimited; imports/drafts aren't limited,
      only new QR/tag coverage is. `asset_limit` blank = unlimited. Customers can't change
      plan fields (DB-guarded). See [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md).
