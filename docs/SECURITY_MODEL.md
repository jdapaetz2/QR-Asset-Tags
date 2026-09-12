# Security Model — Mulemark (MVP)

Security is multi-tenant from day one and enforced in the database with Supabase row-level security (RLS), not just in the UI. The UI may hide things, but the database is the boundary that actually protects data.

## Principles

The system must support multi-tenant organization isolation from the first migration. Customer admins can only access their own organization's data. Public QR pages expose only published public content and require no login. Public users can create form submissions but cannot list or read them. Public users can upload media only through form-submission flows. Admin users can view submissions only for their own organization. The platform owner can manage all organizations. Private notes, internal notes, billing info, and submissions are never shown on public pages.

## Roles and access

**Platform owner** (`platform_owner`) — full access across all organizations: create organizations and admin users, manage any org's assets, view all QR links, view usage/submissions across organizations.

**Customer admin** (`customer_admin`) — full access scoped to a single organization: manage org profile, assets, equipment pages, documents, QR links, and review that org's submissions.

**Customer staff** (`customer_staff`) — same org scope as customer admin, for the limited day-to-day loop. **The admin/staff split is now defined and route-enforced** (Wave 3N.1): configuration surfaces (Settings, Users, Export, Tag requests, Templates, Import) require `customer_admin` server-side via `requireCustomerAdminOrgId`, while operational surfaces (Dashboard, Assets + detail, Submissions, Rentals, Analytics, and the staff scan workflow) allow both roles. Navigation visibility matches these guards. **The same split is now enforced independently at the database** (Phase A3.1, migration 0032 — applied): administrative write policies require `is_current_org_admin()`, so a `customer_staff` cannot write organization config, tag requests, or templates via direct PostgREST. See "Role enforcement at the database" below.

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

The public role may **insert** into `form_submissions`, but has **no select/update/delete** on submissions. Since migration 0037 it has **no storage write policy**: public photos reach the private `submissions` bucket only through server-issued, path-bound signed upload URLs. It cannot list or read storage objects.

