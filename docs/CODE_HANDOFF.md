# Code Handoff — Mulemark

Engineering handoff for building the MVP from an empty repo. Read this alongside `docs/PRD.md`, `docs/MVP_SCOPE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, and `docs/SPRINT_PLAN.md`.

## Stack

- **Next.js (App Router)** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (use shadcn where it helps; don't over-abstract)
- **Supabase** — Postgres, auth, storage, and row-level security
- **Vercel** — hosting/deployment
- **Stripe** — later, not in MVP. Structure billing fields so Stripe can be added without a rewrite, but do not implement it.

Keep code simple, boring, and maintainable. Avoid premature abstractions. Build vertical slices that are each demoable.

## Suggested repository structure

```
/app
  /t/[shortCode]/page.tsx        # public equipment page (no auth)
  /(public)/...                   # public form routes + actions
  /(admin)/dashboard/...          # org-scoped admin UI (auth required)
  /(platform)/owner/...           # platform-owner views (all orgs)
  /api/ or server actions         # submission intake, exports
/components                       # shared UI (shadcn-based)
/lib
  /supabase                       # client/server Supabase helpers
  /qr                             # QR SVG generation
  /auth                           # role/session helpers
/db
  /migrations                     # SQL migrations (tables + RLS policies)
  /seed                           # Northridge Rentals demo data
