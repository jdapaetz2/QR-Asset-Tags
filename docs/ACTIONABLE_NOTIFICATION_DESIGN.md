# Actionable Notification Design — Engineering Phase D

**Status: D0 designed (2026-09-10, `0415d81`) · D0.1 operator decisions locked (`70e6917`) · D1 built — the
saved-record brief, deterministic priority and actionable text-first email · D2 built — optional reported triage,
"Reported" admin labels and the truthful call-now confirmation · D3A built — independent urgent route, explicit
return modes, photo-preview switch, one recipient resolver with separate sends, bounded routing log fields and
status-change-only tag emails (migration 0034, applied to staging and Production 2026-09-11) · D3B built — daily
return-exceptions summary at 6 AM Pacific via two Hobby cron slots, run ledger (migration 0036), catch-up, quiet-day
skip; `089f707` promoted to Production 2026-09-11 (deployment `9FmryFHdh`), both cron entries registered,
`cron:verify-production` 3/3 (no token 401, wrong token 401, real token 200 `outside_window`), `smoke:production`
13 pass / 0 fail / 1 skip; first scheduled run 2026-09-12 13:00–13:59 UTC · D4 built — up to three bounded CID
inline photo previews (direct `sharp` 0.34.5, no migration): ranked damage first, metadata stripped, ≤ 640 px,
≤ 400 KB each, ≤ 1.2 MB total, built once per notification inside `after()`, text-only fallback on any failure; live
QA in §15. D5 is not built.** Branch
`pilot-credibility` (Vercel's Production branch is `main`: a push builds a Preview; Production = promote).
Production deployment `9FmryFHdh` → `mulemark.io`.

> **This is Engineering Phase D (actionable notifications).** It is *not* the business roadmap's
> "Phase D - Controlled pilots" in `roadmap.md`, which is untouched by this work.

**Objective.** A recipient should be able to understand what happened, how serious it appears, whether
anyone needs to act now, who to contact, and whether photographs exist — without first opening Mulemark.

**Companion objective.** Mulemark remains the canonical record and action surface. Email is a concise,
secure incident brief, not a second uncontrolled copy of the entire submission.

Every claim about current behaviour below was read from the repository on 2026-09-10 and carries a
`file:line` reference. Where something was not verified, it says so. Every operator decision is final and
recorded in §16; no open recommendations remain.

---

## Phase-wide guardrails

**Canonical record and reliability**

- The committed Mulemark submission is the system of record; email is a best-effort operational alert.
- The existing `after()` submission-notification architecture, provider idempotency, bounded retry, provider
  IDs, redacted logs and Preview dry-run are preserved.
- No durable general notification queue is added in Phase D.
- Notification success is never a condition of public submission success.
- The database record is never altered after email rendering to make an email look correct.
- Priority is never inferred from free text.

**Security and privacy — never**

- make the submissions bucket public, or put signed/expiring media URLs or storage object paths in email;
- include raw `submission_data_json`, or trust a notification summary supplied by the browser;
- log names, addresses, phone numbers, descriptions, paths, image bytes or email bodies;
- expose recipient addresses to one another, or let public users choose recipients;
- let customer staff change organization notification settings;
- weaken RLS, role enforcement, suspension checks or tenant isolation;
- add email links that change workflow state without authenticated authorization.

**Triage language.** Renter-provided values are always labelled *Reported equipment state*, *Reported response
need*, *Reported damage severity*, *Reported issue type*. Renter input is never described as a verified
mechanical, damage, recovery or safety determination. **Priority is a presentation and routing result — not a
safety certification — and never changes an asset's state.**

**Environment.** Preview never sends live email. Production variables stay Production-scoped. Before any
migration: prove the linked project, list migrations, dry run, show the exact plan, stop for approval. Never a
remote `db reset`, never migration repair, never a Production migration applied in the same unreviewed step
that creates it.

---

## Contents

1. Current-state audit
2. Data inventory
3. Missing data
4. Canonical projection
5. Priority rules
6. Event matrix
7. Wireframes
8. Photo strategy
9. Routing strategy and the daily return summary
10. Privacy and security rules
11. Backward compatibility
12. Phased file plan
13. Acceptance criteria
14. Explicit non-goals
15. Operator test matrix
16. Locked operator decisions

---

## 1. Current-state audit

### 1.1 Environment, verified read-only

| Item | Finding | How known |
|---|---|---|
| Branch / HEAD | `pilot-credibility` @ `ee29113` at D0, clean, synced with origin | `git status`, `git rev-parse` |
| Production deployment | `jswtabswl` (`dpl_AHM9…`), created 2026-09-09 16:20 PDT, CLI-deployed so it carries no git SHA. Its runtime tree equals HEAD: the only later non-documentation change is two `package.json` script registrations (C10). | `vercel inspect mulemark.io`, `git diff --stat 11063a1 HEAD` |
| Notification env | `RESEND_API_KEY` (secret), `NOTIFICATION_FROM_EMAIL`, `NOTIFICATION_REPLY_TO_EMAIL` — **Production only**; none on Preview | `vercel env ls production` (names only, values never printed) |
| Sender / Reply-To | `Mulemark <notifications@notify.mulemark.io>` / `support@mulemark.io` | `EMAIL_DELIVERABILITY_RUNBOOK.md` |
| Per-organization recipients on Production | **Not queried.** Reading them needs a service-role query that would print addresses. Last recorded state: the QA org recipient was cleared to NULL after C6.1. | — |
| Migration ledger | CLI is linked to **staging**; `supabase migration list` there shows **0001–0033 matched**. Production was last verified 0001–0033 in Phase A6.3 and was not re-verified (the CLI is deliberately not relinked). | `supabase migration list`, `MIGRATION_LEDGER.md` |
| Resend open/click tracking | **Still unrecorded** — a provider-side setting the app cannot assert | `EMAIL_DELIVERABILITY_RUNBOOK.md:72` |
| Organization timezone | **None.** Analytics already defaults to `America/Vancouver`. | `0020_analytics_aggregation.sql:10-12` |
| Vercel cron (fetched 2026-09-10) | Timezone **always UTC**; invoked only against the **production** deployment URL (GET, `vercel-cron/1.0`, `x-vercel-cron-schedule` header); Hobby: 100 jobs per project, **once per day each**, invoked **anywhere within the scheduled hour**; delivery **best effort** with **no retries**, runs may be **missed or duplicated**; several jobs may share one path; `CRON_SECRET` arrives as `Authorization: Bearer …` | vercel.com/docs/cron-jobs, `/manage-cron-jobs`, `/usage-and-pricing` |

### 1.2 Which events send today

| Event | Sends? | Scheduling | Org flag (default) |
|---|---|---|---|
| Damage report | **Yes** | `after()` | `notify_damage_reports` (true) |
| Support request | **Yes** | `after()` | `notify_support_requests` (true) |
| Renter return checklist | **Yes, when the flag is on** | `after()` | `notify_return_checklists` (**false**) |
| Staff return checklist | **No** | — | — |
| Outbound inspection | **No** | — | — |
| Tag request status update | **Yes, when the flag is on** | **awaited inline**, not `after()` | `notify_tag_request_updates` (**false**) |

Flags and defaults: `supabase/migrations/0012_notification_settings.sql:16-20`. Creating a tag request sends
nothing (`lib/tags/actions.ts:32-120`).

### 1.3 Traces

#### Damage report

| # | Step | Current implementation |
|---|---|---|
| 1 | Source action | `submitDamageReport` (`lib/forms/actions.ts:17-35`) → `submitPublicForm` (`lib/forms/submit.ts:87`) |
| 2 | Persisted record | Anon insert into `form_submissions` (`lib/forms/submit.ts:175-187`): `form_type='damage_report'`, `status='new'`, `submitted_by_name/email/phone`, `submission_data_json = { urgency, description }` (`lib/forms/actions.ts:33`), `media_urls`. Trigger sets `submission_origin='public'` (`0028_staff_return.sql:78-81`). |
| 3 | Scheduler | `scheduleSubmissionNotification` (`lib/notifications/schedule.ts:65`) → `after()` (`:71`), called only after a successful insert (`lib/forms/submit.ts:228`) |
| 4 | Orchestration | `notifySubmission` (`lib/notifications/notify.ts:48`) |
| 5 | Organization settings | Service-role read of `name, notification_email, notify_*` (`notify.ts:37-38,60-64`); `skipped_no_recipient` (`:68-76`); `skipped_disabled` via `shouldNotifySubmission` (`settings.ts:71-77`) |
| 6 | Asset lookup | Service-role read of `asset_code, asset_name, category` (`notify.ts:88-96`) |
| 7 | Content builder | `buildSubmissionEmail` (`lib/notifications/email.ts:86`). `summary` is always `""` (see 1.5 F1). |
| 8 | Provider sender | `sendNotificationEmail` (`lib/notifications/send.ts:107`): Preview → `dry_run` before credentials (`:118`); unconfigured → `dry_run` (`:126`); invalid From → `failed_configuration` (`:130`); 3 attempts, 8 s each, 15 s total (`:36-43`) |
| 9 | Idempotency key | `mm.submission.<submissionId>.<sha256(recipient)[0:8]>` (`idempotency.ts:64-69`, `notify.ts:115-119`) |
| 10 | Logs / outcome | One `[notifications]` JSON line, redacted recipient (`log.ts:58-80`, `notify.ts:132-143`); thrown exception → `failed_transient` / `exception` (`notify.ts:144-155`) |
| 11 | Output | Subject `New damage report — {asset code}` (`email.ts:59`); body in 1.4 |

#### Support request

Identical to the damage report except: action `submitSupportRequest` (`lib/forms/actions.ts:38-62`);
data `{ preferred_contact_method, description }` (`:60`); flag `notify_support_requests`; subject
`Support request — {asset code}` (`email.ts:60`).

#### Renter return checklist (guided return inspection)

| # | Step | Current implementation |
|---|---|---|
| 1 | Source action | `submitReturnInspection` (`lib/forms/actions.ts:69-75`) → `submitReturnInspectionCore` (`lib/inspections/submit.ts:55`) |
| 2 | Persisted record | Anon insert (`inspections/submit.ts:189-204`): `form_type='return_checklist'`, `status='new'`, optional contact, V2 `submission_data_json`, `media_urls`, `inspection_template_key/version`. `rental_session_id` and `submission_origin='public'` set by trigger (`0024:42-68`, `0028:57-95`). |
| 3 | Scheduler | `scheduleSubmissionNotification` → `after()` (`inspections/submit.ts:230-237`) |
| 4–6 | Orchestration, settings, asset | Same as damage; flag `notify_return_checklists` |
| 7 | Content builder | `buildSubmissionEmail`; the label comes from `formTypeLabel` (`display.ts:22-31`), which is **not origin-aware**, so the email says "Return checklist", not the canonical "Renter return checklist" |
| 8–10 | Sender, key, logs | Same as damage |
| 11 | Output | Subject `Return checklist submitted — {asset code}` (`email.ts:61`) |

#### Staff return checklist

| # | Step | Current implementation |
|---|---|---|
| 1 | Source action | `submitStaffReturnInspection` (`lib/forms/actions.ts:94-100`) → `submitStaffReturnInspectionCore` (`lib/inspections/staff-return-submit.ts:52`) |
| 2 | Persisted record | RPC `complete_staff_return` (`0029_reconcile_staff_return.sql`): inserts `return_checklist`, `submission_origin='staff'`, `submitted_by_profile_id`; `status='new'` if damage or missing accessories, else `'resolved'` (`lib/submissions/returns.ts:78-84`); closes the rental session and clears the asset pointer in the same transaction |
| 3–11 | — | **No notification.** On success the action only revalidates and redirects (`staff-return-submit.ts:178-189`). |

#### Outbound inspection

| # | Step | Current implementation |
|---|---|---|
| 1 | Source action | `submitOutboundInspection` (`lib/forms/actions.ts:81-87`) → `submitOutboundInspectionCore` (`lib/inspections/outbound-submit.ts:60`) |
| 2 | Persisted record | RPC `start_outbound_rental` (`0030_outbound_attach_session.sql:25-146`): inserts `pre_use_inspection`, `status='resolved'`, `submission_origin='staff'`; creates or attaches a rental session |
| 3–11 | — | **No notification** (`outbound-submit.ts:172-192`) |

#### Tag request status update

| # | Step | Current implementation |
|---|---|---|
| 1 | Source action | `updateTagRequest` (`lib/tags/owner-actions.ts:18`), platform owner only (`:23`) |
| 2 | Persisted record | `tag_requests` update of `status`, `production_notes`, and `delivered_at` when delivered (`:35-44`) |
| 3 | Scheduler | **None — awaited inline** before the redirect (`:51-57`) |
| 4 | Orchestration | `notifyTagRequestStatus` (`notify.ts:158`) |
| 5 | Organization settings | Same read; flag `notify_tag_request_updates` (`notify.ts:181-190`) |
| 6 | Asset lookup | None |
| 7 | Content builder | `buildTagStatusEmail` (`email.ts:127-148`) |
| 8 | Provider sender | Same sender |
| 9 | Idempotency key | `mm.tag_status.<tagRequestId>:<status>.<recipientHash>` (`notify.ts:203-207`) |
| 10 | Logs / outcome | `event: "tag_status"` |
| 11 | Output | Subject `Tag request updated — {organization}`; body: status label, request UUID, link to `/dashboard/tag-requests` |

### 1.4 Current output, exactly as built today

Subject: `New damage report — EXC-001`

Text part (`email.ts:45-52,99-113`, with the always-empty summary line removed by the filter):

```
Northridge Rentals received a new damage report.

Reference: SUB-2026-A1B2C3
Asset: EXC-001 — Mini Excavator
Category: Excavators
Submitted by: Jamie (jamie@site.test)


You are receiving this because Northridge Rentals has email notifications enabled for damage reports. Change this under Settings → Notifications: https://mulemark.io/dashboard/settings

Open submission: https://mulemark.io/dashboard/submissions/<submission id>
```

HTML part: one `<div>` of escaped `<p>` lines, `<br>` for each blank line, and exactly one `<a>` — the
record link. The settings URL is plain text, not a link (`email.test.ts:117-123` asserts one href). No
image, pixel, attachment, style block, shortener or signed media URL (`email.test.ts:112-115`).

**What a recipient can decide from this today:** which asset, and who sent something. **Not** what
happened, how serious it is, whether anyone must act now, how the submitter wants to be reached, or
whether photos exist.

### 1.5 Findings recorded by D0 (not fixed in D0 or D0.1)

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| F1 | The summary plumbing is dead: `ScheduledNotification` has no `summary` field, so `notifySubmission` always passes `""` | `schedule.ts:42-49`, `notify.ts:56,109` | Replaced by the projection in D1 |
| F2 | Submitter contact in the email comes from browser form values passed through the scheduler, not from the committed row | `lib/forms/submit.ts:232`, `inspections/submit.ts:234` | D1 reads the row |
| F3 | The damage form's urgency **defaults to `medium`**, so a stored `medium` is not evidence of a renter's choice | `components/public/damage-form.tsx:17` | **Resolved in D2:** the select is replaced by optional, unselected triage; a page cached from before D2 still stores legacy urgency, and `medium` never escalates |
| F4 | `damageSeverityLabel` uses damage-report **urgency** as severity, conflating the two concepts this phase separates | `lib/submissions/damage.ts:62-65` | **Resolved in D2:** a damage report's severity now reads `reported_damage_severity` only; the open-damage alert says "reported … damage" |
| F5 | The tag-request notifier runs on **every save**, including notes-only saves; dedupe holds only for Resend's 24 h window, so a later notes-only save re-sends. `delivered_at` is re-stamped on every save while delivered. | `lib/tags/owner-actions.ts:35-55`, `idempotency.ts:6-8` | **Resolved in D3A:** the owner action reads the persisted status, guards the update on it, and schedules an email (after the response) only when it actually changed; the notifier re-checks the saved request; `delivered_at` is stamped only on a real change into `delivered` and never cleared when a request leaves it (operator decision) |
| F6 | `scripts/production/qa-notification-recipient.mjs` also writes `notify_damage_reports = true` on `--set`, contrary to its own "exactly one column" header | `:19`, `:119-122` | Documentation fix at the next touch |
| F7 | `parseAnswerValues` stores values for fields hidden by `visible_when`; only visible fields are validated | `lib/inspections/validate.ts:98-99,120-125` | The projection applies visibility (§10) |
| F8 | CSV export and the dashboard card summary read only V1 flat keys, so they show blanks for V2 returns | `lib/submissions/csv.ts:31-37,77-96`, `app/(admin)/dashboard/page.tsx:70-73` | Out of Phase D scope; recorded |
| F9 | Uploaded photos are stored exactly as sent — no resize, no EXIF/GPS strip | `lib/forms/submit.ts:148-154`, `inspections/submit.ts:142-148` | Email previews strip metadata (§8); storage itself unchanged |
| F10 | The `audience` type comment says staff outbound inspections carry `audience:"staff"`; outbound never writes it | `lib/inspections/types.ts:158-160`, `outbound-submit.ts:157-163` | Comment fix at the next touch |
| F11 | The staff return route exports no `maxDuration`, unlike the public form routes (`maxDuration = 60`) | `app/forms/[shortCode]/{damage,support,return}/page.tsx` | No longer blocks Phase D: staff returns are never emailed individually (§16 #11–12). The summary route sets its own `maxDuration` (D3B). |
| F12 | No length or size limit is enforced on subject, text or HTML | `send.ts:135-143` | D1 adds caps (§13) |
| F13 | The public confirmation page says the team "has been notified", which is not guaranteed; its call link puts the raw stored phone into `tel:` | `components/public/form-thanks.tsx:55,65` | **Resolved in D2** (§16 #7–8): "has your report" wording, normalized call links, call-now block for immediate answers |
| F14 | CSV export still has only the legacy `urgency` column; D2's reported answers are not exported | `lib/submissions/csv.ts:21-40` | Follow-up: adding columns widens the export contract, so it was deliberately left out of D2 |

---

## 2. Data inventory

Legend: **Server** = server-authoritative (derived or validated server-side, not trusted browser text).
**Email** = locked email treatment. **Now** = included in today's email.

### 2.1 Damage report

| Stored field / path | Type | Current label | Server? | Email | Now | Compatibility | Sensitive |
|---|---|---|---|---|---|---|---|
| `id` → reference `SUB-YYYY-XXXXXX` | uuid → derived string | Reference | Server-derived (`inbox.ts:36-47`); id may be a validated client UUID token | Yes | Yes | Stable | No |
| `created_at` | timestamptz | relative time | Server-set (`submit.ts:174`) | **No** — the client's Date header serves; no org timezone exists | No | — | No |
| `asset_code`, `asset_name`, `category` | text | chip | Server lookup | Yes | Yes | name/category nullable | No |
| `submitted_by_name` | text | Name | Browser, required (`validate.ts:48`) | Yes, contact block | Yes | — | **PII** |
| `submitted_by_email` | text | Email | Browser, regex-checked (`validate.ts:51`) | Yes, `mailto:` only if valid | Yes | nullable | **PII** |
| `submitted_by_phone` | text | Phone | Browser, format **not** validated | Yes, `tel:` only after normalizing | Yes | nullable | **PII** |
| `submission_data_json.urgency` | `low`/`medium`/`high`/null | "Urgency" badge | Browser enum, app-checked only; **defaults to medium** | Legacy only, as "Reported urgency" | No | No DB CHECK; F3 | No |
| `submission_data_json.description` | string | Description | Browser, required, no length cap | Yes, excerpt ≤ 300 chars | No | — | Free text, may contain PII |
| `media_urls` | path[] | Attachments (n) | Server-built paths | Count only; never paths | No | — | Paths are internal |
| `status`, `submission_origin` | enum | badges | Server | No / label only | No | origin defaulted to `public` on old rows | No |

### 2.2 Support request

As 2.1, with these differences:

| Stored field / path | Type | Current label | Server? | Email | Now | Compatibility | Sensitive |
|---|---|---|---|---|---|---|---|
| `submission_data_json.preferred_contact_method` | `email`/`phone`/`text`/null | Preferred contact | Browser enum, app-checked; UI default `phone` (`support-form.tsx:20`) | Yes, "prefers phone" | No | No DB CHECK | No |
| `submission_data_json.description` | string | Description | Browser, required | Yes, excerpt | No | — | Free text |

There is **no issue type** and **no urgency** on a support request today.

### 2.3 Renter return checklist

Columns: `submitted_by_*` optional (browser; admin/staff viewers get a pre-fill, `contact-prefill.ts:33-45`),
`inspection_template_key/version` (server), `rental_session_id` (trigger), `submission_origin='public'`
(trigger), `media_urls` (server paths).

| Stored path in `submission_data_json` | Type | Current label | Server? | Email | Now | Compatibility | Sensitive |
|---|---|---|---|---|---|---|---|
| `schema_version` | `2` or absent | discriminator | Server | No | No | absent = V1 flat | No |
| `template_key`, `template_version` | string | "{name} · v{version}" | Server | No (app-only) | No | system date stamps vs custom integer strings | No |
| `template_snapshot` | full template | supplies labels | Server copy | Labels only | No | per-row immutable | No |
| `flags.damage_observed` | `yes`/`no` | "Damage reported" | Server `deriveFlags` (`validate.ts:225-245`) | **Yes** | No | V1: top-level `damage_observed` | No |
| `flags.accessories_missing` | boolean | "Accessories missing" | Server | **Yes** | No | V1: `accessories_returned === "no"` | No |
| `answers.values.accessories.<item>` | `returned`/`missing`/`na` | item list | Browser, validated | Missing item labels only | No | custom templates vary | No |
| `answers.values.damage_location` | short text | "Where is the damage?" | Browser, required when visible | Yes, ≤ 120 chars | No | system templates only | Free text |
| `answers.values.damage_severity` | `minor`/`moderate`/`severe` | "Severity" | Browser, validated select | Yes, as "Reported damage severity" (display only) | No | absent on custom templates | No |
| `answers.values.damage_description` | long text | "Describe the damage" | Browser | Yes, excerpt ≤ 300 | No | system templates only | Free text |
| `pass_fail_na` answers = `fail` | enum | field label + "Fail" | Browser, validated | **Failed check labels** (visible fields only; required vs optional distinguished, §5) | No | built-in checks always required (`field-builders.ts:23-25`); custom may be optional (`org-templates.ts:111`) | No |
| `starts_operates` / `powers_on` = `no` | yes/no | field label | Browser | "Reported not starting / not operating" | No | system template ids only | No |
| `fuel_or_charge_level` | free string | Fuel / charge level | **Not validated server-side** (`validate.ts:171`) | **No** (app-only) | No | — | No |
| `engine_hours`, `run_hours` | number | meter | Browser | No (app-only) | No | — | No |
| `cleaned`, other yes/no, long-text notes | mixed | labels | Browser | No (app-only) | No | V1 `condition_notes` | Free text |
| `answers.photos.<slot>[]` | `{path, caption}` | slot label | path server-built; caption = slot label | Counts + slot labels; paths never | No | absent in V1 | Paths internal |
| `flags.damage_photos_missing`, `flags.condition_photos_missing`, `missing_recommended_photo_slots` | boolean / slot ids | "Evidence" note | Server, counted from validated uploads | "Photos missing" line | No | absent before 3C.1 / 3C.1.1 | No |
| `photo_omission_acknowledged` | true | acknowledged note | Server decides need; browser sends ack | No (app-only) | No | legacy `damage_photo_omission_acknowledged` | No |
| `answers.values.attestation` | `yes`/`no` | skipped in summary | Browser | No | No | — | No |
| `rental_session_id` (column) | uuid | session link | Trigger | "Linked to an active rental" line only | No | null when not rented / pre-0024 | No |

### 2.4 Staff return checklist

Same V2 shape as 2.3, plus:

| Field | Type | Current label | Server? | Email | Sensitive |
|---|---|---|---|---|---|
| `submission_origin='staff'`, `audience:"staff"` | enum | "Staff return checklist" (`origin.ts:44`) | Server / RPC | Daily summary item label only | No |
| `submitted_by_name`, `submitted_by_email` | text | "Performed by" | Server, from the authenticated profile | Name only, in the daily summary; staff email **never** | Staff PII |
| `status` | `new` if flagged, else `resolved` | badge | Server | Current status label in the daily summary | No |
| Template | system return template without attestation (`staff-return-templates.ts:17-40`) | — | Server | — | — |

### 2.5 Outbound inspection

| Field | Type | Current label | Server? | Email | Sensitive |
|---|---|---|---|---|---|
| `form_type='pre_use_inspection'`, `status='resolved'` | enum | "Outbound inspection" (`origin.ts:42`); the notifier label would say "Pre-use inspection" (`display.ts:26`) | Server | Never notified | No |
| `answers.values.condition_notes` | long text | "Existing condition notes" | Browser | — | Free text |
| `flags.damage_observed` (from `existing_damage`) | yes/no | Existing damage | Server | — | No |
| accessories `issued`/`not_issued`/`na` | enum | item list | Browser | — | No |
| session `renter_label`, `rental_reference` | text ≤ 120 | Renter / Rental reference | Browser, trimmed | — (app-only) | **Possible PII** |

### 2.6 Tag request status update

| Field | Type | Current label | Server? | Email | Now | Sensitive |
|---|---|---|---|---|---|---|
| `status` | 6-value CHECK (`0010:15-16`) | `tagRequestStatusLabel` (`tag-requests.ts:30-41`) | Server whitelist | Yes | Yes | No |
| `id` | uuid | reference | Server | Yes | Yes | No |
| `material`, `mounting_method`, `tag_size`, `quantity_notes` | free text | request detail | Browser (customer admin) | One summary line, optional (D3A) | No | No |
| `tag_request_assets.quantity` | int | per-asset quantity | Browser | Total count, optional (D3A) | No | No |
| `production_notes` | text | internal | Platform owner | **Never** | No | Internal |
| `requested_by_profile_id` | uuid | — | Server | No | No | No |

No tag-request status asks the customer to act: Mulemark reviews, produces and ships
(`app/(admin)/dashboard/tag-requests/page.tsx:51`; statuses `requested`, `in_review`, `in_production`, `ready`,
`delivered`, `cancelled`, `lib/tags/tag-requests.ts:13-37`).

---

## 3. Missing data

### 3.1 Captured, but not emailed

- Damage: reported urgency (legacy), description.
- Support: preferred contact method, description.
- Returns (renter and staff): damage flag, damage location, severity and description; missing
  accessories and which items; failed checks; "does not start / operate"; photo-evidence gaps.
- All submissions: photo count and, for returns, which slots have photos; submission origin; whether the
  record is linked to an active rental.
- Canonical event label ("Renter return checklist" / "Staff return checklist").

### 3.2 Not captured at all (captured from D2 where noted)

- **Reported equipment state** on damage reports — optional question, D2.
- **Reported response need** on damage and support — optional question, D2. The legacy damage urgency is a
  partial, default-biased stand-in (F3).
- **Reported issue type** on support requests — optional question, D2.
- **Reported damage severity** on damage reports — optional question, D2; displayed, never raises priority.
- **Organization timezone** — not added in Phase D; the brief carries no absolute timestamp and the daily
  summary uses Pacific time.

### 3.3 Remains app-only

Full checklist answers; meter readings; fuel/charge level; template name/version and snapshot; acknowledgement
and attestation detail; internal notes; `production_notes`; rental reference and renter label; staff email
addresses; status history and related records; **every storage path, bucket name and signed URL**; raw
`submission_data_json`; the full description beyond the excerpt; original full-resolution photos.

---

## 4. Canonical projection

Two server-only projections, both built from **committed rows plus trusted server lookups**, never from browser
input carried across the commit.

### 4.1 Individual notification brief

```ts
type NotificationPriority = "immediate" | "follow_up" | "routine" | "record";

type NotificationBrief = {
  event: "damage_report" | "support_request" | "renter_return" | "tag_status";
  eventLabel: string;               // "Damage report", "Renter return checklist", … (submissionTypeLabel)
  reference: string;                // SUB-YYYY-XXXXXX, or the tag request id
  organizationName: string;
  asset: { code: string | null; name: string | null; category: string | null } | null;
  priority: NotificationPriority;
  headline: string;                 // deterministic phrase from the winning rule (§5.4)
  reported: {                       // null = omitted by the submitter, or not asked on this event
    issueType: IssueType | null;            // support requests
    equipmentState: EquipmentState | null;  // damage reports
    responseNeed: ResponseNeed | null;      // damage and support
    damageSeverity: DamageSeverity | null;  // damage reports (display only)
    legacyUrgency: "low" | "medium" | "high" | null;  // rows without triage_version
  };
  descriptionExcerpt: string | null;  // ≤ 300 chars, whitespace-collapsed, control chars stripped
  exceptions: string[];               // return checklists: Follow-up conditions only (§5.2)
  routineNotes: string[];             // return checklists: failed optional checks, missing photos
  contact: {
    name: string | null;
    preferredMethod: "email" | "phone" | "text" | null;
    phoneLabel: string | null;        // as submitted, escaped
    phoneHref: string | null;         // "tel:+16045550100" — only when normalizable (§10)
    email: string | null;             // only when it passes the existing regex
  } | null;
  linkedToActiveRental: boolean;
  photos: {
    count: number;
    slotLabels: string[];
    previewCandidates: string[];      // storage paths — SERVER-ONLY: never rendered, never logged (§8)
  };
  links: { record: string; settings: string };   // record = primary CTA; publicEnv.siteUrl only
};
```

Staff return checklists and outbound inspections have **no** individual brief: staff returns appear only in the
daily summary; outbound inspections never notify.

### 4.2 Daily return summary

```ts
type ReturnSummary = {
  organizationName: string;
  scope: "staff_only" | "renter_and_staff";   // instant_renter → staff_only; daily_exceptions → both
  sincePhrase: string;              // e.g. "since Tuesday 6 AM Pacific" — never a raw UTC timestamp
  items: Array<{
    reference: string;
    asset: { code: string | null; name: string | null };
    eventLabel: "Renter return checklist" | "Staff return checklist";
    statusLabel: "New" | "Reviewed" | "Resolved" | "Archived";   // current status when the summary is built
    exceptions: string[];           // Follow-up return conditions only
    photoCount: number;             // count only — no previews, no paths
    performedBy: string | null;     // staff name for staff returns; never an email address
    recordLink: string;
  }>;
  links: { inbox: string; settings: string };
};
```

**Construction rules (both)**

1. The individual scheduler payload shrinks to identifiers: `{ organizationId, submissionId }`. Browser-derived
   `submittedBy` is no longer passed.
2. Rows are loaded with the existing service-role client, selecting only needed columns (D1:
   `SAVED_SUBMISSION_COLUMNS` in `lib/notifications/projection.ts`). An individual submission is loaded by `id`
   and must then match the scheduled `organization_id`, `asset_id`, form type and public origin; the asset is
   loaded by `id` **and** `organization_id`. Any refusal sends nothing and logs `failed_transient` with a coarse
   `failureClass`: `record_missing`, `organization_mismatch`, `asset_mismatch`, `form_type_mismatch`,
   `origin_mismatch`, `asset_missing`, `load_error` or `unsupported_record`.
3. Projection is a **pure function** of loaded data so every rule is unit-testable.
4. `previewCandidates` never leaves the server process: not rendered, not logged, not in an idempotency key.
5. A brief is built **once** and reused for every recipient; the database is never written to make an email
   read correctly.

---

## 5. Priority rules

### 5.1 Reported triage vocabulary

| Concept | Where asked | Values |
|---|---|---|
| Reported equipment state | Damage form (optional) | operating · operating with limitations · not operating · cannot be moved · unsafe to operate |
| Reported response need | Damage and support forms (optional) | no immediate response needed (`routine`) · follow up soon (`prompt`) · help needed now (`immediate`) |
| Reported damage severity | Damage form (optional) | minor · moderate · major |
| Reported issue type | Support form (optional) | breakdown or no-start · stuck or needs recovery · rollover or safety incident · operating question · other |

No answer is pre-selected, every question is optional, and every question offers "Not sure". `not_sure` is
stored as the renter's answer and displayed as "Not sure", but for priority it behaves exactly like an omitted
answer. Answers are stored in `submission_data_json` with `triage_version: 1`.

**Storage contract (D2, `lib/submissions/triage.ts`; no migration):** top-level keys
`reported_equipment_state` (`operating`, `operating_with_limitations`, `not_operating`, `cannot_be_moved`,
`unsafe_to_operate`, `not_sure`), `reported_response_need` (`routine`, `prompt`, `immediate`, `not_sure`),
`reported_damage_severity` (`minor`, `moderate`, `major`, `not_sure`) and `reported_issue_type`
(`operating_question`, `breakdown_no_start`, `stuck_recovery`, `rollover_safety`, `other`, `not_sure`). A damage
report stores state, need and severity; a support request stores issue type and need. An omitted answer is stored
as `null`; the server validates each value and stores `null` for anything unexpected. They are read only when
`triage_version === 1`, so a skipped question reads "Not reported" while a pre-D2 row shows none of them. The D1
key names (`equipment_state`, `unsafe`, `unknown`, …) were never written by any form and are superseded.

**Old clients.** A page rendered before D2 posts `urgency` and no `triage_version` marker; the server stores that
post in its legacy shape (`urgency`, `description`) and never backfills or rewrites historical rows. The admin
shows it as "Reported urgency", never as severity.

**Confirmation.** When the validated answers make a report immediate attention, the server redirects to the
confirmation page with a display-only `call=1` flag. The page shows a full-width call button in the tenant colour
(normalized `tel:` URI, formatted number visible) or, with no usable phone, contact guidance and no button. The
flag unlocks no data and changes no state.

### 5.2 Rules — applied in this order

**Immediate attention** — when any explicit new field says:

- response need = immediate
- equipment state = cannot be moved
- equipment state = unsafe to operate
- support issue type = rollover or safety incident

Return checklists never become immediate-attention email.

**Follow up** — when any explicit or canonical field says:

- response need = prompt
- equipment state = not operating
- equipment state = operating with limitations
- support issue type = breakdown/no-start
- support issue type = stuck/recovery
- legacy damage urgency = high
- return checklist has damage
- return checklist has a failed required condition
- return checklist says equipment does not start/operate
- return checklist has a missing required accessory

**Routine review** — for:

- every damage report not mapped above
- every support request not mapped above
- a return checklist whose only exception is missing recommended photos
- unknown or omitted optional triage values

A damage report is never below routine review.

**Record only** — for:

- a clean return checklist
- a tag-request status update (no status in the existing tag workflow requires customer action — §2.6)

**Damage severity rule.** Reported damage severity is displayed but does not by itself raise notification
priority. A renter's visual estimate is useful context but is not a reliable response-timing decision.

### 5.3 Deterministic definitions

| Rule term | Definition |
|---|---|
| explicit new field | a triage value stored on a row carrying `triage_version: 1` |
| legacy damage urgency = high | `submission_data_json.urgency === "high"` on a damage report **without** `triage_version`; ignored once triage exists |
| return checklist has damage | V2 `flags.damage_observed === "yes"`; V1 `damage_observed === "yes"` |
| failed required condition | a **visible** `pass_fail_na` field answered `fail` whose `required` is true, or whose `required_when` condition holds. Every built-in check is required. |
| failed optional check | a visible `pass_fail_na` field answered `fail` that is not required (custom templates only) — **Routine review, not a return exception, not in the daily summary** (§16 #15) |
| does not start/operate | visible system field `starts_operates` or `powers_on` answered `no`. A custom template's own operating question is displayed but not detected. |
| missing required accessory | canonical `flags.accessories_missing === true` (any listed accessory marked `missing`; `na` excluded); V1 `accessories_returned === "no"`. Accessory items carry no per-item required flag, so every listed item is expected. |
| missing recommended photos | `flags.damage_photos_missing`, `flags.condition_photos_missing`, or a non-empty `missing_recommended_photo_slots` |
| clean return checklist | none of the above |
| return exception | any Follow-up return condition. Photo gaps and failed optional checks are **not** exceptions. |
| visible | the field's section and field `visible_when` conditions hold against the stored answers (F7) |

Pseudo-code (first match wins):

```
tag_status                                   → record
renter_return | staff_return:
    damage | failed required condition
      | does not start/operate
      | missing required accessory           → follow_up
    missing recommended photos
      | failed optional check                → routine
    otherwise                                → record
damage_report | support_request:
    responseNeed = immediate
      | equipmentState ∈ {cannot_be_moved, unsafe_to_operate}
      | issueType = rollover_safety          → immediate
    responseNeed = prompt
      | equipmentState ∈ {not_operating, operating_with_limitations}
      | issueType ∈ {breakdown_no_start, stuck_recovery}
      | (no triage_version & urgency = high) → follow_up
    otherwise                                → routine
```

**Invariants, each a test:** no AI and no free-text interpretation; a clean return checklist is always record
only; a return checklist is never immediate; a damage or support report is never record only; omitted or
unknown values never raise a level; reported damage severity never raises a level; legacy `medium`/`low`
urgency never raises a level; visibility is always applied; every renter selection is labelled "Reported …"
and the brief states that the selections are not a verified inspection.

### 5.4 Headline — deterministic, from the winning condition

| Winning condition (checked in this order within its level) | Headline |
|---|---|
| issue type = rollover or safety incident | reported rollover or safety incident |
| state = unsafe to operate | reported unsafe to operate |
| state = cannot be moved | reported unable to move |
| response need = immediate | help requested now |
| state = not operating | reported not operating |
| issue type = breakdown/no-start | reported breakdown or no-start |
| issue type = stuck/recovery | reported stuck, recovery needed |
| state = operating with limitations | reported operating with limitations |
| response need = prompt | follow-up requested |
| legacy urgency = high | reported urgency: high |
| routine damage report | damage reported |
| routine support request | support request |
| renter return, exceptions | renter return checklist, N exception(s) |
| renter return, routine | renter return checklist, review when convenient |
| renter return, clean | renter return checklist, no exceptions |

### 5.5 Worked examples (become table-driven tests)

| Event | Stored values | Priority | Headline |
|---|---|---|---|
| Damage | state `operating`, need `routine` | routine | damage reported |
| Damage | state `unsafe_to_operate`, need omitted | **immediate** | reported unsafe to operate |
| Damage | state omitted, need `immediate` | **immediate** | help requested now |
| Damage | state `not_operating`, need omitted | follow up | reported not operating |
| Damage | severity `major`, state `operating`, need `routine` | routine | damage reported |
| Damage | severity `major`, nothing else answered | routine | damage reported |
| Damage | nothing answered (triage_version 1) | routine | damage reported |
| Damage (legacy) | urgency `medium` | routine | damage reported |
| Damage (legacy) | urgency `high` | follow up | reported urgency: high |
| Damage (triage + stray urgency `high`) | state `operating`, need `routine`, urgency `high` | routine | damage reported |
| Support | issue `stuck_recovery`, need `immediate` | **immediate** | help requested now |
| Support | issue `stuck_recovery`, need omitted | follow up | reported stuck, recovery needed |
| Support | issue `rollover_safety`, need `routine` | **immediate** | reported rollover or safety incident |
| Support | issue `operating_question`, need `routine` | routine | support request |
| Support (legacy) | no triage | routine | support request |
| Renter return | damage `yes`, severity `severe` | follow up | renter return checklist, 1 exception |
| Renter return | clean, all photos | record | renter return checklist, no exceptions |
| Renter return | clean, `condition_photos_missing` | routine | renter return checklist, review when convenient |
| Renter return (custom template) | one failed **optional** check | routine | renter return checklist, review when convenient |
| Renter return (custom template) | clean flags; a **hidden** section holds `fail` | record | renter return checklist, no exceptions |
| Renter return (V1 flat) | `damage_observed: "yes"` | follow up | renter return checklist, 1 exception |
| Staff return | accessories missing + 1 failed required check | follow up | — (daily summary item, never individual) |
| Staff return | clean | record | — (never emailed) |
| Tag request | status `ready` | record | — |

---

## 6. Event matrix

### 6.1 Individual emails

| | Damage report | Support request | Renter return checklist (`instant_renter` only) | Tag request status |
|---|---|---|---|---|
| **Subject** | immediate / follow up: `{prefix}{code} — {headline}`; routine: `New damage report — {code}` | immediate / follow up: `{prefix}{code} — {headline}`; routine: `Support request — {code}` | follow up: `Follow up: {code} — renter return checklist, N exceptions`; routine: `Renter return checklist — {code}, review when convenient`; record: `Renter return checklist — {code}, no exceptions` | unchanged: `Tag request updated — {organization}` |
| **Priority prefix** | `Immediate attention: ` · `Follow up: ` · none | same | `Follow up: ` · none | none |
| **First visible line** | `Reported: {state} · {need} · {n} photos · {name} ({preferred})` | `Reported: {issue} · {need} · {n} photos · {name} ({preferred})` | `Exceptions: {list} · {n} photos`, or `No action required. No exceptions reported · {n} photos` | `Status: {label}` |
| **Above the fold** | priority label, event, asset, headline, reported state / need / severity, excerpt, primary record link | priority label, event, asset, headline, reported issue / need, excerpt, primary record link | exceptions (damage location, reported severity, excerpt, missing items, failed checks), routine notes, primary record link | status, reference |
| **Contact** | tap-to-call + tap-to-email when valid values exist; preferred method first | same | only if the renter gave contact details | none |
| **Photos** | count; ≤ 3 previews from D4 (org switch) | count; ≤ 3 previews from D4 | count + slot labels; ≤ 3 previews from D4, damage first | none |
| **Plain text** | complete brief; nothing exists only in HTML | same | same | same |
| **Not reported** | state and need always shown (`Not reported` when omitted); severity shown only when reported | issue and need always shown (`Not reported` when omitted) | — | — |
| **No-action wording** | never | never | record: "No action required." | "No action required." |
| **Omitted** | paths, URLs, raw JSON | same | full checklist, meters, fuel, notes, template, attestation, rental reference | `production_notes`, requester |

Subject rules: the asset code always follows the prefix, so a phone truncates the headline rather than the
code; no free text ever enters a subject; CR/LF stripped; capped at 78 characters by truncating the headline;
never "urgent", never "!", never marketing phrasing.

### 6.2 Daily return summary

| | Daily return summary |
|---|---|
| **Subject** | `Returns with issues — {organization}: N since {day}`; staff-only scope: `Staff returns with issues — {organization}: N since {day}` |
| **Priority prefix** | none |
| **First visible line** | `N returns with issues since {day} · {x} new · {y} resolved` |
| **Body** | one block per return: asset code and name, event label, **current status**, exceptions, photo count, staff name for staff returns, record link |
| **Photos** | counts only — **no previews** |
| **Contact links** | none |
| **Quiet day** | not sent (`skipped_empty` logged) |
| **Primary CTA** | a link to the return-checklist inbox |

### 6.3 Never individually emailed

- **Staff return checklists** — in Phase D they appear only in the daily summary, and only with exceptions.
- **Outbound inspections** — never notify.

---

## 7. Wireframes

Plain text is shown for email; the HTML part carries the same content in the same order (7.8).

### 7.1 Damage report — immediate attention

```
Subject: Immediate attention: EXC-001 — reported unsafe to operate

Reported: unsafe to operate · help needed now · 3 photos · Jamie Rivera (prefers phone)

IMMEDIATE ATTENTION — Damage report
Asset: EXC-001 — Mini Excavator (Excavators)

What was reported
"Tipped onto its side on the slope by the gate. Boom arm looks bent."

Reported equipment state: Unsafe to operate
Reported response need: Help needed now
Reported damage severity: Major
These are the submitter's selections, not a verified inspection.

Open in Mulemark: https://mulemark.io/dashboard/submissions/<submission id>

Contact
Jamie Rivera — prefers phone
Phone: +1 604 555 0100
Email: jamie@site.test

Photos: 3 on the record
Reference: SUB-2026-A1B2C3

You are receiving this because Northridge Rentals has email notifications enabled for damage reports. Change this under Settings → Notifications: https://mulemark.io/dashboard/settings
```

### 7.2 Support request — follow up

```
Subject: Follow up: SKD-014 — reported stuck, recovery needed

Reported: stuck or needs recovery · no photos · Sam Lee (prefers text)

FOLLOW UP — Support request
Asset: SKD-014 — Compact Track Loader

What was reported
"Sunk to the tracks in soft ground near the new footing. Not damaged as far as I can tell."

Reported issue type: Stuck or needs recovery
Reported response need: Not reported
These are the submitter's selections, not a verified inspection.

Open in Mulemark: https://mulemark.io/dashboard/submissions/<submission id>

Contact
Sam Lee — prefers text
Phone: +1 604 555 0199

Photos: none
Reference: SUB-2026-9F21D0

You are receiving this because …
```

### 7.3 Damage report — routine review (legacy row, no triage)

```
Subject: New damage report — GEN-003

Reported: urgency medium · 1 photo · Pat Morgan (pat@site.test)

ROUTINE REVIEW — Damage report
Asset: GEN-003 — Portable Generator

What was reported
"Small dent on the side panel."

Reported urgency: Medium
This report was submitted before equipment state and response need were asked.

Open in Mulemark: …

Contact
Pat Morgan
Email: pat@site.test

Photos: 1 on the record
Reference: SUB-2026-44B1E9
```

### 7.4 Renter return checklist — follow up (`instant_renter`)

```
Subject: Follow up: TRL-007 — renter return checklist, 2 exceptions

Exceptions: damage reported, accessories missing · 5 photos

FOLLOW UP — Renter return checklist
Asset: TRL-007 — 16 ft Utility Trailer
Linked to an active rental.

Exceptions
- Damage reported: left fender (reported damage severity: Moderate)
  "Crease along the rear edge of the fender."
- Accessories missing: Ratchet straps
These are the submitter's selections, not a verified inspection.

Open in Mulemark: …

Photos: 5 on the record — Front / hitch photo (2), Deck photo (1), Damage photos (2)

Contact
Alex Chen
Email: alex@site.test

Reference: SUB-2026-7C0A55
```

### 7.5 Renter return checklist — record only (`instant_renter`)

```
Subject: Renter return checklist — PLT-002, no exceptions

No action required. No exceptions reported · 2 photos

RECORD ONLY — Renter return checklist
Asset: PLT-002 — Plate Compactor

Open in Mulemark: …

Photos: 2 on the record
Reference: SUB-2026-0B3D19
```

### 7.6 Daily return summary (`daily_exceptions`)

```
Subject: Returns with issues — Northridge Rentals: 3 since Tuesday

3 returns with issues since Tuesday 6 AM Pacific · 2 new · 1 resolved

1. TRL-007 — 16 ft Utility Trailer
   Renter return checklist · New
   - Damage reported: left fender (reported damage severity: Moderate)
   - Accessories missing: Ratchet straps
   Photos: 5
   Open in Mulemark: https://mulemark.io/dashboard/submissions/<id>

2. EXC-001 — Mini Excavator
   Staff return checklist, by Morgan · Reviewed
   - Failed check: Hydraulics / leaks
   - Reported not starting
   Photos: 4
   Open in Mulemark: …

3. PLT-002 — Plate Compactor
   Renter return checklist · Resolved
   - Damage reported: handle guard (reported damage severity: Minor)
   Photos: 2
   Open in Mulemark: …

All return checklists: https://mulemark.io/dashboard/submissions?form_type=return_checklist&status=all_active

You are receiving this because Northridge Rentals has a daily summary of returns with issues enabled. Change this under Settings → Notifications: https://mulemark.io/dashboard/settings
```

### 7.7 Daily return summary — staff-only scope (`instant_renter`)

```
Subject: Staff returns with issues — Northridge Rentals: 1 since Tuesday

1 staff return with issues since Tuesday 6 AM Pacific · 1 new

1. EXC-001 — Mini Excavator
   Staff return checklist, by Morgan · New
   - Failed check: Hydraulics / leaks
   Photos: 4
   Open in Mulemark: …

Renter return checklists are emailed individually for this organization.
```

### 7.8 HTML structure (individual emails)

```html
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">
  <p>Reported: unsafe to operate · help needed now · 3 photos · Jamie Rivera (prefers phone)</p>
  <p><strong>IMMEDIATE ATTENTION</strong> — Damage report<br>Asset: EXC-001 — Mini Excavator (Excavators)</p>
  <p><strong>What was reported</strong><br>“Tipped onto its side …”</p>
  <p>Reported equipment state: Unsafe to operate<br>Reported response need: Help needed now<br>…</p>
  <p><a href="https://mulemark.io/dashboard/submissions/…"><strong>Open in Mulemark</strong></a></p>
  <p><strong>Contact</strong><br>Jamie Rivera — prefers phone<br>
     <a href="tel:+16045550100">Call +1 604 555 0100</a> · <a href="mailto:jamie@site.test">Email Jamie</a></p>
  <p>Photos: 3 on the record<br>Reference: SUB-2026-A1B2C3</p>
  <!-- D4 (built), when the organization has previews on: the count line in both parts, then one figure per preview -->
  <p>Photo previews included: 3 of 3 photos, reduced in size.<br>Open the record in Mulemark for the original photos and full evidence.</p>
  <p><img src="cid:mm-preview-1@mulemark" alt="Damage report photo — preview 1 of 3" width="320" height="240" style="display:block;max-width:100%;height:auto;border:0">Damage report photo — preview 1 of 3</p>
  <p>You are receiving this because …</p>
</div>
```

Rendering rules: the record link is the first and primary link; contact links are secondary; no `<style>` block,
no background colours, no colour-only meaning (the priority is a word), no hidden preheader text, no web fonts,
no layout tables, inline styles limited to font and spacing. HTML stays under 20 KB so Gmail never clips it
(inline image attachments are separate MIME parts and do not count).

### 7.9 Public confirmation page

Standard (every report without an immediate-attention answer):

```
✓  Sent to Northridge Rentals

   Reference  SUB-2026-A1B2C3

   Northridge Rentals has your report.

   Need help now?
   Call 604-555-0100            ← existing link, href normalized

   [ Return to equipment page ]
```

Immediate attention, usable phone:

```
✓  Sent to Northridge Rentals

   Reference  SUB-2026-A1B2C3

   Northridge Rentals has your report.

   You said the equipment isn't safe to use.
   Don't wait for a reply — call Northridge Rentals now.

   [        Call 604-555-0100        ]   ← full-width tel: button

   [ Return to equipment page ]
```

Immediate attention, no usable phone:

```
   You said the equipment isn't safe to use.
   Don't wait for a reply — contact Northridge Rentals directly.
   (no button)
```

The call-now block appears only when explicit answers map to Immediate attention. The phone comes from the
existing support contact resolution — the asset's `support_phone_override`, then the organization's
`support_phone` (`lib/public/equipment.ts:18-26`). Scan-page rules apply: tenant colours, system fonts, no
Mulemark accent, no new client JavaScript. **No emergency-services wording in Phase D.** The copy never says
the company "has been notified" and never implies an employee has read the report.

---

## 8. Photo strategy

### 8.1 Options

| Option | Evaluation | Decision |
|---|---|---|
| 1. No photo in email | Safest and smallest. Recipient learns only that photos exist. | **D1–D3 behaviour, the daily summary always, and the permanent fallback** |
| 2. Expiring remote / signed image links | A signed URL is a bearer credential to private evidence: forwardable, logged by mail gateways, pre-fetched by link scanners. **Forbidden.** | **Rejected** |
| 3. Original attachments | Up to 8 × 10 MB exceeds Resend's 40 MB per-email limit; a full-resolution copy of evidence; originals keep EXIF/GPS (F9). | **Rejected** |
| 4. Small CID inline previews, derived at send time | Bounded, re-encoded, metadata-stripped copies embedded as MIME parts. Nothing new is stored. Some webmail shows them as attachments (Resend documents this caveat); a forwarded email carries them. | **Locked for D4** |
| 5. Stored derived thumbnails | New storage objects, a backfill and retention questions while storage lifecycle is deferred (`ROADMAP_DEFERRED.md` #8). | **Rejected for Phase D** |
| (5b) Supabase image transformation | Requires a paid Supabase plan; Production is on Free. | **Not available** |

### 8.2 Specification (D4 — built)

The D4 prompt (2026-09-11) superseded the draft size caps (120 KB each / 400 KB total) and filename (`photo-N.jpg`);
the values below are what shipped. Code: `lib/notifications/preview-limits.ts`, `preview-image.ts`, `previews.ts`.

| Rule | Value |
|---|---|
| Default | **on** for every organization; `notify_include_photo_previews = false` produces text-only emails |
| Where | individual damage, support and renter-return emails only — **never the daily summary, never tag emails** |
| Count | at most **3** previews |
| Selection (rank) | 1 damage photo (return `damage_photos` slot; every damage-report photo) → 2 issue-specific (any other or custom return slot; every support photo) → 3 overall condition (system overview slots) → 4 additional photos; ties keep template, then upload, order |
| Returns gate | previews only when the return has a **return exception**; clean, photo-gap-only and failed-optional-only returns show the photo count only |
| Eligibility | path is in the row's own `media_urls`, is a strict `org/{uuid}/asset/{uuid}/submission/{uuid}/{file}` path whose ids match the row, has no `..`, and has a `jpg`/`jpeg`/`png`/`webp` extension — re-checked immediately before each read |
| Source read | `notify.ts`'s service-role client, read-only: `info()` rejects objects over **10 MB** before download; the downloaded size is re-checked before decode. No signed URL, no write, no delete |
| Type check | magic-byte sniff (JPEG/PNG/WebP) before Sharp sees the bytes, so SVG/GIF/TIFF/HEIF decoders never run; the decoded container must agree. HEIC is refused (the app never accepts it, and Sharp's prebuilt binaries cannot decode HEVC) |
| Decode safety | `limitInputPixels` 40 MP and ≤ 12,000 px per side, checked from the header; `failOn: "warning"`; `sequentialRead`; first frame only |
| Transform | auto-orient, fit within **640 × 640**, never enlarge, flatten onto white, **JPEG** (mozjpeg) quality 72, one retry at 55 |
| Metadata | **stripped** — Sharp's default output; `withMetadata`/`keepExif`/`keepIccProfile` are never called (a source-scan test enforces it). Tests read the output and find no EXIF, GPS, ICC, XMP or IPTC. The stored original is unchanged and is not claimed to be clean |
| Size | ≤ **400 KB** each (else dropped as `too_large_output`); ≤ **1.2 MB** across the set (else dropped as `total_budget`). Real 640 px output is typically 40–150 KB |
| Budget | separate media budget **6 s**, concurrency 2, before the send; the 15 s send budget is unchanged |
| Attachment | `content_type: image/jpeg`, `filename: incident-photo-N.jpg`, `content_id: mm-preview-N@mulemark`, numbered after omissions |
| HTML | after the photo-count line: `<img src="cid:…" alt="{slot label} — preview n of N" width="320" height="…">` plus the same caption; no remote image, ever |
| Text part | "Photos: N on the record …" (unchanged) plus "Photo previews included: X of N photos, reduced in size." and "Open the record in Mulemark for the original photos and full evidence." — or "Photo previews: none included." when all failed |
| Failure | any failure drops that preview; **all failing produces a text-only email — never a suppressed one** |
| Recipients | built **once** per notification before the first send; main and urgent routes get the identical sanitized set; idempotency key unchanged (event, submission id, recipient hash) |
| Logging | `previewRequestedCount`, `previewAttachedCount`, `previewFailureClass` (closed enum), `previewTransformMs`, `previewBytesBucket` (coarse) — no path, filename or content |
| Body | built once before the retry loop, so every attempt carries the same key and identical payload |
| Endpoint | single-send `POST /emails` only (inline images are unsupported on the batch endpoint) |
| Preview deployments | previews are built (so staging exercises Sharp), the send stays `dry_run` |

### 8.3 Dependency

`sharp` is a **direct dependency pinned to 0.34.5**, the version Next 16.2.9 resolves as its optional dependency, so
there is one native install rather than two. The lockfile carries `@img/sharp-linux-x64` and
`@img/sharp-libvips-linux-x64`, which `npm ci` installs in the Vercel build; Sharp is on Next's default
server-external list, so it is not bundled. It is imported lazily inside `preview-image.ts`: if the binary ever fails
to load, previews report `transformer_unavailable` and the email still sends text-only.

---

## 9. Routing strategy and the daily return summary

### 9.1 Current model

One `notification_email` plus four per-event booleans on `organizations` (`0012:15-20`). Not in the anon grant;
readable by organization members (`0001:283-284`); writable only by a customer admin or the platform owner
(`0032:138-148`); server action gated by `requireCustomerAdminOrgId` (`lib/notifications/actions.ts:40`). No CHECK
constraints; no RLS or security test covers these columns.

### 9.2 Locked settings model (migration in D3A, additive)

| Column | Type | Meaning |
|---|---|---|
| `notification_email` | unchanged | general route address |
| `notify_damage_reports`, `notify_support_requests`, `notify_tag_request_updates` | unchanged | general route switches |
| `notify_urgent_reports` | boolean NOT NULL default false | **urgent route switch** |
| `urgent_notification_email` | text, nullable | **urgent route address**; the settings form refuses the switch on without a valid address |
| `return_notification_mode` | text NOT NULL default `'off'`, CHECK `instant_renter` / `daily_exceptions` / `off` | backfill: `notify_return_checklists = true → instant_renter`, `false → off`; new organizations `off` |
| `notify_return_checklists` | kept; the settings action mirrors it from the mode (true only for `instant_renter`) and **no code reads it** | rollback safety; dropped in a later migration |

**Authority (built in D3A, `0034_notification_routing.sql`).** `return_notification_mode` is authoritative for returns.
The migration backfilled `notify_return_checklists = true → instant_renter`, `false → off` (an executed catalog test
runs the migration's own statement). A CHECK keeps the urgent switch from being on without an address, even through
the API. No column-grant change was needed: the anon grant is an explicit safe list and writes follow the 0032
policy (customer admin of its own active organization, or the platform owner).
| `notify_include_photo_previews` | boolean NOT NULL default true | organization off-switch for D4 previews |

None of the new columns joins the anon grant. Writes follow the 0032 admin policy: **customer staff cannot
change notification settings; public users never choose recipients.** Not added: per-event override addresses,
CC lists, a rules engine, on-call rotation, per-organization timezone or summary time.

### 9.3 Individual email routing

| Event and priority | General route (`notification_email`) | Urgent route (`urgent_notification_email`) |
|---|---|---|
| Damage / support, **immediate attention** | if that report type's general switch is on | **whenever `notify_urgent_reports` is on**, independent of the general switch |
| Damage / support, follow up or routine | if that report type's general switch is on | never |
| Renter return | only in `instant_renter` mode (every renter return) | never (returns are never immediate) |
| Staff return | never individually | never |
| Outbound inspection | never | never |
| Tag request | only when the status actually changed and its switch is on | never |

| Damage switch | Urgent switch | Immediate damage report goes to |
|---|---|---|
| on | on | general + urgent (two sends) |
| off | on | urgent only |
| on | off | general only |
| off | off | nobody emailed — still in the inbox |

**Separate sends.** Each recipient receives its own API request — never To+CC, never BCC:

- no recipient learns another address;
- the existing idempotency key binds a recipient hash (`idempotency.ts:53-58`), so each send is independently
  deduplicated and retry-safe;
- a bounce or rejection of one address cannot fail the other;
- one `[notifications]` line per send with `recipientRoute: "main" | "urgent" | "main_and_urgent"` (`digest` is
  reserved for D3B), plus `previewRequestedCount` / `previewAttachedCount` counts;
- identical addresses (trimmed, case-insensitive) collapse to one send;
- general first, then urgent, each within its own 15 s budget; worst case ≈ 0.1 s load + 6 s media + 2 × 15 s
  ≈ 36 s, inside the 60 s `maxDuration` of the public form routes.

### 9.4 Return notification modes

| Mode | Individual renter return email | Daily summary contains |
|---|---|---|
| `instant_renter` | **every** renter return (follow up / routine / record only) | **staff** return exceptions only |
| `daily_exceptions` | none | **renter and staff** return exceptions |
| `off` | none | no summary |

Staff returns never send an individual email in Phase D.

### 9.5 Daily return summary

| Aspect | Locked behaviour |
|---|---|
| Recipient | the general `notification_email` only; no summary when it is unset or the mode is `off` |
| Content | every return checklist in scope created in the window that has **at least one return exception** (§5.3), listed **with its current status** (New, Reviewed, Resolved, Archived) when the summary is built |
| Excluded | clean returns, photo-gap-only returns, failed optional checks, outbound inspections, non-return submissions |
| Photos | counts only — never previews |
| Quiet day | no email, no provider call; a `skipped_quiet` ledger row and log line per organization, which advances the cursor |
| Window | from the organization's **covered-through watermark** (exclusive) to the run's cutoff (inclusive), selected by server-set `created_at`. First run for an organization covers the previous 24 hours. **Built:** never more than 14 days back (a summary switched back on after months off); the email then says the period was shortened. |
| Catch-up | the watermark advances to the cutoff **only after `sent` or `skipped_quiet`**. **Built:** with no success yet, a run resumes from the first recorded attempt's own window start, so a failed first-ever summary is retried rather than dropped. A failed send leaves it, so the next run includes everything since the last success — late, never dropped. If a send succeeds but the watermark update fails, the next summary lists those returns again: at-least-once listing. |
| Duplicate invocation | **Built:** the run inserts a `processing` ledger row for `(organization, return_exceptions, window_end)` before building; the unique key makes a duplicate or overlapping invocation lose the claim and send nothing. The provider idempotency key is `mm.return_digest.<orgId>:<windowEndMs>.<recipient-hash>`. **At-least-once:** a provider timeout on a message the provider actually accepted is recorded as failed, and the next day's summary (a new window, a new key) lists those returns again |
| Watermark storage | **Built:** `notification_digest_runs` (migration 0036) — one row per organization window with status `processing` / `sent` / `skipped_quiet` / `failed`, item count, provider id and a bounded failure class; RLS enabled, no policies, no anon/authenticated privileges. The last successful cutoff is the latest `sent`/`skipped_quiet` `window_end`. No recipient, body or item data. **Not a general notification queue.** |
| Endpoint | **Built:** `GET /api/cron/return-digest` — Production only (Preview and local development refuse), `Authorization: Bearer ${CRON_SECRET}` compared in constant time (≥ 32 characters, fail closed), `maxDuration = 300`; organizations 2 at a time with a 240 s start budget, reporting `incomplete` (HTTP 500) rather than a silent success |
| Logging | **Built:** one line per organization — `event: "return_digest"`, `outcome` (`sent`, `skipped_quiet`, `skipped_duplicate`, `skipped_no_recipient`, failures), `organizationId`, `reference` = Pacific date, redacted recipient, `providerId`, `recipientRoute: "digest"`, `digestItemCount` — plus one `return_digest_run` line per invocation with counts; never item content |
| Links | per-item record links and one return-checklist inbox link, all on `publicEnv.siteUrl` |

### 9.6 Schedule caveat

**Vercel schedules are UTC, and the Hobby plan only guarantees invocation somewhere within the scheduled hour.**
The product requirement is **6:00–6:59 AM Pacific, including daylight-saving changes.** No single fixed UTC
schedule equals 6 AM Pacific year-round: `13:00 UTC` is 6 AM in PDT but 5 AM in PST.

Candidate for D3B, recorded here and **to be re-verified against Vercel's official limits at D3B**:

- two once-daily schedules on the same secured path — `0 13 * * *` and `0 14 * * *` — each within Hobby's
  once-per-day limit;
- a pure local-time guard: proceed only when the current `America/Vancouver` hour is `6`;
- DST changes happen at 2 AM local, before 6 AM, so on any date exactly one of the two invocations falls in the
  6 AM local hour; the other exits without work;
- a missed invocation is caught up by the next day's run through the watermark (§9.5); a duplicate is absorbed
  by the claim and the idempotency key.

If current Vercel limits make this unworkable, **D3B stops and presents the exact operator trade-off** (for
example accepting a 5:00–6:59 AM window for part of the year, or a paid plan with per-minute precision) rather
than choosing silently.

**Re-verified at D3B (2026-09-11, official Vercel docs) — the candidate is viable on Hobby and is built:** Hobby
allows 100 cron jobs, once per day each, invoked "at any point within the specified hour"; schedules are always UTC;
crons run only on Production; `CRON_SECRET` is sent automatically as a `Bearer` authorization header; failed
invocations are not retried and delivery is best effort; the same run may occasionally be invoked more than once or
overlap; multiple entries may share one path; Hobby functions with Fluid Compute run up to 300 s. `vercel.json`
schedules `0 13 * * *` and `0 14 * * *` on `/api/cron/return-digest`. The `America/Vancouver` hour-6 guard admits
exactly one slot per date, whatever offset the runtime's time-zone database applies (tested for every date of 2026,
and on 2026-03-08 and the historical 2025-11-02 change). Note: the local Node time-zone data keeps
`America/Vancouver` on UTC−7 after 2026-03-08 (British Columbia staying on daylight time), so the 13:00 UTC slot
serves the rest of 2026 there; the 14:00 UTC slot covers any period on UTC−8. The guard reads the time-zone data of
the runtime that executes it, so no code change is needed if that data differs or changes. **No 6:00-sharp or
guaranteed-delivery claim is made:** the summary arrives somewhere in 6:00–6:59 AM Pacific when Vercel delivers the
invocation, and a missed morning is caught up by the next one.

---

## 10. Privacy and security rules

1. **Committed data only.** Briefs and summaries are built from rows loaded by organization plus id or window,
   after the insert or RPC succeeded. Browser values are never carried across the commit.
2. **Nothing request-bound enters `after()`.** No `FormData`, request, headers or cookies — identifiers only.
3. **Service-role scope is unchanged in kind**: organization settings, the one asset, the one submission and, in
   D4, only that submission's own media objects; for the summary, the organization's return checklists in the
   window and its watermark row.
4. **No storage path, bucket name, signed URL, original file or raw `submission_data_json`** in any subject,
   body, log, idempotency key or attachment filename.
5. **No free text in subjects.** Enumerated phrases and the asset code only; CR/LF stripped.
6. **Free text in bodies is escaped**, whitespace-collapsed, stripped of control characters and truncated
   (description 300, damage location 120).
7. **Links.** Web links only on `publicEnv.siteUrl`; the authenticated record link is the primary CTA.
   `tel:` only from a phone reduced to digits with an optional leading `+`, 7–15 digits, extension suffixes kept
   in the visible label but dropped from the URI; otherwise shown as text without a link (email) or no button
   (confirmation page). `mailto:` only for an address passing the existing regex. The confirmation page's
   existing call link uses the same normalization.
8. **No workflow-changing links.** No link resolves, reviews, archives, acknowledges or unsubscribes. Every
   action happens behind authentication in Mulemark.
9. **Visibility applied** to inspection answers; hidden stored values are ignored (F7).
10. **Staff email addresses are never emailed**; staff are named only, in the daily summary.
11. **Logs stay redacted**: no names, addresses, phone numbers, descriptions, paths, image bytes or bodies. New
    fields are route classes, counts and coarse failure classes only.
12. **Recipients.** Separate sends; recipient addresses never exposed to one another; public users never choose
    recipients; customer staff cannot change settings.
13. **RLS, roles, suspension and Preview isolation unchanged.** New organization columns follow 0012; the summary
    state table has RLS enabled and no client policies; both are covered by security tests. Suspended
    organizations receive no summary.
14. **Summary endpoint** accepts only a matching `CRON_SECRET` bearer token, refuses Preview, and returns no data
    in its response body. `CRON_SECRET` is set by the operator on Production only and never appears in Git,
    commands, logs or documentation.
15. **Preview never sends.** Individual sends stay `dry_run` before credentials are read; Vercel invokes
    schedules only against the production deployment.
16. **Reported, not verified.** No email or page states a mechanical, damage, recovery or safety determination;
    no report changes an asset's rental or service state; delivery is never described as guaranteed.

---

## 11. Backward compatibility

| Area | Concern | Handling |
|---|---|---|
| Return data shapes | V1 flat; V2 `2026-07-1`; V2 `2026-07-2` before and after the 3C.1.1 hotfix (same version string); custom org templates (integer versions, org-defined ids, optional checks) | Detect by `schema_version`, then key presence — never by version string. Canonical flags first, V1 fallback (`returnChecklistFlags`, `lib/submissions/returns.ts:49-70`). Failed checks by field **type** and `required`/`required_when` from the snapshot. |
| Missing optional keys | `damage_photos_missing`, `condition_photos_missing`, `missing_recommended_photo_slots` absent on older rows | Absent = not reported; not inferred |
| Legacy damage urgency | `low`/`medium`/`high`/null, default-biased | Displayed as "Reported urgency"; only `high`, only without `triage_version`, raises to follow up |
| Deploy window (D2) | A renter with the old form open posts `urgency` without triage | Accepted; projects as legacy |
| Scheduler signature | `ScheduledNotification` shrinks to ids | Both callers and tests change in the same slice; payloads are never persisted |
| Existing B4 tests | "no urgency hook" and "exactly one link" assertions | Deliberately revised in D1: priority prefixes and secondary contact links are locked decisions; the record link remains the only web link |
| Idempotency | Key format | Individual keys unchanged: `mm.submission.<id>.<hash>`; new `mm.return_digest…` keys for summaries |
| Return setting | Boolean → three modes | Backfill `true → instant_renter`, `false → off`; boolean kept in sync for one release |
| Staff returns | Previously never notified | Still never individually notified; appear in the daily summary from D3B |
| Confirmation page | "has been notified" copy; raw `tel:` | Replaced in D2 (§7.9) |
| Admin UI | "Urgency" badges on existing rows | Remain for legacy rows; new rows show "Reported …" labels (D2) |
| Tag request emails | Status-change-only (D3A) | A same-status save no longer emails |

---

## 12. Phased file plan

Each slice is separately planned, approved, gated, committed and pushed. Commands use the fixed repository
scripts (`npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, and the existing
security, E2E and smoke scripts).

### D1 — Server-authoritative brief, deterministic priority, actionable email

No new form fields, no schema, settings or media change. Return notifications stay gated by the existing
boolean until D3A.

| File | Change |
|---|---|
| `lib/submissions/triage.ts` (new) | Triage values and "Reported …" labels shared by forms, admin and email |
| `lib/contact/tel.ts` (new) | Pure phone normalization for `tel:` (shared with D2's confirmation page) |
| `lib/notifications/priority.ts` (new) | Pure ordered rules + headline; table-driven tests |
| `lib/notifications/projection.ts` (new) | Pure projection for every data shape; fixture tests per shape |
| `lib/notifications/notify.ts` | Load the committed row by id + organization; build the brief; `record_missing` |
| `lib/notifications/schedule.ts` | Identifier-only payload |
| `lib/notifications/email.ts` | Individual incident email (text + HTML), caps; tag builder unchanged |
| `lib/forms/submit.ts`, `lib/inspections/submit.ts` | Pass identifiers only |
| Tests | `priority`, `projection`, `email`, `notify`, `schedule`, `submit-cleanup`, `inspections/submit` |

### D2 — Optional triage questions, Reported labels, urgent confirmation

| File | Change |
|---|---|
| `lib/forms/validate.ts`, `lib/forms/actions.ts` | Optional triage enums; `triage_version: 1`; legacy `urgency` still accepted |
| `components/public/damage-form.tsx` | Reported equipment state, response need, damage severity — optional, nothing pre-selected |
| `components/public/support-form.tsx` | Reported issue type, response need — optional, nothing pre-selected |
| `components/public/form-thanks.tsx` + thanks pages | "has your report" copy; call-now block and full-width `tel:` button for immediate answers; normalized hrefs; no broken button |
| `lib/submissions/display.ts`, `inbox.ts`, `damage.ts` | "Reported …" labels; severity no longer derived from urgency on new rows |
| E2E | both forms, omitted answers, legacy post, confirmation variants |

### D3A — Routing, settings, return modes, preview switch, logs, tag correctness

| File | Change |
|---|---|
| `supabase/migrations/0034_notification_routing.sql` (new) | §9.2 columns, backfill, CHECK. Linked-project proof, migration list, dry run, plan, **stop for approval**; Production not applied in the creating step |
| `lib/notifications/settings.ts`, `actions.ts`, `components/notification-settings-form.tsx`, `app/(admin)/dashboard/settings/page.tsx` | Urgent switch + address (validated), return mode, preview switch; customer-admin only |
| `lib/notifications/notify.ts` | Urgent route, mode gating, dedupe, separate sends |
| `lib/notifications/log.ts` | `recipientRoute`, preview count fields, `digestItemCount` (bounded) |
| `lib/tags/owner-actions.ts` | Notify only on a status change; stop re-stamping `delivered_at` (F5) |
| `tests/security/…` | anon cannot read new columns; staff cannot write them |

### D3B — Daily return-exceptions summary

**First step:** re-verify Vercel's official cron limits; if the §9.6 candidate is not viable, stop and present
the operator trade-off.

| File | Change |
|---|---|
| `supabase/migrations/0036_notification_digest_runs.sql` (built; 0035 is the tag-request internal-column security fix) | Service-role-only watermark/claim table, RLS enabled, no client policies; same migration procedure as D3A |
| `lib/notifications/digest-window.ts` (built) | Pure Pacific-hour guard, window and Pacific-date helpers; DST tests |
| `lib/notifications/digest.ts`, `digest-worker.ts`, `digest-store.ts` (built; email builder in `email.ts`) | Selection (exceptions only, all statuses), projection, email builder |
| `app/api/cron/return-digest/route.ts` (built) | Bearer `CRON_SECRET`, Preview refusal, `maxDuration`, claim → build → send → advance |
| `vercel.json` (new) | Two once-daily schedules on the one path |
| Operator action | Set `CRON_SECRET` on Production only, through the Vercel dashboard |
| Tests | duplicate run, missed run, quiet day, send failure, watermark-update failure, suspended org, mode scopes |

### D4 — Bounded inline photo previews

| File | Change (built) |
|---|---|
| `package.json`, `package-lock.json` | `sharp` 0.34.5 direct, exact |
| `lib/notifications/preview-limits.ts` (new) | Caps, budgets, failure-class and size-bucket enums |
| `lib/notifications/preview-image.ts` (new) | Sniff, bounds, lazy Sharp, orient/resize/flatten/JPEG, retry |
| `lib/notifications/previews.ts` (new) | Path re-check, read-only storage adapter, budget and concurrency, assembly |
| `lib/notifications/projection.ts`, `return-summary.ts` | Ranked `{ path, label, rank }` candidates; exception-only return gate |
| `lib/notifications/email.ts`, `send.ts` | Optional `attachments`; CID figures and preview count line; snake_case attachment body |
| `lib/notifications/notify.ts`, `log.ts`, `lib/diagnostics/server-timing.ts` | Build once before sends; `notify.media` phase; bounded preview log fields |
| Tests | `preview-image`, `previews`, `preview-scope` (new); `projection`, `email`, `send`, `notify`, `log` extended |

### D5 — Live QA and Engineering Phase D closeout

§15 executed against QA data; updates to `EMAIL_DELIVERABILITY_RUNBOOK.md`, `OPERATIONS_RUNBOOK.md`,
`SECURITY_MODEL.md`, `roadmap.md`; a Phase D readiness note.

---

## 13. Acceptance criteria

### D1

- The notifier loads the committed row by `id` **and** `organization_id`; a test schedules with contact values
  differing from the row's and proves the email shows the row's.
- `priorityFor` is pure; §5.5 is a table-driven test; each §5.3 invariant has its own test, including
  severity-never-raises and failed-optional-check → routine.
- All return data shapes project without throwing; a hidden failed field is ignored.
- Text leads with the first visible line, then the priority label; everything in HTML is in text.
- Subjects: asset code present, prefix only for immediate / follow up, no free text, no "urgent", no "!",
  ≤ 78 characters.
- The record link is the first link; `tel:`/`mailto:` appear only after normalization/validation; web links only
  on the canonical host.
- No output contains a storage path, bucket name, signed-URL marker or raw JSON (fixture rows carry realistic
  paths).
- HTML ≤ 20 KB, escaped, no `<img>`, no `<style>`, no hidden text. (Amended by D4: the only `<img>` allowed is a
  `cid:` reference to an attached preview; no remote image.)
- A missing row sends nothing and logs `record_missing`; nothing throws; idempotency key format unchanged.

### D2

- Triage questions are optional with nothing pre-selected; the server rejects unknown values; rows carry
  `triage_version: 1`; omitted answers submit successfully.
- A legacy `urgency`-only post succeeds and projects as legacy.
- Admin surfaces label renter selections "Reported …".
- Confirmation page: "has been notified" absent; the call-now block appears only for immediate answers; the
  button's href is normalized; no button renders without a usable phone; no emergency-services wording.

### D3A

- Migration additive; backfill `true → instant_renter`, `false → off`; new organizations `off`; anon cannot read
  new columns; staff cannot write them; the urgent switch cannot be saved on without a valid address.
- Immediate report with both switches on → two sends, two keys, two log lines (`main`, `urgent`); identical
  addresses → one send; urgent switch on + general switch off → urgent only; follow-up and routine reports never
  reach the urgent route.
- `instant_renter` emails every renter return; `daily_exceptions` and `off` email none; staff returns and
  outbound inspections are never emailed individually.
- A tag request saved without a status change sends nothing.

### D3B

- Guard tests pass for dates either side of both DST transitions: exactly one of the two schedules proceeds per
  date, only in the 6 AM Pacific hour.
- A duplicate invocation delivers no second message; a missed day is caught up next run; a failed send does not
  advance the watermark; a quiet day sends nothing and records `skipped_quiet`.
- Contents: exceptions only, all statuses shown, staff-only scope in `instant_renter`, renter + staff in
  `daily_exceptions`, nothing in `off`; photo counts, no previews, staff named without email.
- The endpoint rejects a missing or wrong bearer token and refuses Preview; suspended organizations get no
  summary.

### D4

- ≤ 3 previews; each ≤ 640 px, ≤ 400 KB, JPEG; ≤ 1.2 MB total; no EXIF/GPS/ICC in output; no original attached.
- A path outside the submission prefix or absent from `media_urls` is never read; no signed URL, storage path or
  original filename appears in the message.
- Corrupt, oversized, unsupported, timed-out or failed downloads still produce a sent text-only email; partial
  success keeps the survivors.
- `notify_include_photo_previews = false` → text-only; clean returns get no preview; the daily summary never
  carries images.
- Image work never runs on the submission response path (source-scan test); the idempotency key is unchanged.
- Logs carry counts, one coarse failure class, a duration and a size bucket only.

### D5

- Every §15 row executed or explicitly marked not run, with date and client; B4's outstanding replay check
  attempted.

---

## 14. Explicit non-goals

- SMS, push notifications, a notification center or in-app feed.
- A durable general notification queue, outbox or delivery-history table (the daily summary's watermark is run
  state, not a queue).
- An on-call scheduler, escalation chains, SLA timers or assignment.
- A work-order/CMMS system, automatic dispatch, or asset service-state automation.
- **An operational hold / out-of-service workflow** — a separate future phase (`ROADMAP_DEFERRED.md` #3).
- AI or free-text incident classification, summarization or severity inference.
- Automatically changing a submission's or asset's status from a report.
- Workflow-changing or unauthenticated action links, including one-click unsubscribe that changes settings.
- Emergency-services wording on public pages.
- Individual staff-return emails; renter-facing confirmation emails.
- Per-organization summary times, organization timezone settings, localized email.
- Original attachments, signed media URLs, a public bucket, stored derived images.
- Open or click tracking, link shorteners, a dedicated IP, Resend's batch endpoint.
- Marketing email, a visual email rebrand, brand artwork in email.
- Guaranteed-delivery claims of any kind.

---

## 15. Operator test matrix

Run against demo/QA data only. Production sends only to an approved QA address (`delivered@resend.dev` or
`support@mulemark.io`) set through `production:qa-recipient`, cleared afterwards. Record date, client and result
for every row; a row not run stays marked **not run**.

### 15.1 Individual events

| ID | Scenario | Expected |
|---|---|---|
| E1 | Damage report: unsafe to operate | `Immediate attention: {code} — reported unsafe to operate`; one email per enabled route |
| E2 | Damage report: operating, routine need, severity major | `New damage report — {code}`; routine; severity shown |
| E3 | Damage report: nothing answered | routine; state and need show "Not reported" |
| E4 | Support request: stuck/recovery, need omitted | `Follow up: …`; preferred contact first |
| E5 | Support request: rollover or safety incident | Immediate attention |
| E6 | Renter return with damage + missing accessories, `instant_renter` | Follow up; 2 exceptions |
| E7 | Clean renter return, `instant_renter` | "No action required" |
| E8 | Renter return with a failed optional check (custom template), `instant_renter` | Routine; not in the summary |
| E9 | Any renter return, `daily_exceptions` or `off` | No individual email |
| E10 | Staff return with a failed required check, any mode | No individual email |
| E11 | Outbound inspection | No email, no log line |
| E12 | Tag request status change / notes-only save | One email / none |
| E13 | Any event on staging with a recipient set | `dry_run`, `reason: preview_environment` |

### 15.2 Urgent routing

| ID | Scenario | Expected |
|---|---|---|
| R1 | Damage switch on, urgent switch on, immediate report | Two emails, two providerIds, log roles `general` and `urgent` |
| R2 | Damage switch off, urgent switch on, immediate report | Urgent only |
| R3 | Damage switch on, urgent switch off, immediate report | General only |
| R4 | Urgent address equals general address | One email |
| R5 | Follow-up report with urgent switch on | General only |
| R6 | Saving the urgent switch on without an address | Refused with a field error |
| R7 | Replay of the same submission within 24 h | No second email per recipient |

### 15.3 Daily return summary

| ID | Scenario | Expected |
|---|---|---|
| S1 | `daily_exceptions`, renter + staff exceptions | One summary, 6:00–6:59 AM Pacific, all items with current status |
| S2 | `instant_renter`, staff exception present | Staff-only summary |
| S3 | `off` | No summary |
| S4 | Quiet day | No email; `skipped_empty` logged |
| S5 | An item resolved before the run | Listed as Resolved |
| S6 | A missed run (simulated by skipping a day in QA) | Next summary covers both days |
| S7 | A duplicate invocation (manual re-trigger in QA) | No second email |
| S8 | Summary around a DST transition date | Arrives 6:00–6:59 AM Pacific |
| S9 | Request without the bearer token | 401, nothing sent |

### 15.4 Clients and rendering

| ID | Client / condition | Check |
|---|---|---|
| C1 | Gmail web | Subject, first line, priority word, links, previews inline, no clipping |
| C2 | Gmail iOS/Android notification preview | Subject keeps the asset code; first line readable |
| C3 | Outlook desktop (Windows) | Layout intact without CSS; previews inline or as attachments; placement noted with allowlist state |
| C4 | Outlook web | Same |
| C5 | Apple Mail (macOS and iOS) | Same; dark mode legible |
| C6 | Restrictive corporate client / gateway | Delivered; links noted; brief complete even if previews stripped |
| C7 | Images blocked | Alt text meaningful; "Photos: N on the record" still true |
| C8 | Dark mode (Gmail app, Apple Mail, Outlook) | No invisible text; priority readable without colour |
| C9 | Text-only view | Complete brief and summary |
| C10 | Reply to any email | Reaches `support@mulemark.io` |

### 15.5 Confirmation page, media and failure

| ID | Scenario | Expected |
|---|---|---|
| P1 | Immediate answer, asset or organization phone set | Full-width call button with a normalized href |
| P2 | Immediate answer, no usable phone | Contact-the-company copy, no button |
| P3 | Non-immediate report | Standard page; "has your report"; no "has been notified" |
| M1 | Return with 6 photos across 3 slots incl. damage | 3 previews, damage first |
| M2 | Photo with GPS EXIF | Received preview carries no EXIF/GPS |
| M3 | 10 MB photo | Preview ≤ 400 KB, ≤ 640 px |
| M4 | Preview generation forced to fail (test fault only) | Text-only email still delivered |
| M5 | Preview switch off | Text-only |
| M6 | Provider failure | Submission unaffected; `failed_*` logged |

---

## 16. Locked operator decisions

Decided by the operator on 2026-09-10 (D0 decision carousel, confirmed in D0.1). Each is final for Phase D.

| # | Decision | Locked value | Implemented in |
|---|---|---|---|
| 1 | Priority prefixes | `Immediate attention:` and `Follow up:`; routine and record-only subjects use no prefix | D1 |
| 2 | Submitter contact | Safe tap-to-call and tap-to-email links when valid values exist; the authenticated Mulemark record link stays the primary CTA | D1 |
| 3 | Damage form | Reported equipment state, reported response need, reported damage severity — all optional, no pre-selected answers | D2 |
| 4 | Support form | Reported issue type, reported response need — both optional, no pre-selected answers | D2 |
| 5 | Omitted values | Displayed as `Not reported` only where useful; omitted/unknown never raise priority; damage and support still default to routine review | D1, D2 |
| 6 | Damage severity | Displayed in email and admin UI; never changes priority by itself | D1, D2 |
| 7 | Immediate confirmation | Direct call-now message when explicit answers map to Immediate attention; full-width `tel:` button using the rental company's support phone, normalized; no usable number → contact-the-company copy and no button; no emergency-services wording | D2 |
| 8 | Confirmation wording | Remove "has been notified"; say the rental company has the report; never imply an employee has read it | D2 |
| 9 | Urgent routing | Separate urgent switch and urgent address, independent of the damage/support general switches; immediate events go to the urgent route whenever its switch is on, and also to the general route when that is on; identical normalized addresses deduplicated | D3A |
| 10 | Return notification modes | `instant_renter`, `daily_exceptions`, `off`; existing true → `instant_renter`, false → `off`; new organizations `off` | D3A |
| 11 | Return-mode meaning | `instant_renter`: every renter return sends individually, staff return exceptions go to the daily summary; `daily_exceptions`: renter and staff exceptions in one daily summary, no individual return email; `off`: neither | D3A, D3B |
| 12 | Daily summary | Target 6:00–6:59 AM Pacific; skip quiet days; no inline photos; photo counts included; catches up after a missed run without dropping records; staff returns never send an individual email in Phase D | D3B |
| 13 | Photo previews | On by default; organization-level off switch; up to three bounded previews; none in the daily summary | D3A (switch), D4 |
| 14 | Logging | Recipient-route classification; requested/attached preview counts; daily-summary event, outcome and item count; never recipient addresses, media paths or report content | D3A, D3B, D4 |
| 15 | Failed optional check (custom templates) | Routine review; shown in an individual renter email; not a return exception; not in the daily summary | D1, D3B |
| 16 | Summary contents | Every return exception since the last summary, listed with its current status — not only unresolved items | D3B |

**Interpretations of the locked rules** (recorded so implementation cannot drift; not additional decisions):

- "Missing required accessory" is the canonical `accessories_missing` flag, because accessory items carry no
  per-item required marker (`lib/inspections/field-builders.ts:72-77`).
- "Failed required condition" uses each check's `required` / `required_when`; every built-in check is required
  (`field-builders.ts:23-25`), custom checks may be optional (`org-templates.ts:111`).
- "Does not start/operate" is detected only from the system fields `starts_operates` and `powers_on`.
- A "return exception" is a Follow-up return condition; photo gaps and failed optional checks are not.
- Tag-request status updates are always record only: no existing tag status requires customer action.
- The 6 AM Pacific target is a requirement, not a Vercel guarantee; §9.6 records the caveat and the D3B
  verification step.