Browsers without JavaScript are served copies of the public scan and form routes under `/nojs/…` (reached through
the `?nojs=1` rewrite in `lib/public/nojs.ts`; `noindex`). They run the same page code — the same
`resolvePublicEquipment` eligibility and the same form actions — only without a streamed loading skeleton, and the
scan copy records no scan (the visit's first request already did).

Admin hosted documents (up to 50 MB, private `documents` bucket) and asset cover images (up to 5 MB, public bucket)
also upload **browser → storage directly** (`lib/storage/direct-upload.ts`), because both can exceed Vercel's 4.5 MB
request limit. `prepareDocumentUpload` / `prepareCoverUpload` require a signed-in user with an organization, an asset
visible under RLS and valid declared metadata, then sign ONE server-built path with the user's **own RLS client** — so
the org storage policies (0002, 0005) still decide the organization. The save (`createDocument` / `updateAsset`)
re-parses the claimed path for this organization and asset and verifies the stored object (type, extension, size,
leading bytes; `lib/storage/verify-object.ts`) before any row references it; a failing object is deleted. **No
service-role importer was added.** An unfinalized document object is never publicly readable (0006 requires a public
`documents` row).

## Submissions and uploads

Public users submit forms with the asset prefilled and not editable; the server validates that the asset/QR exists and derives `organization_id` server-side rather than trusting client input. Media uploads:

- Are restricted by allowed file types and a maximum file size — checked on the declared metadata before an upload
  URL is issued, enforced again by the bucket (JPEG/PNG/WebP, 10 MB; migration 0037), and re-verified on the stored
  object (size, stored type, magic bytes) before any row references it.
- Go **browser → storage directly** when JavaScript runs, because Vercel refuses Function request bodies over 4.5 MB
  before the app runs. A prepare action runs the honeypot, rate limiter, live tag resolution and caps, then mints one
  signed upload URL per photo, bound to one server-built path
  (`org/{org}/asset/{asset}/submission/{id}/{uuid}.{ext}`), valid 2 h, no overwrite. The submit action carries only
  text plus the claimed paths; the server re-derives the prefix, lists it, verifies each claimed object, deletes
  objects that fail verification and, after the row commits, any unclaimed extras (`lib/forms/media-verify.ts`).
  Staff flows mint with their own RLS client, so the org upload policy still applies. Without JavaScript the form
  posts small photos (under 4 MB in total) through the server action.
- Are stored in organization-scoped storage paths (e.g. `org/{organization_id}/...`).
- Are not publicly listable; public users can upload through forms only and cannot enumerate or read other files.
- Admin users can view uploads only for their own organization.

Anti-abuse: a **honeypot** field (fixed internal `company_website`) is the first layer, plus a **shared-store
rate limiter** (Phase A4). Public writes (damage/support/return/acknowledgement) run a preflight limit check
**before** any resolve/upload/insert, so a limited request incurs no storage/DB/notification cost and returns a
generic message that reveals no asset/org state. The limiter is a private Postgres fixed-window counter
(`rate_limit_counters`) driven by an atomic SECURITY DEFINER RPC `rate_limit_touch`, callable by **service_role
only** (trusted server code in `lib/ratelimit/limiter.ts`) — production-safe across serverless instances where
process memory would not be. Keys are `(action, salted-IP-hash, salted-short-code-hash)` — **never a raw IP**,
NAT-friendly (per short code), stricter for media-bearing writes; thresholds are centralized in
`lib/ratelimit/policy.ts`. **Scans stay unlimited** (product rule). Failed uploads are cleaned up best-effort
(`lib/forms/cleanup.ts`), a client idempotency token makes a rapid resubmit a PK no-op, and an operator
abandoned-upload tool (`scripts/cleanup-orphan-media.mjs`: service role, report by default, submissions + documents +
covers + logos, target stated twice and verified, `--confirm=<target>:<count>` plus a production acknowledgement to
delete, per-object re-check, never scheduled) is the backstop. See `docs/ORPHAN_MEDIA_CLEANUP.md`.

## Privacy / data minimization

Raw IP addresses are not stored. `scan_events.ip_hash` holds a hashed or truncated value sufficient for basic dedup/analytics. Internal notes, private documents, billing fields, and submissions never appear on public surfaces. The activity log records actor, action, and entity for auditability without storing sensitive payloads in plaintext where avoidable.

**Notification logs (Phase A5)** emit only redacted, structured `[notifications]` records: event, outcome, org id, reference, the recipient **domain** and a **redacted** recipient (`r***@domain`), and provider metadata (id/status/attempts/failure class). They never contain the full recipient address, the message body, a media URL (the email builders never include media), the Resend API key, the auth header, or a raw IP. Email is always best-effort and never blocks a submission.

## Role enforcement at the database (Phase A3.1, migration 0032 — APPLIED)

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

## Tag request internal columns (migration 0035)

`tag_requests.production_notes`, `platform_viewed_at` and `platform_viewed_by_profile_id` are the platform owner's
working data. Until 0035 they were protected only by the app not selecting them: `authenticated` held table-wide
SELECT and the select policy is organization-scoped, so any customer admin or staff member could read them for their
own organization through the API. RLS cannot restrict columns, so 0035 uses privileges:

- **Column-level SELECT.** Table-wide SELECT is revoked from `authenticated` and re-granted on every column except
  those three. **A column added to `tag_requests` later is not readable by customers until it is added to that
  grant.** RLS policies and INSERT/UPDATE/DELETE privileges are unchanged.
- **Owner-only functions.** The platform owner uses the same `authenticated` role, so the owner console reads the
  internal fields through `owner_tag_request_internal(uuid)` and marks requests viewed through
  `mark_tag_request_viewed(uuid)` — SECURITY DEFINER, `search_path` locked, gated on `is_platform_owner()`, no rows /
  `false` for anyone else, anon execute revoked. Service-role reach is unchanged.
- **Insert protection.** `protect_tag_request_insert` (BEFORE INSERT) coerces `status` to `requested`, clears
  `production_notes`, `delivered_at`, `completed_at` and the viewed markers, and sets `requested_by_profile_id` to the
  caller — for every caller except the platform owner and trusted server context (`auth.uid() is null`), the same
  carve-outs as `protect_profile_privileged_fields`.
- **Order matters.** `REVOKE` of a table privilege also removes that privilege's column-level grants, so the revoke
  always precedes the column grant.
- **Local test parity.** `tests/security/setup/grants.ts` re-grants hosted default privileges after migrations, so it
  re-runs 0035's own `local-parity` revoke+grant block verbatim; any future migration that revokes from
  `authenticated` must be added there too.

## Known security gaps (Phase A1 record — status updated in A3.1)

Recorded accurately for Phase A hardening. **Cross-tenant isolation is enforced in Postgres (RLS): every tenant
policy is `is_platform_owner() or organization_id = current_org_id()`, and `current_org_id()` returns NULL for a
disabled profile or suspended org. None of the items below is a cross-tenant leak** — they are intra-tenant /
defense-in-depth items scoped to a single organization's own data. Details + severities in
`docs/PILOT_LIMITATIONS.md`.

1. **Route guards enforce the approved admin/staff navigation policy.** The `customer_admin` vs `customer_staff`
   split is enforced at the Next route/server-action layer (`requireCustomerAdminOrgId`), and nav visibility matches.
2. ~~Same-organization write policies do not distinguish admin from staff.~~ **FIXED in A3.1** (migration 0032 —
   role-aware write policies + admin guards on every administrative server action). **Both layers are live:** 0032 is
   applied on the linked remote (operator-verified).
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
   sensitive information in `public-assets`.** **A3.2 confirms this is safe by construction:** an executed storage
   test asserts `public-assets` is the only public bucket (submissions/documents stay private), and a structural
   test (`lib/security/service-role.test.ts`) asserts the bucket name is referenced only by the cover-image and
   org-logo helpers — no submission or document media is ever written there.

## Executed verification (Phase A3.2)

The boundaries above are no longer only *asserted in source* — they are **executed against a real Postgres/Auth/
Storage stack**. `npm run test:security` signs in as each role and proves, through PostgREST, that: cross-tenant
reads return zero rows on every tenant table; `customer_staff` writes to config tables are denied while its
operational reads/writes still work; `profiles.role`/`organization_id`/`status` self-escalation is coerced away
(the 0032 trigger, executed); commercial/export flags cannot be mutated by a customer; disabled profiles and
suspended orgs are locked out; every privileged RPC refuses `anon` and a wrong-org caller; and the storage
policies keep submissions/documents private while `public-assets` is public by URL. The suite runs nightly and on
every PR (`.github/workflows/security.yml`), never against a hosted project (a loopback guard aborts otherwise).
See `docs/SECURITY_TESTING.md` for the executed/structural/manual split.

## Service-role inventory (Phase A3.2 audit)

The service-role client (`lib/supabase/admin.ts`, `import "server-only"`) bypasses RLS, so its reach is kept small
and audited. Only these modules may import it — enforced by `scripts/verify-production-config.mjs`
(`service-role-allowlist`) and `lib/security/service-role.test.ts`; a new importer fails CI until reviewed here.

| Module / function | Trusted context | Authorization before the call | Row scope | Why RLS is insufficient | Failure / rollback | Narrowable? |
|---|---|---|---|---|---|---|
| `lib/notifications/notify.ts` — `notifySubmission`, `notifyTagRequestStatus` | Triggered by public (anon) submission intake and by status changes | The triggering event already happened; these only READ | The `organizations` row by id (notification settings); since D1 the committed submission by id, checked against the scheduled organization/asset/form type, and its asset scoped to the organization; since D4, read-only `info`/`download` of at most three of **that submission's own** image objects in the private `submissions` bucket (strict path re-checked against the row immediately before each read — no signed URL, no write, no delete) | The anon intake context cannot read the private notification columns, the submission back, or private storage; no user session exists | Swallows its own errors (a notification must never break the write that triggered it); any preview failure leaves a text-only email | No — read-only, single records and a bounded object set |
| `lib/team/actions.ts` — `inviteUser`, `regenerateInvite`, `setUserStatus` | `"use server"` actions | Explicit `isTeamManager(actor.role)` gate BEFORE any admin client; `canManageMember`; org-suspension gate; lookups org-scoped for non-owners | `auth.admin.generateLink` (the invited user); a deliberately cross-tenant email-collision probe; the invited/updated `profiles` row | Creating an `auth.users` row is impossible under RLS; `profiles_insert` is owner-only, so a customer admin's invite/status write cannot use the RLS client yet | Half-created invite is compensated (`auth.admin.deleteUser`) | Partially — see A3.2 note below |
| `lib/ratelimit/limiter.ts` — `checkRateLimit` | Public-intake server actions/cores | Runs after the honeypot, before any resolve/upload/insert; keys are server-derived (salted IP + short-code hash), never client input | Calls `rate_limit_touch` on a private counter table; no tenant rows touched | The limiter table + RPC are execute-granted to `service_role` only, so anon/authenticated can neither read counters nor probe/poison another key | Fail-open on infra error (a limiter hiccup must never block a real renter); logged | No — the private counter is the minimal footprint |
| `lib/forms/upload-intake.ts` — `publicSubmissionBucket` | Public damage/support/return prepare and submit cores (`lib/forms/upload-prepare.ts`, `lib/forms/submit.ts`, `lib/inspections/submit.ts`) | Prepare: honeypot, rate limiter, live public tag resolution and declared caps, all before the handle is created. Submit: the organization and asset come from the resolved tag and the submission id is validated — client paths are only claims to verify | `submissions` objects under exactly **one** `org/{org}/asset/{asset}/submission/{id}/` prefix: every path is asserted against it (`lib/forms/media-verify.ts`) before a signed upload is minted or an object is listed, head-read (60 s signed read of 12 bytes), uploaded (no-JavaScript path, no overwrite) or removed. No table rows | Since 0037 anon has no storage policy at all, yet the public flow must mint signed uploads, verify the stored bytes and delete invalid or failed objects | Only objects that fail verification are deleted before the insert; unclaimed ones only after the row commits; nothing on a duplicate, a missing object or a storage error; abandoned uploads fall to the 48 h orphan tool | No — one submission prefix per request |
| `lib/supabase/admin.ts` | Defines the client | n/a | n/a | n/a | n/a | n/a |
| `lib/notifications/digest-store.ts` — daily return-exceptions summary (D3B) | Only from `app/api/cron/return-digest/route.ts`, after the route verified Production and the `CRON_SECRET` bearer (constant-time) | The cron invocation is the authorization; there is no user session, and the ledger is readable by no client role | Active organizations with a return mode other than `off` (id, name, notification address, mode); that organization's return checklists in the summary window; asset code/name for those, organization-scoped; the private `notification_digest_runs` ledger | No user session exists; the ledger is service-role-only by design (migration 0036) | Per-organization isolation; a failed send never advances the cursor; route refusals are a bare 401 | Writes only the private run ledger (claim + completion) |

**Still queued (not this slice):** a caller-aware SECURITY DEFINER RPC that would take the customer-admin
profile insert/status writes off the service role entirely (`profiles_insert` is owner-only today). That is a
behavior change with its own migration; the guardrails above keep the current path safe in the meantime.
`setUserRole` was already moved off the service role in A3.1 (platform-owner-only; `is_platform_owner()` satisfies
`profiles_update`).

## Environment isolation (Phase B1 — in progress)

**The finding (A7):** every Vercel environment variable is a single row scoped `Production, Preview`, so
a preview deployment receives the **production Supabase URL, anon key, and service-role key**. Any
preview, from any branch, can read and write real data with full RLS bypass. Current blast radius is
demo data only (no customers yet), which is why this is a scheduled fix rather than an incident — but it
must land before broader preview QA, demos, or external pilot use.

**B1A (done, repo-side):** the target a destructive script may touch is now resolved by one tested
module, `scripts/lib/env-target.mjs`:

- classification is by **project ref / host only** — never by a human-readable project name;
- the live production ref is a committed constant, so staging tooling refuses production **by name**
  (a Supabase project ref is public by construction — it is the hostname inside
  `NEXT_PUBLIC_SUPABASE_URL`, compiled into the browser bundle);
- **ambiguity fails closed to production** — an unrecognised remote ref is treated as real, not safe;
- staging requires an explicitly declared `STAGING_SUPABASE_REF`; without one, nothing is staging;
- errors carry host and ref only. The module never accepts key material, so it cannot leak any.

Enforced by `npm run verify:{local,staging,production}-target`, the Supabase CLI linked-project guard
(`scripts/check-linked-project.mjs`), and an explicit `MULEMARK_TARGET` precondition on both the A6.3 QA
scripts and the staging seeder. `db reset` is pinned to `--local`; `db reset --linked` and
`migration repair` are documented as forbidden.

**B1B (operator):** create the staging Supabase project and re-scope the Vercel Preview variables —
[`STAGING_ENVIRONMENT_SETUP.md`](STAGING_ENVIRONMENT_SETUP.md). Until then, preview still shares
production.

## Things explicitly NOT in the MVP security scope

No SSO/SAML, no granular custom permission roles beyond the three above, no field-level encryption beyond Supabase defaults, no automated link/file virus scanning (basic type/size checks only), and no formal compliance certification work. These are noted for future consideration, not MVP commitments.
