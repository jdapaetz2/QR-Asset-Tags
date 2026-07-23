# Security Model — Mulemark (MVP)

Security is multi-tenant from day one and enforced in the database with Supabase row-level security (RLS), not just in the UI. The UI may hide things, but the database is the boundary that actually protects data.

## Principles

The system must support multi-tenant organization isolation from the first migration. Customer admins can only access their own organization's data. Public QR pages expose only published public content and require no login. Public users can create form submissions but cannot list or read them. Public users can upload media only through form-submission flows. Admin users can view submissions only for their own organization. The platform owner can manage all organizations. Private notes, internal notes, billing info, and submissions are never shown on public pages.

## Roles and access

**Platform owner** (`platform_owner`) — full access across all organizations: create organizations and admin users, manage any org's assets, view all QR links, view usage/submissions across organizations.

**Customer admin** (`customer_admin`) — full access scoped to a single organization: manage org profile, assets, equipment pages, documents, QR links, and review that org's submissions.

**Customer staff** (`customer_staff`) — same org scope as customer admin, for the limited day-to-day loop. **The admin/staff split is now defined and route-enforced** (Wave 3N.1): configuration surfaces (Settings, Users, Export, Tag requests, Templates, Import) require `customer_admin` server-side via `requireCustomerAdminOrgId`, while operational surfaces (Dashboard, Assets + detail, Submissions, Rentals, Analytics, and the staff scan workflow) allow both roles. Navigation visibility matches these guards. **Note (defense-in-depth gap, → A3.1):** this admin/staff distinction is enforced at the Next route/server-action layer, **not** independently at the database (RLS references role only for `platform_owner`) — see "Known security gaps" below and `docs/PILOT_LIMITATIONS.md`.

**Public scanner** — anonymous, no auth. Read-only access to published public content; insert-only access to form submissions and their media.

## Tenancy enforcement (RLS)

Every tenant-scoped table (`assets`, `qr_links`, `equipment_pages`, `documents`, `form_submissions`, `scan_events`, `activity_log`, `profiles`) carries `organization_id`. RLS policies resolve the caller's organization from their `profiles` row (via `auth.uid()`) and restrict rows accordingly:

- Authenticated non-owner users may read/write rows only where `organization_id` matches their own profile's organization.
- `platform_owner` policies bypass the org match (a role check in the policy) so the owner can operate across organizations.
- A request for another organization's data returns zero rows / is rejected by the policy — denial happens in Postgres, not in application code.

RLS is enabled on all tenant tables before any data is loaded. No table relies solely on application-layer filtering.

## Public access rules

The public equipment page is served by an anonymous role. It may read:

- An `equipment_pages` row only where `is_published = true` and the parent asset's `public_status` permits public display.
- The parent asset's public-safe fields only (name, code, category, photo, support contacts) — never `internal_notes`.
- `documents` only where `visibility = 'public'`.
- Organization public-branding fields only (name/label, logo, color, support contact, powered-by label, website) — never billing fields.

The public role may **insert** into `form_submissions` and upload associated media, but has **no select/update/delete** on submissions. It cannot list storage objects.

## Submissions and uploads

Public users submit forms with the asset prefilled and not editable; the server validates that the asset/QR exists and derives `organization_id` server-side rather than trusting client input. Media uploads:

- Are restricted by allowed file types and a maximum file size.
- Are stored in organization-scoped storage paths (e.g. `org/{organization_id}/...`).
- Are not publicly listable; public users can upload through forms only and cannot enumerate or read other files.
- Admin users can view uploads only for their own organization.

Anti-abuse (current state): a **honeypot** field (fixed internal `company_website`) is implemented on public forms. **Shared-store rate limiting is not yet implemented** — it is Phase A4 (must not be instance-local in-memory). More robust abuse handling and orphaned-upload cleanup are also A4.

## Privacy / data minimization

Raw IP addresses are not stored. `scan_events.ip_hash` holds a hashed or truncated value sufficient for basic dedup/analytics. Internal notes, private documents, billing fields, and submissions never appear on public surfaces. The activity log records actor, action, and entity for auditability without storing sensitive payloads in plaintext where avoidable.

## Role enforcement at the database (Phase A3.1, migration 0032)

`customer_admin` / `customer_staff` are application roles in `profiles.role`; both authenticate as the Postgres
`authenticated` role. Until migration 0032 **no policy read `profiles.role` except to test `= 'platform_owner'`**, so
customer write policies were pure org-membership checks. 0032 adds:

