# Data Model — AssetTag QR (MVP)

Postgres on Supabase. Every tenant-scoped table carries `organization_id` and is protected by row-level security from the first migration (see `docs/SECURITY_MODEL.md`). All tables use a UUID primary key and `created_at`/`updated_at` timestamps unless noted.

## Entity relationships

```
organizations 1──* profiles
organizations 1──* assets
organizations 1──* qr_links        assets 1──* qr_links
organizations 1──* documents       assets 1──* documents
organizations 1──* form_submissions assets 1──* form_submissions
organizations 1──* scan_events     assets 1──* scan_events   qr_links 1──* scan_events
organizations 1──* activity_log
assets 1──1 equipment_pages
```

An asset may have more than one `qr_link` over its life, so QR routing is kept in its own table rather than on `assets`.

## Tables

### organizations
Represents each customer company.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| name | text | |
| slug | text | unique; used in URLs/admin |
| logo_url | text | nullable |
| primary_color | text | hex; branding placeholder |
| support_phone | text | nullable |
| support_email | text | nullable |
| website_url | text | nullable |
| powered_by_label | text | temporary/generic branding |
| status | text | e.g. active / suspended |
| plan_name | text | manual billing (no Stripe in MVP) |
| monthly_fee | numeric | manual billing |
| asset_limit | int | soft cap |
| created_at / updated_at | timestamptz | |

### profiles
Extends Supabase auth users.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| auth_user_id | uuid | FK → auth.users |
| organization_id | uuid | FK → organizations (nullable for platform_owner) |
| name | text | |
| email | text | |
| role | text | `platform_owner` / `customer_admin` / `customer_staff` |
| created_at / updated_at | timestamptz | |

Roles: **platform_owner** (manages all orgs), **customer_admin** (manages own org), **customer_staff** (own org, limited).

### assets
Each physical rental asset.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| asset_code | text | e.g. EXCAVATOR-017; unique per org |
| asset_name | text | |
| category | text | e.g. Mini Excavator |
| make | text | nullable |
| model | text | nullable |
| serial_number | text | nullable |
| year | int | nullable |
| public_status | text | controls public visibility |
| cover_image_url | text | nullable |
| support_phone_override | text | nullable; falls back to org |
| support_email_override | text | nullable; falls back to org |
| internal_notes | text | **private — never public** |
| created_at / updated_at | timestamptz | |

### qr_links
Permanent QR routing layer. The QR encodes the platform URL, not a third-party link.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| asset_id | uuid | FK → assets |
| short_code | text | unique; used in `/t/{short_code}` |
| public_url | text | full permanent URL, e.g. https://example.com/t/demo-ex017 |
| status | text | active / disabled |
| last_scanned_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | |

### equipment_pages
Public page content for each asset (1:1 with asset).

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| asset_id | uuid | FK → assets (unique) |
| headline | text | |
| quick_start_text | text | |
| safety_notes | text | |
| fuel_power_notes | text | |
| return_notes | text | |
| troubleshooting_notes | text | |
| emergency_notes | text | |
| is_published | bool | only published content is public |
| created_at / updated_at | timestamptz | |

### documents
Manuals, videos, OEM links, hosted files, startup/safety/return content.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| asset_id | uuid | FK → assets |
| title | text | |
| document_type | text | `manual` / `startup_guide` / `safety_sheet` / `video` / `return_checklist` / `other` |
| url | text | external link (nullable if hosted) |
| storage_path | text | Supabase storage path (nullable if external) |
| visibility | text | `public` / `private` |
| link_status | text | `unknown` / `ok` / `broken` / `needs_review` |
| last_checked_at | timestamptz | nullable; manual check in MVP |
| created_at / updated_at | timestamptz | |

Supports both hosted files and external links. Host as little as practical, but support uploads when a reliable link isn't available.

### form_submissions
Damage reports, support requests, return checklists, pre-use inspections.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| asset_id | uuid | FK → assets |
| form_type | text | `damage_report` / `support_request` / `return_checklist` / `pre_use_inspection` |
| submitted_by_name | text | |
| submitted_by_email | text | nullable |
| submitted_by_phone | text | nullable |
| submission_data_json | jsonb | form-specific fields |
| media_urls | text[] / jsonb | uploaded media references |
| status | text | `new` / `reviewed` / `resolved` / `archived` |
| created_at | timestamptz | |

Public users may **insert** rows but never select/list them. Field shapes per form are in `submission_data_json`; see the form requirements in `docs/PROJECT_CONTEXT.md`.

### scan_events
Basic scan analytics.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| asset_id | uuid | FK → assets |
| qr_link_id | uuid | FK → qr_links |
| scanned_at | timestamptz | |
| user_agent | text | |
| ip_hash | text | **hash or truncate — do not store raw IP** |
| referrer | text | nullable |
| device_type | text | derived |

### activity_log
Internal audit trail.

| Field | Type | Notes |
|---|---|---|
| id | uuid (pk) | |
| organization_id | uuid | FK → organizations |
| actor_user_id | uuid | FK → profiles/auth |
| action | text | |
| entity_type | text | |
| entity_id | uuid | |
| metadata_json | jsonb | |
| created_at | timestamptz | |

