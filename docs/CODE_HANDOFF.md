# Code Handoff — AssetTag QR

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
- **Privacy.** Hash or truncate IPs into `scan_events.ip_hash`; never store raw IPs. Keep `internal_notes`, private docs, billing fields, and submissions off all public surfaces.
- **Branding.** All branding is data-driven and generic; nothing hard-coded. "Powered by [Product Name]" comes from `organizations.powered_by_label`.

## Quality gates

Run **lint, typecheck, tests, and build** after meaningful changes and show the command output. Use plan mode before multi-file changes. A change isn't done until checks pass and the slice is demoable.

## Open items

Resolve or accept the defaults in `docs/OPEN_QUESTIONS.md` as you reach each area (notably: admin invite flow, allowed file types/size caps, IP-hash scheme, submission notifications, and short-code format).
