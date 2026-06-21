# MVP Pilot Readiness — AssetTag QR

Go/no-go reference for running a controlled pilot. It combines the functional
readiness checklist, the Sprint 7A security audit results, and the known MVP
limitations so expectations are honest. Pair with
[ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md) and
[PILOT_DEMO_SCRIPT.md](PILOT_DEMO_SCRIPT.md).

> **Business rule:** QR/tag production is controlled by the AssetTag QR platform
> admin (`platform_owner`) only, via `/owner/production`. Customer admins manage
> content and submissions but never get production exports.

## 1. Functional go/no-go checklist

- [ ] **Public QR page works** — `/t/{short_code}` renders branding, asset info,
      content sections, support contact, and action buttons for a published, public asset.
- [ ] **Forms work** — damage / support / return submit with media at
      `/forms/{short_code}/{damage,support,return}`; asset is prefilled and locked.
- [ ] **Submissions visible to the right org only** — customer admin sees their org's
      submissions at `/dashboard/submissions`; other orgs cannot.
- [ ] **Documents visible** — public manuals/guides open from the public page; private
      docs and `storage_path` never leak.
- [ ] **Owner QR production exports work** — platform admin can export QR SVG, SVG
      sheet, CSV, and production sheet from `/owner/production` with a production base URL.
- [ ] **Analytics works** — `/dashboard/analytics` (org) and `/owner/analytics` (all orgs)
      show scan/submission counts.
- [ ] **Auth / tenant isolation holds** — `requireRole` gates owner routes; RLS scopes
      every tenant table; a customer admin cannot reach `/owner*` or another org's data.
- [ ] **Storage privacy holds** — `submissions`/`documents` buckets private; only
      cover images are public-read; public docs served via short-lived signed URLs.

## 2. Security posture (Sprint 7A audit)

Pre-pilot security pass over route access, service-role usage, RLS, storage
policies, upload guardrails, scan privacy, and tenant isolation.
**Result: no code-level security defect found.** Two pre-existing, already-accepted
anti-abuse items are deferred (section 3).

| Area | Finding |
| --- | --- |
| Route access | `proxy.ts` matches `/dashboard/:path*` + `/owner/:path*` and redirects logged-out users to `/login?next=…` (`lib/supabase/proxy.ts`). Public `/`, `/t/[shortCode]`, `/forms/*` are intentionally unmatched. |
| Owner-only tools | Every owner route/page calls `requireRole(ROLES.PLATFORM_OWNER)` (production page, `qr.svg` GET+POST, `qr-sheet.svg`, `export.csv`, `sheet`, `owner`, `owner/analytics`). A logged-in `customer_admin` clears the proxy but is bounced by page-level `requireRole`. |
| Service-role | `createAdminClient` (`lib/supabase/admin.ts`) is imported nowhere. Public flow uses the anon client (`createPublicClient`); admin/owner use the RLS server client. |
| RLS | Every tenant table (`organizations`, `profiles`, `assets`, `qr_links`, `equipment_pages`, `documents`, `form_submissions`, `scan_events`, `activity_log`) has an org-scoped `_rw` policy with `is_platform_owner()` bypass. Anon is insert-only on `form_submissions`/`scan_events`, and read-only on published/public content. No anon select on submissions. |
| Storage | `submissions` and `documents` buckets are private; `public-assets` is public-read (cover images only). Anon reads a `documents` object only when it backs a `visibility='public'` doc of a `public_status='public'` asset (`0006_documents_public_read.sql`). Private content is served via short-lived signed URLs (3600s); `lib/public/documents.ts` never returns `storage_path`. |
| Uploads | Server-side type (JPG/PNG/WebP), size (10 MB), and count (5) checks in `lib/forms/media.ts`; media optional; opaque object names; honeypot redirects silently with no row written; storage path built server-side. `form_submissions` stores no IP. |
| Scan privacy | `lib/scan/record.ts` stores only a salted `sha256` `ip_hash` (truncated), never a raw IP. Analytics selects only `asset_id, scanned_at`. |
| Tenant isolation | Cross-org asset/submission/document IDs return 404 via RLS + `notFound()` on `maybeSingle()`. Enforced in Postgres, not the UI. |

### Operator prerequisites before pilot

- Apply all migrations including `0005_documents_storage.sql` and
  `0006_documents_public_read.sql` (`supabase db push`) — hosted public documents
  will not surface until `0006` is live.
- Set `SCAN_IP_HASH_SALT` to a strong secret (scan IP hashing depends on it).
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is never imported by app code
  and must never reach the browser.

### Verdict

The MVP's access-control and data-isolation posture is sound for a controlled
pilot. The deferred items below are abuse/cost concerns, not confidentiality or
tenant-isolation gaps, and should be addressed as a post-pilot fast-follow.

## 3. Deferred anti-abuse risks (not data leaks)

1. **Public-form rate limiting** — not implemented; the honeypot is the only
   anti-spam control. Serverless rate limiting needs a shared store (edge KV /
   Upstash / DB), so it is not a small low-risk change and is deferred to a
   post-pilot fast-follow. Impact: a determined actor could spam submissions; no
   data is exposed.
2. **Permissive anon insert on the `submissions` storage bucket** — the
   `submissions public insert` policy (`0002_storage.sql`) lets the anon role PUT
   under any `org/<id>/…` path without verifying the org exists. Anon **cannot read
   it back** (no anon select on the bucket), and the bucket MIME allow-list + size
   cap apply, so this is a storage-spam/cost vector, **not a data leak**. A safe
   tightening is deferred with rate limiting.

## 4. Known MVP limitations

Be clear about the boundary during pilots. The MVP intentionally does **not** include:

- **No billing** — Stripe is deferred; billing fields exist but are not wired up;
  the pilot is billed manually.
- **No rental booking / reservation integration.**
- **No CMMS / work orders / maintenance scheduling.**
- **No native mobile app** — the public page is mobile web; renters scan and go.
- **No offline mode** — the public page requires connectivity.
- **No automated self-signup** — organizations and first admins are created manually
  by the platform admin.
- **No automated link checking** — document link status is set/checked manually.
- **No advanced QR visual polish** — branded QR is optional and trades robustness for
  branding; scan-safe black-on-white is the default.
- **No direct laser/engraver integration** — production outputs (SVG/CSV/sheet) are
  handed off; tags are etched separately.
- **No advanced rate limiting** beyond the current honeypot and upload guardrails
  (see section 3).
- **Pre-use inspection form deferred** — damage, support, and return checklist are in
  scope; a separate pre-use inspection is not.

See [NON_GOALS.md](NON_GOALS.md) for the full non-goals list.