/docs                             # these planning docs
```

Adjust to taste, but keep the public page, admin, and platform-owner concerns clearly separated, and keep all SQL (schema + RLS) in versioned migrations.

## Environment variables

Set these in `.env.local` and in Vercel project settings (do not commit secrets):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never exposed to the client)
- `NEXT_PUBLIC_SITE_URL` (base for permanent QR URLs, e.g. the `/t/{short_code}` host)
- Storage bucket name(s) and any upload size/type config
- Anti-abuse config (rate-limit window, honeypot field name)
- `RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` (server only — submission/tag-request
  notification emails via Resend). Both optional: leave blank to run notifications in
  dry-run mode (logged, never sent). `NOTIFICATION_FROM_EMAIL` must be a Resend-verified
  sender. Never commit these.

The service-role key is used only in trusted server contexts (e.g. deriving `organization_id` on public submission intake). Never ship it to the browser.

## Build order (vertical slices)

Follow `docs/SPRINT_PLAN.md`: foundation → auth/tenancy → assets + page editor → QR routing + public page → public forms + uploads → admin submissions + documents → QR/tag export + analytics → hardening. Each slice ends demoable with checks passing.

## Database and security setup

Create all MVP tables in migrations (see `docs/DATA_MODEL.md`) and **enable RLS on every tenant-scoped table in the same migration that creates it.** Policies resolve the caller's org from their `profiles` row; `platform_owner` policies bypass the org match. The anonymous/public role gets read access only to published public content and insert-only access to `form_submissions` plus form-flow media uploads — no select/list on submissions or storage. See `docs/SECURITY_MODEL.md` for the full ruleset. Seed the Northridge Rentals demo org and four demo assets.

## Key implementation notes

- **Permanent QR URLs.** The QR encodes `${NEXT_PUBLIC_SITE_URL}/t/{short_code}`, resolved via `qr_links` → `asset`. Never encode third-party/manual/Drive links. Keep `qr_links` separate from `assets` so an asset can have more than one tag later.
- **Public page.** Mobile-first; render only `is_published` equipment pages and `public` documents; show org branding, asset public fields, support contact (asset override → org fallback), action buttons, and the configurable "Powered by" footer + disclaimer.
- **Submission intake.** Asset is prefilled and not editable; derive `organization_id` and `asset_id` server-side from the validated QR/asset, not from client input. Store form-specific fields in `submission_data_json`.
- **Uploads.** Validate type and size; store under org-scoped paths (`org/{organization_id}/...`); never allow public listing. Apply rate limiting and/or a honeypot.
- **QR SVG export.** Generate SVG (per asset and bulk), plus CSV (`asset_code`, `asset_name`, `short_url`, `organization_name`) and a printable production sheet with tag metadata (size, material, mounting, code, short URL).
- **Analytics aggregation (DB-side, yard-local days).** The customer analytics page calls four read-only Postgres RPCs (migration 0020: `analytics_daily_activity`, `analytics_scans_by_category`, `analytics_submission_breakdown`, `analytics_asset_activity`) instead of fetching raw `scan_events` / `form_submissions` rows and bucketing in JS. This fixes the PostgREST 1000-row truncation and the UTC-vs-yard-local day mismatch (the yard's "today" is `America/Vancouver`; there's no `organizations.timezone` column yet, so it defaults via `coalesce(<future org tz>, 'America/Vancouver')`). All four are `SECURITY INVOKER` (RLS stays in force; anon can't read the tables), isolate on `organization_id = current_org_id()`, lock `search_path=public`, return **no `ip_hash`/`user_agent`/`referrer`**, and are **`revoke execute … from public, anon` + `grant … to authenticated`** (anon cannot execute — migration 0021 revokes the direct `anon` grant that Supabase's default privileges add, which `revoke … from public` alone leaves in place). `last_scanned_at` + `open_submission_count` are all-time; everything else is range-scoped. Row types + `buildBreakdown` + `toDailySeries` live in `lib/analytics/rpc.ts`; ranking in `lib/analytics/problem-assets.ts`. In these `RETURNS TABLE` functions, always table-qualify subquery columns — a bare name matching an OUT column errors (`variable_conflict = error`). No service-role; `seed.sql` unchanged. See `docs/DATA_MODEL.md` → "Analytics aggregation RPCs".
- **Privacy.** Hash or truncate IPs into `scan_events.ip_hash`; never store raw IPs. Keep `internal_notes`, private docs, billing fields, and submissions off all public surfaces.
- **Branding.** All branding is data-driven and generic; nothing hard-coded. "Powered by [Product Name]" comes from `organizations.powered_by_label`.
- **Data exports (platform-gated).** Customer self-serve CSV export is OFF by default per org. The platform owner enables it per organization (master `customer_exports_enabled` + per-type flags on `organizations`, set on `/owner/organizations/[id]/settings`). Customers download enabled types at `/dashboard/export`; the platform owner can always export an org's data at `/owner/organizations/[id]/export` (support/offboarding). A DB trigger (`protect_export_flags`, migration 0015) ensures only the platform owner can change the flags. All export URLs are computed from `NEXT_PUBLIC_SITE_URL` (never the stored `qr_links.public_url`); CSVs are RFC-4180 escaped + formula-injection guarded and exclude private media. No service-role in export routes.
- **QR domain durability.** Physical tags encode `${NEXT_PUBLIC_SITE_URL}/t/{short_code}`. The domain must be a stable production/custom host before tags are produced — `localhost`/preview URLs are test-only, and changing the domain later breaks printed tags unless redirects are preserved. See `docs/QR_DOMAIN_STRATEGY.md`.
- **Organization suspension (account-level).** The platform owner can **suspend** or **reactivate** a whole customer organization from `/owner/organizations/[id]` (action `setOrgStatus`, owner-only). Suspension is **data-preserving** — it only flips `organizations.status` (`active`|`suspended`); no assets, users, or media are deleted. While suspended: customer users are redirected to `/suspended` (guarded in `app/(admin)/layout.tsx` via `requireActiveOrg`, and in `requireOrgId` for route handlers), and public scan pages/forms show the normal `UnavailableNotice` — the anon `organizations_public_select` policy already requires `status='active'`, and the reason is never disclosed publicly. DB backstop: `current_org_id()` returns null when the org isn't active (migration 0019), so a stale customer session loses all tenant RLS scope. Only the platform owner may change `status` (the `protect_commercial_fields` trigger coerces it for non-owners) — **no customer self-reactivation**. Distinct from **user disable** (per-person, `profiles.status`); **not** a seasonal "pause coverage"/billing action. Reactivation is immediate.
- **Plans & covered assets (commercial).** Pricing is per **covered asset** (non-archived asset with ≥1 `qr_links` row; disabled links still count; scans unlimited). Plan/commercial fields on `organizations` are **platform-owner-only** — set at `/owner/organizations/[id]/settings`, guarded by the `protect_commercial_fields` DB trigger (migration 0016). Imports/drafts are never limited; only **new QR coverage** + tag requests are (app checks in `lib/qr/actions.ts` + `lib/tags/actions.ts`, with a hard `enforce_qr_coverage_limit` trigger). `asset_limit = null` = unlimited. No Stripe/billing. Full model in `docs/COMMERCIAL_MODEL.md`.
- **Navigation & role enforcement (Wave 3N).** Nav visibility and route guards **must agree** — nav that hides a link the guards still permit is a defect. Admin-only **configuration** routes (Settings, Users, Export + download, Tag requests, Templates incl. return-inspections, Import) enforce `customer_admin` server-side via `requireCustomerAdminOrgId` (`lib/auth/session.ts`); **operational** surfaces shared by admin + staff (Dashboard, Assets **and asset detail + its sub-pages**, Submissions + export, Rentals + session evidence, Analytics) use the org-membership guard (`requireOrgId`/`requireOrgContext`). `(admin)/layout.tsx` enforces active-org only; every `/owner/**` page repeats `requireRole(PLATFORM_OWNER)`; staff scan routes use `requireStaffAssetByShortCode`. Primary nav (`lib/auth/nav.ts`): owner = Organizations · Tag requests · Analytics · Production (+ `OwnerOrgSubnav` when a URL holds an `organizationId`); admin = Dashboard · Assets · Submissions · Rentals · Analytics · Settings; staff = same minus Settings. **Rentals is a primary destination** (not off-nav). **Context preservation:** detail→Back and state-changing server actions return to the *filtered* list via `currentListHref`/`withReturnTo`/`backHref` (`lib/nav/return-to.ts`, dashboard-only allowlist); the staff workflow stays in the system-font `StaffRecordFrame` (never the desktop admin shell); the owner keeps org context via `OwnerOrgSubnav` and `?org`. Sign-out → `/login` (`signOut` action); post-login `?next=` is sanitized by `sanitizeNextPath` (`lib/auth/redirect.ts`, same-origin path-only). Renter-facing term is **Return checklist** (internal `return_checklist` unchanged). See `docs/NAVIGATION_UX_AUDIT.md` §0/§0.1 + `docs/brand/navigation-map.html`.

## Quality gates

Run **lint, typecheck, tests, and build** after meaningful changes and show the command output. Use plan mode before multi-file changes. A change isn't done until checks pass and the slice is demoable.

## Open items

Resolve or accept the defaults in `docs/OPEN_QUESTIONS.md` as you reach each area (notably: admin invite flow, allowed file types/size caps, IP-hash scheme, submission notifications, and short-code format).