## Enum reference (string-typed in MVP)

- **role:** platform_owner, customer_admin, customer_staff
- **organization status:** active, suspended (account-level; owner-controlled — see below)
- **profile status:** active, invited, disabled (per-user lifecycle)
- **document_type:** manual, startup_guide, safety_sheet, video, return_checklist, other
- **visibility:** public, private
- **link_status:** unknown, ok, broken, needs_review
- **form_type:** damage_report, support_request, return_checklist, pre_use_inspection
- **submission status:** new, reviewed, resolved, archived

## Organization status & RLS helper behavior (Wave 5E.1)

`organizations.status` is `active` | `suspended`. **Suspension is a data-preserving,
owner-controlled pause** — no rows are deleted. Its effect is enforced through the SECURITY
DEFINER helper `current_org_id()`, which (migration 0019) returns the caller's org id **only when
`profiles.status <> 'disabled'` AND `organizations.status = 'active'`**. Because every
authenticated tenant policy is `organization_id = current_org_id()` (or `is_platform_owner()`), a
suspended org's customers lose scope on **all** tenant tables at once, even with a live session.
`is_platform_owner()` is org-independent, so the platform owner still manages a suspended org.
`organizations.status` is writable **only by the platform owner** — the `protect_commercial_fields`
trigger coerces it back for any other caller, so customers cannot self-reactivate. This is
distinct from per-user `profiles.status` (disable), and is **not** the seasonal "pause coverage"
billing concept.

## Analytics aggregation RPCs (Wave G.2, migration 0020)

The customer analytics page (`/dashboard/analytics`) does **not** fetch raw `scan_events` /
`form_submissions` rows and bucket them in JavaScript. It calls four read-only Postgres functions
that aggregate server-side and return compact results. This fixed two bugs: (a) PostgREST's 1000-row
cap silently truncated busy orgs' history, and (b) JS bucketed by **UTC day** while the yard's real
"today" is **America/Vancouver**, so a scan at Vancouver-evening (= next UTC day) fell outside the
window and vanished from the charts.

**Yard-local day buckets.** Every function derives its window from `America/Vancouver`, written as
`coalesce(<future org tz>, 'America/Vancouver')`. There is **no `organizations.timezone` column yet**
— it is deferred; when added, it slots into that `coalesce` without touching callers. There is no
timezone settings UI in this pass. `p_days` is clamped to `{7, 30, 90}`.

| Function (all take `p_days integer`) | Returns | Window |
|---|---|---|
| `analytics_daily_activity` | `(day date, scan_count bigint, new_submission_count bigint)` — exactly `p_days` local-day rows, zero-filled, ascending; `new_submission_count` = submissions created that local day with `status='new'` | range |
| `analytics_scans_by_category` | `(category text, scan_count bigint)` — `coalesce(nullif(btrim(category),''),'Uncategorized')`, desc | range |
| `analytics_submission_breakdown` | `(breakdown_type text, key text, count bigint)` — `status` rows + `form_type` rows, unioned | range |
| `analytics_asset_activity` | one row per **non-archived** asset: `scan_count` / `submission_count` / `damage_count` / `support_count` / `return_count` (range) + `last_scanned_at` and `open_submission_count` (unresolved = `new`+`reviewed`) — **all-time** | mixed |

**Count semantics (honest labels):** charts, category, breakdown, and per-asset scan/submission
counts are **range-scoped**. `last_scanned_at` is the genuine most-recent scan and
`open_submission_count` is the current operational backlog — both **all-time**, labeled as such in the
UI (the amber "N open" chip). The analytics "New" headline is range-scoped and is intentionally
distinct from the all-time nav badge. Readiness stays app-derived (it needs `qr_links` /
`equipment_pages` joins), so it is not returned by the RPC.

**Security.** All four are `SECURITY INVOKER` (not `DEFINER`), so RLS on `scan_events` /
`form_submissions` stays in force and the caller's identity is intact — anon has **no SELECT** on
those tables and cannot read anything. Tenant isolation is explicit: `organization_id =
current_org_id()` (NULL for a platform owner / suspended org / disabled profile → no rows), with RLS
as the defense-in-depth backstop. `search_path` is locked to `public` and every object is
schema-qualified. **No `ip_hash` / `user_agent` / `referrer` is ever selected or returned.** Execute
is **revoked from `public` and granted only to `authenticated`**, so anon/public cannot run them. No
service-role is used anywhere in the analytics path. Supporting indexes:
`scan_events (organization_id, scanned_at)` and `form_submissions (organization_id, created_at)`.
`seed.sql` is unchanged.

## Privacy / data-handling rules

`internal_notes`, private documents, billing fields, and all submissions are never exposed on public pages. `scan_events.ip_hash` must store a hashed or truncated value, never a raw IP. Uploaded media lives in organization-scoped storage paths and is not publicly listable. See `docs/SECURITY_MODEL.md` for the RLS policies that enforce all of this.
