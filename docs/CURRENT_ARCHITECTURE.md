# Current Architecture — Mulemark (as built)

Phase A1 as-built map of `pilot-credibility`. Companions: `docs/MIGRATION_LEDGER.md` (DB record),
`docs/SECURITY_MODEL.md` (RLS + gaps), `docs/PILOT_LIMITATIONS.md` (blockers), `docs/NAVIGATION_UX_AUDIT.md` (nav).
Code is the source of truth; this summarizes it.

## Stack
Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4; Supabase (Postgres/Auth/Storage/RLS); Vercel hosting;
Resend for email (optional, dry-run capable). Node 22 in CI (local 24). ~65 route entrypoints, 31 migrations,
126 test files.

## Route groups + roles
- **`app/(public)` + root:** `/`, `/login`, `/auth/**`, `/suspended`. Public/anon or any-authenticated.
- **`app/t/[shortCode]`, `app/forms/**`:** anonymous public scan + damage/support/return forms (zero-login,
  zero-webfont).
- **`app/(admin)/dashboard/**`:** customer app. Layout requires an **active org**. Operational routes (Dashboard,
  Assets + detail/sub-pages, Submissions, Rentals, Analytics) allow **admin + staff** via `requireOrgId`/
  `requireOrgContext`; configuration routes (Settings, Users, Export, Tag requests, Templates, Import) require
  **customer_admin** via `requireCustomerAdminOrgId`.
- **`app/(staff)/staff/t/[shortCode]/**`:** authenticated same-org staff scan workflow (outbound / return / evidence),
  guarded per-page by `requireStaffAssetByShortCode` (own-org asset else 404); system-font shell, not the admin shell.
- **`app/(platform)/owner/**`:** platform owner, cross-org; every page calls `requireRole(PLATFORM_OWNER)`.

Roles: `platform_owner`, `customer_admin`, `customer_staff`, plus anonymous public. Nav (`lib/auth/nav.ts`) matches
the guards. Guard helpers live in `lib/auth/session.ts`; sign-out → `/login`; post-login `?next=` is sanitized
(`lib/auth/redirect.ts`).

## RLS / tenant model
Postgres RLS is the enforcement boundary. Tenant policies are `is_platform_owner() or organization_id =
current_org_id()`. `current_org_id()` (SECURITY DEFINER) returns NULL for a **disabled** profile or a **suspended**
org (migrations 0018/0019), collapsing scope on all tenant tables at once. Anon SELECT is column-restricted to
public-safe fields; anon is INSERT-only on `form_submissions`, `scan_events`, `asset_acknowledgements`. **Gap:** the
admin/staff split is not expressed in RLS (only route-level) — see `docs/PILOT_LIMITATIONS.md` (A3.1).

## Public resolver
`lib/public/resolve.ts` resolves `/t/[shortCode]` via the **anon** client against `qr_links` (`status='active'`),
then reads public-safe asset / published equipment page / active-org branding — each returns null under RLS if not
publicly visible. Private/draft/archived/suspended → `UnavailableNotice` (reason never disclosed).

## Submissions
`form_submissions` (`damage_report` / `support_request` / `return_checklist` / `pre_use_inspection`). Public insert
derives `organization_id` server-side; admin/staff triage via the inbox (filters, multi-select bulk, status actions);
`status` = new/reviewed/resolved/archived. Origin (`public`/`staff`) + actor are server-stamped (migration 0028).

## Return checklists + inspections
Renter-facing term **Return checklist**; origin variants **Renter return checklist** / **Staff return checklist**;
outbound is **Outbound inspection**; internal form_type stays `return_checklist`. Guided, versioned templates
(`inspection_templates`, 0026) with org category defaults (0025) and immutable snapshots at submit; 3-stage mobile
form; photos soft/non-blocking with an omission acknowledgement.

## Rental sessions
`asset_rental_sessions` (0014) tie outbound baseline → renter report → staff return. `start_outbound_rental`
(0027→0028→**0030**, create-or-attach) and `complete_staff_return` (0028→**0029**, closes + reconciles renter
reports) are atomic RPCs. Acknowledgements attach to the session; session evidence (`/dashboard/rentals/[sessionId]`)
shows before/after comparison + photos by source + print.

## Media / storage
Buckets (hard-coded names): `public-assets` (public), `submissions` (private), `documents` (private). Anon is
insert-only under `org/{id}/` paths and cannot list; admin views mint short-lived (1h) signed URLs. **Note:**
`public-assets` objects are public by URL (see limitations). Caps are code constants (8 img / 40 MB inspections;
52 MB body).

## Notifications
`lib/notifications/*` sends via Resend (server-only). **Dry-run capable:** without `RESEND_API_KEY` /
`NOTIFICATION_FROM_EMAIL` it logs instead of sending; public submissions never block on email. Failures are currently
swallowed — observability is A5.

## QR governance
`qr_links` with rotation, `is_production_primary`, and `supersedes_qr_link_id` (0023). Production selects the
production-primary link; deactivated links retain history and keep resolving. Owner production emits SVG/CSV/print
sheet, gated by `isProductionBaseUrl` (blocks localhost / preview hosts).

## Exports
Two distinct paths: **owner export** (`/owner/organizations/[id]/export`) always works; **conditional customer
export** (`/dashboard/export`) is OFF by default, owner-enabled, customer-admin-only via `canCustomerUseExport`
(`lib/export/access.ts`) + the `protect_export_flags` trigger (0015). A separate `/dashboard/submissions/export`
inbox CSV is staff-reachable and pending an A3.1 policy decision.

## Deployment
Vercel (Next 16) + Supabase + Resend. **Migrations are applied manually by the operator via `supabase db push`** —
no automated migration step in CI/deploy. CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on
push-to-`main` and PRs. Env is centralized in `lib/env.ts` (7 vars; server secrets browser-guarded);
`NEXT_PUBLIC_SITE_URL` is production-domain-sensitive. No deploy/rollback/incident runbook yet (A2/A5).

## Test coverage
Two suites. **(1) Fast unit/structural** — `npm test` (Vitest, node-only, no DOM): ~103 pure/unit + source-structural
`readFileSync` string-asserts; runs on every push. **(2) Executed security (Phase A3.2)** — `npm run test:security`
against a local Supabase stack: real signed-in PostgREST/Auth/Storage clients prove **live RLS, RPC role/org
boundaries, storage policies, and fresh migration application (0001→latest)**. Runs nightly + on PRs
(`.github/workflows/security.yml`), never against a hosted project (loopback-guarded). Secret scanning is active
(gitleaks in `ci.yml`). Still open: **0 browser/E2E** (no Playwright/jsdom) — A6.1. No git hooks (by design). See
`docs/SECURITY_TESTING.md` and `docs/PILOT_LIMITATIONS.md`.

## Known scaling boundaries
- Asset **timeline** and **rentals browser** use bounded keyset (cursor) pagination + explicit "Load more" — no
  count queries, no unbounded scans, no auto-refresh loops.
- **Analytics** uses DB-side RPCs (0020/0021) to avoid PostgREST's 1000-row truncation and to bucket by yard-local
  day; execute is granted to `authenticated` only.
- **Media/storage growth** is unbounded today (no quotas/lifecycle) — a roadmap trigger item before broad photo
  rollout.
- **Timezone** fixed to `America/Vancouver` until an `organizations.timezone` column is added.
