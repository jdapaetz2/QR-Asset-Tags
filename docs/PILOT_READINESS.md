# Pilot Readiness — Security Audit (Sprint 7A)

Pre-pilot security pass over the AssetTag QR MVP: route access, service-role
usage, RLS, storage policies, upload guardrails, scan privacy, and tenant
isolation. **Result: no code-level security defect found.** Two pre-existing,
already-accepted anti-abuse items are deferred and recorded below.

## Audit results (all PASS)

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

## Deferred anti-abuse risks (not data leaks)

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
   tightening (validate the org segment, or route uploads through a server action
   that checks a resolved public asset) is deferred with rate limiting.

## Operator prerequisites before pilot

- Apply all migrations including `0005_documents_storage.sql` and
  `0006_documents_public_read.sql` (`supabase db push`) — hosted public documents
  will not surface until `0006` is live.
- Set `SCAN_IP_HASH_SALT` to a strong secret (scan IP hashing depends on it).
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is never imported by app code
  and must never reach the browser.

## Verdict

The MVP's access-control and data-isolation posture is sound for a controlled
pilot. The two deferred items are abuse/cost concerns, not confidentiality or
tenant-isolation gaps, and should be addressed as a post-pilot fast-follow.