- **`current_profile_role()`** and **`is_current_org_admin()`** — SECURITY DEFINER, `STABLE`, `search_path` locked,
  scope derived from `auth.uid()` only; disabled profiles and suspended orgs fail closed (same gating as
  `current_org_id()`).
- **`protect_profile_privileged_fields`** (BEFORE UPDATE on `profiles`) — makes `role`, `organization_id`, and
  `status` immutable for the caller. This closes a **critical self-escalation**: `profiles_update` (0001) validated
  only *which row* was written, so any authenticated user could set their own `role` to `platform_owner` via
  PostgREST and gain cross-tenant access. Carve-outs: platform owner; trusted server context (`auth.uid() is null` —
  service-role/definer, unreachable by anon under `profiles_update`); and the narrow invite→set-password
  self-activation (`invited` → `active` with role/org unchanged).
- **Role-aware WRITE policies** on `organizations`, `tag_requests`, `tag_request_assets`,
  `equipment_page_templates`, `inspection_templates`, `inspection_category_defaults` — customer writes now require
  `is_current_org_admin()`. **Every SELECT predicate is unchanged**, because staff operational reads depend on them
  (`organizations` for `/dashboard`'s active-org check, `tag_requests` for briefing counts).

**Untouched by design:** `assets`, `asset_rental_sessions`, `form_submissions`, and storage — the staff outbound/return
RPCs (`start_outbound_rental`, `complete_staff_return`) are **SECURITY INVOKER**, so staff INSERT/UPDATE rights on
those tables are load-bearing.

**Server layer (independent of the DB):** every administrative server action now calls `requireCustomerAdmin(OrgId)`.
Next server actions are independently invocable POST endpoints, so an admin-only *page* is not a guard for the action
it renders.

## Known security gaps (Phase A1 record — status updated in A3.1)

Recorded accurately for Phase A hardening. **Cross-tenant isolation is enforced in Postgres (RLS): every tenant
policy is `is_platform_owner() or organization_id = current_org_id()`, and `current_org_id()` returns NULL for a
disabled profile or suspended org. None of the items below is a cross-tenant leak** — they are intra-tenant /
defense-in-depth items scoped to a single organization's own data. Details + severities in
`docs/PILOT_LIMITATIONS.md`.

1. **Route guards enforce the approved admin/staff navigation policy.** The `customer_admin` vs `customer_staff`
   split is enforced at the Next route/server-action layer (`requireCustomerAdminOrgId`), and nav visibility matches.
2. ~~Same-organization write policies do not distinguish admin from staff.~~ **FIXED in A3.1** (migration 0032 —
   role-aware write policies + admin guards on every administrative server action). Active in the app now; the DB
   backstop activates on `db push`.
3. **Team/user management uses a sanctioned server-only service-role path with TypeScript authorization.**
   **Narrowed in A3.1:** an explicit owner/admin gate runs before any service-role client is created, privileged
   profile lookups are org-scoped for non-owners, `setUserRole` no longer uses the service role at all, and a
   half-created invite is now compensated. Service role remains only for the two `auth.admin.generateLink` calls and
   the deliberately cross-tenant email-collision probe. **Remaining for A3.2:** a caller-aware SECURITY DEFINER RPC
   for the customer-admin profile insert/status writes (`profiles_insert` is owner-only, so they cannot yet use the
   RLS client).
4. ~~`/dashboard/submissions/export` bypasses the export flags.~~ **FIXED in A3.1** — the inbox CSV is now
   customer-admin-only and requires `customer_exports_enabled` AND `export_submissions_enabled`; the button is hidden
   unless both hold. Note: it returns a richer, PII-bearing payload than the 6-column `submissions` export while
   sharing one flag — converging the two payloads is a product follow-up.
5. **`public-assets` bucket objects are public by URL.** Cover images are readable by anyone with the (UUID) object
   path regardless of the owning asset's `public_status`/`archived_at` (the bucket is declared public; unlike
   `documents`, its read policy does not join to asset visibility). **Accepted pilot limitation — do not place
   sensitive information in `public-assets`.**

## Things explicitly NOT in the MVP security scope

No SSO/SAML, no granular custom permission roles beyond the three above, no field-level encryption beyond Supabase defaults, no automated link/file virus scanning (basic type/size checks only), and no formal compliance certification work. These are noted for future consideration, not MVP commitments.
