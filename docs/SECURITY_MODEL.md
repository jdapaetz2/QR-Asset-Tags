# Security Model — AssetTag QR (MVP)

Security is multi-tenant from day one and enforced in the database with Supabase row-level security (RLS), not just in the UI. The UI may hide things, but the database is the boundary that actually protects data.

## Principles

The system must support multi-tenant organization isolation from the first migration. Customer admins can only access their own organization's data. Public QR pages expose only published public content and require no login. Public users can create form submissions but cannot list or read them. Public users can upload media only through form-submission flows. Admin users can view submissions only for their own organization. The platform owner can manage all organizations. Private notes, internal notes, billing info, and submissions are never shown on public pages.

## Roles and access

**Platform owner** (`platform_owner`) — full access across all organizations: create organizations and admin users, manage any org's assets, view all QR links, view usage/submissions across organizations.

**Customer admin** (`customer_admin`) — full access scoped to a single organization: manage org profile, assets, equipment pages, documents, QR links, and review that org's submissions.

**Customer staff** (`customer_staff`) — same org scope as customer admin, intended for limited day-to-day use. In MVP this can mirror admin permissions or be lightly restricted; exact limits are an open question (see `docs/OPEN_QUESTIONS.md`).

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

Anti-abuse: include basic protection from the start — rate limiting on submission endpoints and/or a honeypot field and simple anti-spam mechanism. More robust abuse handling can come later.

## Privacy / data minimization

Raw IP addresses are not stored. `scan_events.ip_hash` holds a hashed or truncated value sufficient for basic dedup/analytics. Internal notes, private documents, billing fields, and submissions never appear on public surfaces. The activity log records actor, action, and entity for auditability without storing sensitive payloads in plaintext where avoidable.

## Things explicitly NOT in the MVP security scope

No SSO/SAML, no granular custom permission roles beyond the three above, no field-level encryption beyond Supabase defaults, no automated link/file virus scanning (basic type/size checks only), and no formal compliance certification work. These are noted for future consideration, not MVP commitments.
