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
| public_url | text | full permanent URL, e.g. https://example.com/t/EX017DEMO |
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
- **document_type:** manual, startup_guide, safety_sheet, video, return_checklist, other
- **visibility:** public, private
- **link_status:** unknown, ok, broken, needs_review
- **form_type:** damage_report, support_request, return_checklist, pre_use_inspection
- **submission status:** new, reviewed, resolved, archived

## Privacy / data-handling rules

`internal_notes`, private documents, billing fields, and all submissions are never exposed on public pages. `scan_events.ip_hash` must store a hashed or truncated value, never a raw IP. Uploaded media lives in organization-scoped storage paths and is not publicly listable. See `docs/SECURITY_MODEL.md` for the RLS policies that enforce all of this.
