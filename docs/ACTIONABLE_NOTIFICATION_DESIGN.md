# Actionable Notification Design — Engineering Phase D

**Status: D0 DESIGNED (2026-09-10). Nothing in this document is built.** Branch `pilot-credibility` @
`ee29113`. Production deployment `jswtabswl` → `mulemark.io`.

> **This is Engineering Phase D (actionable notifications).** It is *not* the business roadmap's
> "Phase D - Controlled pilots" in `roadmap.md`, which is untouched by this work.

**Objective.** A recipient should be able to understand what happened, how serious it appears, whether
anyone needs to act now, who to contact, and whether photographs exist — without first opening Mulemark.

**Companion objective.** Mulemark remains the canonical record and action surface. Email is a concise,
secure incident brief, not a second uncontrolled copy of the entire submission.

Every claim about current behaviour below was read from the repository on 2026-09-10 and carries a
`file:line` reference. Where something was not verified, it says so.

---

## Contents

1. Current-state audit
2. Data inventory
3. Missing data
4. Canonical projection
5. Priority rules
6. Event matrix
7. Email wireframes
8. Photo strategy
9. Routing strategy
10. Privacy and security rules
11. Backward compatibility
12. Phased file plan
13. Acceptance criteria
14. Explicit non-goals
15. Operator test matrix
16. Operator decision points

---

## 1. Current-state audit

### 1.1 Environment, verified read-only

| Item | Finding | How known |
|---|---|---|
| Branch / HEAD | `pilot-credibility` @ `ee29113`, clean, synced with origin | `git status`, `git rev-parse` |
| Production deployment | `jswtabswl` (`dpl_AHM9…`), created 2026-09-09 16:20 PDT, CLI-deployed so it carries no git SHA. Its runtime tree equals HEAD: the only later non-documentation change is two `package.json` script registrations (C10). | `vercel inspect mulemark.io`, `git diff --stat 11063a1 HEAD` |
| Notification env | `RESEND_API_KEY` (secret), `NOTIFICATION_FROM_EMAIL`, `NOTIFICATION_REPLY_TO_EMAIL` — **Production only**; none on Preview | `vercel env ls production` (names only, values never printed) |
| Sender / Reply-To | `Mulemark <notifications@notify.mulemark.io>` / `support@mulemark.io` | `EMAIL_DELIVERABILITY_RUNBOOK.md` |
| Per-organization recipients on Production | **Not queried.** Reading them needs a service-role query that would print addresses. Last recorded state: the QA org recipient was cleared to NULL after C6.1. | — |
| Migration ledger | CLI is linked to **staging**; `supabase migration list` there shows **0001–0033 matched** today. Production was last verified 0001–0033 in Phase A6.3 and was not re-verified (the CLI is deliberately not relinked). | `supabase migration list`, `MIGRATION_LEDGER.md` |
| Resend open/click tracking | **Still unrecorded** — a provider-side setting the app cannot assert | `EMAIL_DELIVERABILITY_RUNBOOK.md:72` |

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

### 1.5 Findings recorded by D0 (not fixed here)

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| F1 | The summary plumbing is dead: `ScheduledNotification` has no `summary` field, so `notifySubmission` always passes `""` | `schedule.ts:42-49`, `notify.ts:56,109` | Replaced by the projection in D1 |
| F2 | Submitter contact in the email comes from browser form values passed through the scheduler, not from the committed row | `lib/forms/submit.ts:232`, `inspections/submit.ts:234` | D1 reads the row |
| F3 | The damage form's urgency **defaults to `medium`**, so a stored `medium` is not evidence of a renter's choice | `components/public/damage-form.tsx:17` | D2 removes the default; D1 never escalates on `medium` |
| F4 | `damageSeverityLabel` uses damage-report **urgency** as severity, conflating the two concepts this phase separates | `lib/submissions/damage.ts:62-65` | D2 |
| F5 | The tag-request notifier runs on **every save**, including notes-only saves; dedupe holds only for Resend's 24 h window, so a later notes-only save re-sends. `delivered_at` is re-stamped on every save while delivered. | `lib/tags/owner-actions.ts:35-55`, `idempotency.ts:6-8` | D3: notify only on an actual status change |
| F6 | `scripts/production/qa-notification-recipient.mjs` also writes `notify_damage_reports = true` on `--set`, contrary to its own "exactly one column" header | `:19`, `:119-122` | Documentation fix at the next touch |
| F7 | `parseAnswerValues` stores values for fields hidden by `visible_when`; only visible fields are validated | `lib/inspections/validate.ts:98-99,120-125` | Any email projection must apply visibility (§10) |
| F8 | CSV export and the dashboard card summary read only V1 flat keys, so they show blanks for V2 returns | `lib/submissions/csv.ts:31-37,77-96`, `app/(admin)/dashboard/page.tsx:70-73` | Out of Phase D scope; recorded |
| F9 | Uploaded photos are stored exactly as sent — no resize, no EXIF/GPS strip | `lib/forms/submit.ts:148-154`, `inspections/submit.ts:142-148` | Email previews must strip metadata (§8); storage itself unchanged |
| F10 | The `audience` type comment says staff outbound inspections carry `audience:"staff"`; outbound never writes it | `lib/inspections/types.ts:158-160`, `outbound-submit.ts:157-163` | Comment fix at the next touch |
| F11 | The staff return route exports no `maxDuration`, unlike the public form routes (`maxDuration = 60`) | `app/forms/[shortCode]/{damage,support,return}/page.tsx` | Verify before D3 schedules work there |
| F12 | No length or size limit is enforced on subject, text or HTML | `send.ts:135-143` | D1 adds caps (§13) |

---

## 2. Data inventory

Legend: **Server** = server-authoritative (derived or validated server-side, not trusted browser text).
**Email** = recommended email treatment. **Now** = included in today's email.

### 2.1 Damage report

| Stored field / path | Type | Current label | Server? | Email | Now | Compatibility | Sensitive |
|---|---|---|---|---|---|---|---|
| `id` → reference `SUB-YYYY-XXXXXX` | uuid → derived string | Reference | Server-derived (`inbox.ts:36-47`); id may be a validated client UUID token | Yes | Yes | Stable | No |
| `created_at` | timestamptz | relative time | Server-set (`submit.ts:174`) | **No** — the client's Date header serves; no org timezone exists | No | — | No |
| `asset_code`, `asset_name`, `category` | text | chip | Server lookup | Yes | Yes | name/category nullable | No |
| `submitted_by_name` | text | Name | Browser, required (`validate.ts:48`) | Yes, contact block | Yes | — | **PII** |
| `submitted_by_email` | text | Email | Browser, regex-checked (`validate.ts:51`) | Yes, `mailto:` only if valid | Yes | nullable | **PII** |
| `submitted_by_phone` | text | Phone | Browser, format **not** validated | Yes, `tel:` only after sanitizing | Yes | nullable | **PII** |
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
| `answers.values.damage_severity` | `minor`/`moderate`/`severe` | "Severity" | Browser, validated select | Yes, as "Reported damage severity" | No | absent on custom templates | No |
| `answers.values.damage_description` | long text | "Describe the damage" | Browser | Yes, excerpt ≤ 300 | No | system templates only | Free text |
| `pass_fail_na` answers = `fail` | enum | field label + "Fail" | Browser, validated | **Failed check labels** (visible fields only) | No | any template, detected by field type | No |
| `starts_operates` / `powers_on` = `no` | yes/no | field label | Browser | "Reported not starting / not powering on" | No | system template ids only | No |
| `fuel_or_charge_level` | free string | Fuel / charge level | **Not validated server-side** (`validate.ts:171`) | **No** (app-only) | No | — | No |
| `engine_hours`, `run_hours` | number | meter | Browser | No (app-only) | No | — | No |
| `cleaned`, other yes/no, long-text notes | mixed | labels | Browser | No (app-only) | No | V1 `condition_notes` | Free text |
| `answers.photos.<slot>[]` | `{path, caption}` | slot label | path server-built; caption = slot label | Counts + slot labels; paths never | No | absent in V1 | Paths internal |
| `flags.damage_photos_missing`, `flags.condition_photos_missing`, `missing_recommended_photo_slots` | boolean / slot ids | "Evidence" note | Server, counted from validated uploads | "Evidence gap" line | No | absent before 3C.1 / 3C.1.1 | No |
| `photo_omission_acknowledged` | true | acknowledged note | Server decides need; browser sends ack | No (app-only) | No | legacy `damage_photo_omission_acknowledged` | No |
| `answers.values.attestation` | `yes`/`no` | skipped in summary | Browser | No | No | — | No |
| `rental_session_id` (column) | uuid | session link | Trigger | "Linked to an active rental" line only | No | null when not rented / pre-0024 | No |

### 2.4 Staff return checklist

Same V2 shape as 2.3, plus:

| Field | Type | Current label | Server? | Email | Sensitive |
|---|---|---|---|---|---|
| `submission_origin='staff'`, `audience:"staff"` | enum | "Staff return checklist" (`origin.ts:44`) | Server / RPC | Yes, event label | No |
| `submitted_by_name`, `submitted_by_email` | text | "Performed by" | Server, from the authenticated profile | Name only; staff email **omitted** | Staff PII |
| `status` | `new` if flagged, else `resolved` | badge | Server | No | No |
| Template | system return template without attestation (`staff-return-templates.ts:17-40`) | — | Server | — | — |

### 2.5 Outbound inspection

| Field | Type | Current label | Server? | Email | Sensitive |
|---|---|---|---|---|---|
| `form_type='pre_use_inspection'`, `status='resolved'` | enum | "Outbound inspection" (`origin.ts:42`); the notifier label would say "Pre-use inspection" (`display.ts:26`) | Server | Not notified | No |
| `answers.values.condition_notes` | long text | "Existing condition notes" | Browser | — | Free text |
| `flags.damage_observed` (from `existing_damage`) | yes/no | Existing damage | Server | — | No |
| accessories `issued`/`not_issued`/`na` | enum | item list | Browser | — | No |
| session `renter_label`, `rental_reference` | text ≤ 120 | Renter / Rental reference | Browser, trimmed | — (app-only) | **Possible PII** |

### 2.6 Tag request status update

| Field | Type | Current label | Server? | Email | Now | Sensitive |
|---|---|---|---|---|---|---|
| `status` | 6-value CHECK (`0010:15-16`) | `tagRequestStatusLabel` (`tag-requests.ts:30-41`) | Server whitelist | Yes | Yes | No |
| `id` | uuid | reference | Server | Yes | Yes | No |
| `material`, `mounting_method`, `tag_size`, `quantity_notes` | free text | request detail | Browser (customer admin) | One summary line, optional (D3) | No | No |
| `tag_request_assets.quantity` | int | per-asset quantity | Browser | Total count, optional (D3) | No | No |
| `production_notes` | text | internal | Platform owner | **Never** | No | Internal |
| `requested_by_profile_id` | uuid | — | Server | No | No | No |

---

## 3. Missing data

### 3.1 Captured, but not emailed

- Damage: reported urgency (legacy), description.
- Support: preferred contact method, description.
- Returns (renter and staff): damage flag, damage location, severity and description; missing
  accessories and which items; failed checks; "does not start / power on"; photo-evidence gaps.
- All submissions: photo count and, for returns, which slots have photos; submission origin; whether the
  record is linked to an active rental.
- Canonical event label ("Renter return checklist" / "Staff return checklist").

### 3.2 Not captured at all

- **Reported equipment state** (operating, limited, not operating, immobilized, unsafe) — no form asks.
- **Reported response need** (routine, prompt, immediate) — damage urgency is a partial, default-biased
  stand-in (F3); support requests capture nothing.
- **Issue type** for support requests (breakdown, stuck, rollover/safety, operating question).
- **Damage severity on damage reports** — deliberately still not captured (§16 DP-1).
- **Organization timezone** — which is why the brief carries no absolute timestamp.

### 3.3 Should remain app-only

Full checklist answers; meter readings; fuel/charge level; template name/version and snapshot; acknowledgement
and attestation detail; internal notes; `production_notes`; rental reference and renter label; staff email
addresses; status history and related records; **every storage path, bucket name and signed URL**; the
full description beyond the excerpt; original full-resolution photos.

---

## 4. Canonical projection

One server-only, pure-after-load projection per notification. It is built from the **committed row plus
trusted server lookups**, never from browser input carried across the commit.

```ts
type NotificationPriority = "immediate" | "prompt" | "routine" | "record";

type NotificationBrief = {
  event: "damage_report" | "support_request" | "renter_return" | "staff_return" | "tag_status";
  eventLabel: string;               // "Damage report", "Renter return checklist", … (submissionTypeLabel)
  reference: string;                // SUB-YYYY-XXXXXX, or the tag request id
  organizationName: string;
  asset: { code: string | null; name: string | null; category: string | null } | null;
  priority: NotificationPriority;
  headline: string;                 // deterministic phrase from the winning priority rule (§5.4)
  reported: {                       // renter/staff selections, always presented as "Reported …"
    issueType: IssueType | null;    // null = not asked on this event
    equipmentState: EquipmentState | null;
    responseNeed: ResponseNeed | null;
    damageSeverity: DamageSeverity | null;
    legacyUrgency: "low" | "medium" | "high" | null;
  };
  descriptionExcerpt: string | null;  // ≤ 300 chars, whitespace-collapsed, control chars stripped
  exceptions: string[];               // return checklists only; visible fields only; labels, not values dumps
  evidenceGaps: string[];             // return checklists only; never raises priority above routine
  contact: {
    name: string | null;
    preferredMethod: "email" | "phone" | "text" | null;
    phone: string | null;             // display form
    phoneHref: string | null;         // "tel:+16045550100", only when sanitizable
    email: string | null;             // only when it passes the existing regex
  } | null;                           // staff events: name only
  linkedToActiveRental: boolean;
  photos: {
    count: number;                    // images on the record
    slotLabels: string[];             // return checklists
    previewCandidates: string[];      // storage paths, SERVER-ONLY: never rendered, never logged (§8)
  };
  links: { record: string; settings: string };   // publicEnv.siteUrl only
};
```

**Construction rules**

1. The scheduler payload shrinks to identifiers: `{ organizationId, submissionId }` (plus `event` for
   staff returns). Browser-derived `submittedBy` is no longer passed.
2. The notifier loads the row with the existing service-role client, filtered by **both** `id` and
   `organization_id`, selecting only the columns the projection needs. A missing row sends nothing and
   logs `failed_transient` with `failureClass: "record_missing"` (no new outcome value).
3. Projection is a **pure function** of `(row, asset, organization)` so every rule is unit-testable.
4. `previewCandidates` never leaves the server process: not rendered, not logged, not placed in an
   idempotency key.
5. The brief is built **once** per notification and reused for every recipient.

Why not the example shape in the Phase D brief verbatim: `occurredAt` is dropped (no organization
timezone; see 3.2), `submitter` becomes `contact` with sanitized action hrefs, `primaryAction` /
`settingsAction` collapse into `links` because there is exactly one action surface, and
`preferredPhotoPaths` is renamed `previewCandidates` to make its server-only status explicit.

---

## 5. Priority rules

### 5.1 Triage vocabulary (kept separate on purpose)

| Concept | Values |
|---|---|
| Issue type | `damage_impact`, `breakdown`, `stuck_recovery`, `rollover_safety`, `operating_question`, `other`, `unknown` |
| Reported equipment state | `operating`, `operating_limited`, `not_operating`, `immobilized`, `unsafe`, `unknown` |
| Reported response need | `routine`, `prompt`, `immediate`, `unknown` |
| Damage severity (only where damage is relevant) | `minor`, `moderate`, `major`, `unknown` |

Severity and urgency are different things: a scratched fender is minor damage needing routine review; a
machine stuck in mud may have no damage and need immediate recovery; a rollover is major, unsafe and
immediate; a no-start is not operating without being a severe damage event.

Return-checklist `damage_severity` stores `severe`; it maps to `major` for rules and displays the
template's own option label ("Severe").

### 5.2 Presentation levels

| Level | Recipient decision it supports |
|---|---|
| **Immediate attention** | Act now |
| **Prompt follow-up** | Contact the submitter soon / check the asset before its next rental |
| **Routine review** | Review later |
| **Record only** | No immediate action |

### 5.3 Rules — first match wins

```
tag_status                                            → record
renter_return | staff_return:
    damage OR accessories missing OR ≥1 failed check
      OR reported not starting / not powering on      → prompt      (never higher)
    evidence gaps only                                → routine
    otherwise (clean)                                 → record
damage_report | support_request:
    responseNeed = immediate
      OR equipmentState ∈ {unsafe, immobilized}
      OR issueType = rollover_safety                  → immediate
    responseNeed = prompt
      OR equipmentState ∈ {not_operating, operating_limited}
      OR issueType ∈ {breakdown, stuck_recovery}
      OR (no triage recorded AND legacyUrgency = high) → prompt
    otherwise                                         → routine     (never record)
```

Invariants, each a test:

- **No AI and no free-text interpretation.** Only enumerated stored values and canonical flags are read.
  The description never influences priority.
- **A clean return checklist is always `record`.**
- **A return checklist can never be `immediate`.** The equipment is already back; the data describes a
  follow-up, not an emergency.
- **Damage alone does not imply immediate.** A damage report with `operating` + `routine` is `routine`.
- **A damage or support report is never `record`.**
- **`unknown` or absent never raises a level.** It is displayed as "Not reported" / "Unknown".
- **Legacy urgency `medium` and `low` never raise a level** (F3). Legacy urgency is ignored entirely once a
  row carries `triage_version`.
- **Reported values stay reported.** Every renter or staff selection is labelled "Reported …" and the
  brief carries the line "These are the submitter's selections, not a verified inspection."
- **Visibility is applied.** Failed checks and damage details are read only from sections and fields
  whose `visible_when` holds (F7).

### 5.4 Headline — deterministic, from the winning rule

| Winning condition | Headline |
|---|---|
| `issueType = rollover_safety` | reported rollover or safety incident |
| `equipmentState = unsafe` | reported unsafe to operate |
| `equipmentState = immobilized` | reported stuck or unable to move |
| `responseNeed = immediate` | immediate assistance requested |
| `equipmentState = not_operating` | reported not operating |
| `issueType = breakdown` | reported breakdown |
| `issueType = stuck_recovery` | reported stuck, recovery needed |
| `equipmentState = operating_limited` | reported operating with limitations |
| `responseNeed = prompt` | follow-up requested |
| legacy `urgency = high` | reported urgency: high |
| routine damage report | damage reported |
| routine support request | support request |
| return with exceptions | {Renter\|Staff} return checklist, N exception(s) |
| return, evidence gaps only | {Renter\|Staff} return checklist, photos missing |
| clean return | Renter return checklist, no exceptions |

Order within a level follows the table; this is the tie-break and it is tested.

### 5.5 Worked examples (become table-driven tests)

| Event | Stored values | Priority | Headline |
|---|---|---|---|
| Damage | state `operating`, need `routine` | routine | damage reported |
| Damage | state `unsafe`, need `routine` | **immediate** | reported unsafe to operate |
| Damage | state `not_operating`, need `unknown` | prompt | reported not operating |
| Damage (legacy) | urgency `medium` | routine | damage reported |
| Damage (legacy) | urgency `high` | prompt | reported urgency: high |
| Damage (triage + stray urgency `high`) | state `operating`, need `routine`, urgency `high` | routine | damage reported |
| Support | issue `stuck_recovery`, need `immediate` | **immediate** | immediate assistance requested |
| Support | issue `stuck_recovery`, need `routine` | prompt | reported stuck, recovery needed |
| Support | issue `operating_question`, need `routine` | routine | support request |
| Support (legacy) | no triage | routine | support request |
| Renter return | damage `yes`, severity `severe` | prompt | Renter return checklist, 1 exception |
| Renter return | clean, all photos | record | Renter return checklist, no exceptions |
| Renter return | clean, `condition_photos_missing` | routine | Renter return checklist, photos missing |
| Staff return | accessories missing + 1 failed check | prompt | Staff return checklist, 2 exceptions |
| Renter return (V1 flat) | `damage_observed: "yes"` | prompt | Renter return checklist, 1 exception |
| Renter return (custom template) | flags clean, a hidden section holds `fail` | record | Renter return checklist, no exceptions |
| Tag request | status `in_production` | record | — |

---

## 6. Event matrix

| | Damage report | Support request | Renter return checklist | Staff return checklist | Tag request status |
|---|---|---|---|---|---|
| **Subject** | `{prefix}{code} — {headline}`; routine: `New damage report — {code}` | `{prefix}{code} — {headline}`; routine: `Support request — {code}` | exceptions: `Follow up: {code} — renter return checklist, N exceptions`; clean: `Renter return checklist — {code}, no exceptions` | `Follow up: {code} — staff return checklist, N exceptions` | unchanged: `Tag request updated — {organization}` |
| **Prefix** | `Immediate attention: ` / `Follow up: ` / none | same | `Follow up: ` / none | `Follow up: ` | none |
| **Preheader (first visible line)** | `Reported: {state} · {need} · {n} photos · {name} ({preferred})` | `Reported: {issue} · {need} · {n} photos · {name} ({preferred})` | `Exceptions: {list} · {n} photos` or `No action required. No exceptions reported.` | `Exceptions: {list} · {n} photos · by {staff name}` | `Status: {label}` |
| **Priority treatment** | full range except record | full range except record | prompt / routine / record | prompt only (sent only with exceptions) | record |
| **Above the fold** | priority label, event, asset, headline, reported state/need, excerpt, contact | priority label, event, asset, headline, reported issue/need, excerpt, contact + preferred method | exceptions, damage location + severity + excerpt, missing items, failed checks, contact (if given), photos by slot | exceptions, damage detail, staff name | status, reference |
| **Omitted** | paths, URLs, legacy fields beyond urgency | paths, URLs | full checklist, meters, fuel, notes, template, attestation, rental reference | same + staff email | `production_notes`, requester |
| **Primary CTA** | Open in Mulemark → `/dashboard/submissions/{id}` | same | same | same | View tag requests → `/dashboard/tag-requests` |
| **Call / email** | `tel:` + `mailto:` when present and sanitized | same; preferred method listed first | only if contact provided | none | none |
| **Photos** | count; D4: ≤ 3 previews | count; D4: ≤ 3 previews | count + slot labels; D4: damage slot first | count + slot labels; D4 previews | none |
| **Plain text** | complete brief; no information exists only in HTML | same | same | same | same |
| **No-action wording** | never (a report is never record) | never | clean: "No action required." | never sent clean | "No action required." |

Staff return checklists and outbound inspections: staff returns notify only with exceptions (§9);
**outbound inspections never notify** — they are the organization's own baseline record.

Subject rules: the asset code always follows the prefix so a phone notification truncates the headline,
not the code; no free text ever enters a subject; CR/LF stripped; capped at 78 characters by truncating
the headline; never "urgent", never "!", never marketing phrasing.

---

## 7. Email wireframes

Plain text is shown; the HTML part carries the same content in the same order (7.7).

### 7.1 Damage report — immediate attention

```
Subject: Immediate attention: EXC-001 — reported unsafe to operate

Reported: unsafe to operate · immediate assistance requested · 3 photos · Jamie Rivera (prefers phone)

IMMEDIATE ATTENTION — Damage report
Asset: EXC-001 — Mini Excavator (Excavators)

What was reported
"Tipped onto its side on the slope by the gate. Boom arm looks bent."

Reported equipment state: Unsafe to operate
Reported response need: Immediate assistance
Damage severity: Not assessed
These are the submitter's selections, not a verified inspection.

Contact
Jamie Rivera — prefers phone
Phone: +1 604 555 0100
Email: jamie@site.test

Photos: 3 on the record
Reference: SUB-2026-A1B2C3

Open in Mulemark: https://mulemark.io/dashboard/submissions/<submission id>

You are receiving this because Northridge Rentals has email notifications enabled for damage reports. Change this under Settings → Notifications: https://mulemark.io/dashboard/settings
```

### 7.2 Support request — prompt follow-up

```
Subject: Follow up: SKD-014 — reported stuck, recovery needed

Reported: stuck, recovery needed · follow up soon · no photos · Sam Lee (prefers text)

FOLLOW UP — Support request
Asset: SKD-014 — Compact Track Loader

What was reported
"Sunk to the tracks in soft ground near the new footing. Not damaged as far as I can tell."

Reported issue: Stuck / needs recovery
Reported response need: Follow up soon
These are the submitter's selections, not a verified inspection.

Contact
Sam Lee — prefers text
Phone: +1 604 555 0199

Photos: none
Reference: SUB-2026-9F21D0

Open in Mulemark: https://mulemark.io/dashboard/submissions/<submission id>

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
Equipment state and response need were not asked on this report.

Contact
Pat Morgan
Email: pat@site.test

Photos: 1 on the record
Reference: SUB-2026-44B1E9

Open in Mulemark: …
```

### 7.4 Renter return checklist — exceptions

```
Subject: Follow up: TRL-007 — renter return checklist, 2 exceptions

Exceptions: damage reported, accessories missing · 5 photos

FOLLOW UP — Renter return checklist
Asset: TRL-007 — 16 ft Utility Trailer
Linked to an active rental.

Exceptions
- Damage reported: left fender (reported severity: Moderate)
  "Crease along the rear edge of the fender."
- Accessories missing: Ratchet straps
These are the submitter's selections, not a verified inspection.

Photos: 5 on the record — Front / hitch photo (2), Deck photo (1), Damage photos (2)

Contact
Alex Chen
Email: alex@site.test

Reference: SUB-2026-7C0A55

Open in Mulemark: …
```

### 7.5 Renter return checklist — clean (mode "all" only)

```
Subject: Renter return checklist — PLT-002, no exceptions

No action required. No exceptions reported · 2 photos

RECORD ONLY — Renter return checklist
Asset: PLT-002 — Plate Compactor

Photos: 2 on the record
Reference: SUB-2026-0B3D19

Open in Mulemark: …
```

### 7.6 Staff return checklist — exceptions

```
Subject: Follow up: EXC-001 — staff return checklist, 2 exceptions

Exceptions: 1 failed check, reported not starting · 4 photos · by Morgan (staff)

FOLLOW UP — Staff return checklist
Asset: EXC-001 — Mini Excavator

Exceptions
- Failed check: Hydraulics / leaks
- Reported not starting

Photos: 4 on the record — Overall photo (2), Additional photos (2)
Reference: SUB-2026-D1E2F3

Open in Mulemark: …
```

### 7.7 HTML structure (all events)

```html
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">
  <p>Reported: unsafe to operate · immediate assistance requested · 3 photos · Jamie Rivera (prefers phone)</p>
  <p><strong>IMMEDIATE ATTENTION</strong> — Damage report<br>Asset: EXC-001 — Mini Excavator (Excavators)</p>
  <p><strong>What was reported</strong><br>“Tipped onto its side …”</p>
  <p>Reported equipment state: Unsafe to operate<br>Reported response need: Immediate assistance<br>…</p>
  <p><strong>Contact</strong><br>Jamie Rivera — prefers phone<br>
     <a href="tel:+16045550100">Call +1 604 555 0100</a> · <a href="mailto:jamie@site.test">Email Jamie</a></p>
  <!-- D4 only: -->
  <p><img src="cid:mm-preview-1@mulemark" alt="Damage photo 1 of 3" width="200" style="max-width:100%;height:auto;border:0"></p>
  <p>Photos: 3 on the record · Reference: SUB-2026-A1B2C3</p>
  <p><a href="https://mulemark.io/dashboard/submissions/…">Open in Mulemark</a></p>
  <p>You are receiving this because …</p>
</div>
```

Rendering rules: no `<style>` block, no background colours, no colour-only meaning (the priority is a
word), no hidden preheader text, no web fonts, no tables required for layout, inline styles limited to
font and spacing. That keeps it legible in dark mode, in Outlook's Word renderer and in clients that
strip CSS. The HTML part stays under 20 KB so Gmail never clips it (clipping begins near 102 KB of HTML;
inline image attachments are separate MIME parts and do not count).

---

## 8. Photo strategy

### 8.1 Options

| Option | Evaluation | Decision |
|---|---|---|
| 1. No photo in email | Safest and smallest. Recipient learns only that photos exist. | **Baseline (D1–D3) and the permanent fallback** |
| 2. Expiring remote / signed image links | A signed URL is a bearer credential to private evidence: forwardable, logged by mail gateways, and pre-fetched by link scanners. Remote images are blocked by default in many clients anyway. **Forbidden by the Phase D guardrails.** | **Rejected** |
| 3. Original attachments | Up to 8 × 10 MB exceeds Resend's 40 MB per-email limit; a full-resolution uncontrolled copy of evidence; originals keep EXIF/GPS (F9). | **Rejected as a default** |
| 4. Small CID inline previews, derived at send time | Bounded, re-encoded, metadata-stripped copies embedded as MIME parts. Display even when remote images are blocked in most desktop clients; some webmail may show them as attachments (Resend documents this caveat). Nothing new is stored. | **Recommended for D4** |
| 5. Stored derived thumbnails | Would also help inbox performance, but creates new storage objects, a backfill and retention questions while storage lifecycle is still deferred (`ROADMAP_DEFERRED.md` #8). | **Rejected for Phase D; future option** |
| (5b) Supabase image transformation | Requires a paid Supabase plan; Production is on Free (verified 2026-09-10). | **Not available** |

None of the recommended paths makes private evidence public: the bucket stays private, no URL is
issued, and nothing new is written to storage.

### 8.2 Recommended specification (D4)

| Rule | Value |
|---|---|
| Count | at most **3** previews |
| Selection | returns: `damage_photos` slot first, then remaining slots in template-snapshot order; damage/support: `media_urls` order |
| Eligibility | path is present in the row's own `media_urls`, starts with `org/{orgId}/asset/{assetId}/submission/{submissionId}/`, and has a `jpg`/`jpeg`/`png`/`webp` extension |
| Source read | service-role storage download (already the notifier's client); skip any object over 10 MB before decoding |
| Transform | auto-orient, then resize to fit **640 × 640**, never enlarge; encode **JPEG** quality ~70 |
| Metadata | **stripped** (EXIF, GPS, ICC comments) — the encoder's default; asserted by a test that reads the output metadata |
| Decode safety | input pixel limit (~40 MP) to refuse decompression bombs; corrupt input fails that preview only |
| Size | ≤ **120 KB** each (one lower-quality retry, then drop); ≤ **400 KB** total |
| Budget | separate media budget (~6 s) before the send; the 15 s send budget is unchanged |
| Attachment | `content_type: image/jpeg`, `filename: photo-1.jpg`, `content_id: mm-preview-1@mulemark` (Resend `attachments[].content_id`, < 128 chars) |
| HTML | `<img src="cid:…" alt="Damage photo 1 of 3" width="200">` |
| Text part | unchanged: "Photos: 3 on the record" — true whether or not previews render |
| Failure | any failure drops that preview; **all failing produces a text-only email — never a suppressed one** |
| Logging | counts only: `previewsAttempted`, `previewsAttached`, coarse `previewFailureClass`; never a path, filename or byte content |
| Body construction | built once before the retry loop, so every attempt carries the same key and identical payload |
| Endpoint | single-send `POST /emails` only; Resend does not support inline images on the batch endpoint |

### 8.3 Dependency

**No existing direct dependency can do this.** `sharp` 0.34.x is present only as an *optional*
dependency of Next (`node_modules/next/package.json` `optionalDependencies`); nothing in the app imports
it, and relying on a transitive optional install is not acceptable for a production path. D4 requires
adding **`sharp` as an explicit dependency pinned to Next's version**, confirming the Linux binary
installs in the Vercel build, and recording the function-size change. **This needs operator approval**
(§16 DP-5).

---

## 9. Routing strategy

### 9.1 Current model

One `notification_email` plus four per-event booleans on `organizations` (`0012:15-20`). Not in the anon
grant; readable by any member of the organization (`0001:283-284`); writable only by a customer admin or
the platform owner (`0032:138-148`); server action gated by `requireCustomerAdminOrgId`
(`lib/notifications/actions.ts:40`). No CHECK constraints; no RLS or security test covers these columns.

### 9.2 Proposed model (smallest useful for a pilot)

| Column (migration 0034, additive) | Type | Purpose |
|---|---|---|
| `notification_email` | unchanged | default recipient |
| `urgent_notification_email` | text, nullable | **optional escalation address**: receives **immediate-attention** items in addition to the default |
| `return_checklist_notify_mode` | text NOT NULL, CHECK `all` / `exceptions` / `off` | replaces the boolean's meaning; backfilled `true → all`, `false → off` |
| `notify_return_checklists` | kept, synced from the mode for one release | rollback safety; dropped in a later migration |
| `notify_include_photo_previews` | boolean NOT NULL default true | lets an organization keep photos out of email entirely; read only once D4 ships |

Deliberately **not** added: per-event override addresses (no evidence they are needed), CC lists, a rules
engine, schedules, or on-call rotation.

### 9.3 Behaviour

| Event | Default address | Escalation address |
|---|---|---|
| Damage / support, immediate | if its event flag is on | **yes** (§16 DP-6: independent of the event flag) |
| Damage / support, prompt or routine | if its event flag is on | no |
| Renter return, `all` | every return, including clean | no (returns are never immediate) |
| Renter return, `exceptions` | only prompt-level returns (damage, missing, failed check, not starting); evidence-gap-only and clean returns are not sent | no |
| Renter return, `off` | none | no |
| Staff return | only prompt-level returns, when mode ≠ `off`; only on RPC result `completed` | no |
| Outbound inspection | never | never |
| Tag request | only when the status actually changed and its flag is on | no |

### 9.4 Multiple recipients: separate sends

Each recipient receives its **own** API request. Not To+CC, not BCC:

- **Privacy:** no recipient learns the other address.
- **Idempotency:** the existing key already binds a recipient hash (`idempotency.ts:53-58`), so each send
  is independently deduplicated and independently retry-safe. One shared request would make one key
  cover two deliveries.
- **Failure isolation:** a bounce or rejection of one address cannot fail the other.
- **Diagnosability:** one `[notifications]` line per recipient, with an additive `recipientRole`
  (`default` / `escalation`) field.
- **De-duplication:** identical addresses (trimmed, case-insensitive) collapse to a single send.
- **Order and budget:** default first, then escalation, each within its own 15 s send budget; the brief
  and previews are built once. Worst case ≈ 0.1 s load + 6 s media + 2 × 15 s ≈ 36 s, inside the
  60 s `maxDuration` of the public form routes. The staff return route must be given an explicit
  `maxDuration` first (F11).

---

## 10. Privacy and security rules

1. **Committed data only.** The brief is built from the row loaded by `id` **and** `organization_id`,
   after the insert or RPC has succeeded. Browser values are never carried across the commit.
2. **Nothing request-bound enters `after()`.** No `FormData`, request, headers or cookies — identifiers
   only. The notifier uses the service-role client, which reads no request state.
3. **Service-role scope is unchanged**: organization settings, the one asset, the one submission and, in
   D4, only that submission's own media objects. It is never used to read customer data for display.
4. **No storage path, bucket name, signed URL or original file** in the subject, text, HTML, logs,
   idempotency key or attachment filename.
5. **No free text in subjects.** Subjects use enumerated phrases and the asset code only; CR/LF stripped.
6. **Free text in the body is escaped**, whitespace-collapsed, stripped of control characters and
   truncated (description 300, location 120).
7. **Only canonical links**: `publicEnv.siteUrl` for web links; `tel:` only from a phone reduced to
   digits and a leading `+` (7–15 digits, else shown as text without a link); `mailto:` only for an
   address passing the existing regex.
8. **No action links.** No link changes a status, resolves, acknowledges or unsubscribes. Every action
   happens behind authentication in Mulemark.
9. **Visibility applied** to inspection answers; hidden stored values are ignored (F7).
10. **Staff email addresses are never emailed**; staff are named only.
11. **Logs stay redacted**: no body, excerpt, contact detail, path or preview content. New fields are
    counts and coarse classes only.
12. **RLS, roles and Preview isolation unchanged.** New organization columns follow 0012: not added to the
    anon grant, written only under the 0032 admin policy, covered by a new security test.
13. **Preview stays dry-run** before credentials are read, exactly as today. Preview may still build the
    brief and previews so staging QA exercises the pipeline; nothing is sent.
14. **Reported, not verified.** No email states a mechanical or safety determination; no public report
    changes an asset's rental or service state.
15. **Delivery is best-effort** and is never described as guaranteed in product copy or documentation.

---

## 11. Backward compatibility

| Area | Concern | Handling |
|---|---|---|
| Return data shapes | Five shapes: V1 flat; V2 `2026-07-1`; V2 `2026-07-2` before and after the 3C.1.1 hotfix (same version string); custom org templates (integer versions, org-defined ids) | Detect by `schema_version`, then by key presence — never by version string. Canonical flags first, V1 flat fallback (reuse `returnChecklistFlags`, `lib/submissions/returns.ts:49-70`). Failed checks by field **type** from the snapshot, so custom templates work; operating-state detection uses system ids only and is documented as such. |
| Missing optional keys | `damage_photos_missing`, `condition_photos_missing`, `missing_recommended_photo_slots` absent on older rows | Absent = not reported; the evidence-gap line is omitted rather than inferred |
| Legacy damage urgency | `low`/`medium`/`high`/null, default-biased | Displayed as "Reported urgency"; only `high` raises to prompt, and only on rows without `triage_version` |
| Deploy window (D2) | A renter with the old form open posts `urgency` without triage fields | The server keeps accepting the legacy field until the old HTML can no longer be cached; such rows project as legacy |
| Scheduler signature | `ScheduledNotification` shrinks | Both callers and their tests change in the same slice; the payload is never persisted, so an in-flight `after()` always runs the code it was scheduled by |
| Existing B4 tests | "no urgency hook" and "exactly one link" assertions | Deliberately revised in D1 (priority prefix; `tel:`/`mailto:` actions), with the new rules asserted instead (§13) |
| Idempotency | Key format | Unchanged: `mm.submission.<id>.<hash>`; a changed recipient is still a new key |
| Return-checklist setting | Boolean → mode | Backfilled, boolean kept in sync for one release |
| Admin UI | "Urgency" badges on existing rows | Remain for legacy rows; new rows show reported response need (D2) |
| Outbound accessory vocabulary | `returned`/`missing` legacy vs `issued`/`not_issued` | Outbound is never notified; no impact |
| Tag request emails | Status-change-only (D3) | A same-status save no longer emails; a genuine change still does |

---

## 12. Phased file plan

Each slice is separately approved, gated, committed and pushed.

### D1 — Projection, priority and text-first brief

No form, schema, settings or media change.

| File | Change |
|---|---|
| `lib/submissions/triage.ts` (new) | Enum values and display labels shared by forms, admin and email |
| `lib/notifications/priority.ts` (new) | Pure `priorityFor(...)` + headline; table-driven tests |
| `lib/notifications/projection.ts` (new) | Pure `projectSubmission(row, asset, org)` handling every data shape; fixture tests per shape |
| `lib/notifications/notify.ts` | Load the committed row by id + organization; build the brief; `record_missing` handling |
| `lib/notifications/schedule.ts` | Identifier-only payload |
| `lib/notifications/email.ts` | `buildIncidentEmail(brief)`; subject/HTML caps; tag builder unchanged |
| `lib/forms/submit.ts`, `lib/inspections/submit.ts` | Pass identifiers only |
| Tests | `priority.test.ts`, `projection.test.ts`, `email.test.ts`, `notify.test.ts`, `schedule.test.ts`, `submit-cleanup.test.ts`, `inspections/submit.test.ts` |

### D2 — Reported triage on public forms

| File | Change |
|---|---|
| `lib/forms/validate.ts`, `lib/forms/actions.ts` | Validate new enums; write `triage_version: 1`; keep accepting legacy `urgency` for the deploy window |
| `components/public/damage-form.tsx` | "Can the equipment still be used?" + "How soon do you need help?" — **no pre-selected value** |
| `components/public/support-form.tsx` | "What's happening?" + "How soon do you need help?" |
| Public thanks pages | If DP-9 is approved: truthful expectation copy pointing to the company's phone for anything immediate |
| `lib/submissions/display.ts`, `inbox.ts`, `damage.ts` | "Reported …" labels; stop using urgency as severity for new rows |
| E2E | form specs for both forms; legacy-post acceptance |

The scan-page guard applies: no brass, no webfonts, no new client JS beyond native selects.

### D3 — Routing and return modes

| File | Change |
|---|---|
| `supabase/migrations/0034_notification_routing.sql` (new) | Columns in §9.2, backfill, CHECK |
| `lib/notifications/settings.ts`, `actions.ts`, `components/notification-settings-form.tsx`, `app/(admin)/dashboard/settings/page.tsx` | New fields, validation, admin-only |
| `lib/notifications/notify.ts` | Recipient fan-out, de-duplication, `recipientRole` log field |
| `lib/inspections/staff-return-submit.ts` + its route | Schedule exception notifications on `completed`; explicit `maxDuration` (F11) |
| `lib/tags/owner-actions.ts` | Read the prior status; notify only on change; stop re-stamping `delivered_at` (F5) |
| `tests/security/…` | Anon cannot read the new columns; staff cannot write them |

### D4 — Photo previews

| File | Change |
|---|---|
| `package.json` | `sharp` explicit dependency (DP-5) |
| `lib/notifications/previews.ts` (new) | Selection, eligibility, download, transform, caps, budget |
| `lib/notifications/email.ts`, `send.ts` | Optional `attachments` on `EmailContent`, passed through unchanged; CID references |
| `lib/notifications/log.ts` | Count fields |
| Tests | EXIF stripped, dimensions and byte caps, foreign-path refusal, corrupt/oversized/timeout → text-only send |

### D5 — Live verification and closeout

Operator test matrix (§15), updates to `EMAIL_DELIVERABILITY_RUNBOOK.md`, `OPERATIONS_RUNBOOK.md`,
`SECURITY_MODEL.md`, `roadmap.md`, and a Phase D readiness note.

---

## 13. Acceptance criteria

### D1

- The notifier loads the committed row by `id` **and** `organization_id`. A test schedules with contact
  values that differ from the row's and proves the email shows the row's.
- `priorityFor` is pure; §5.5 is a table-driven test; each invariant in §5.3 has its own test, including
  "clean return → record", "return never immediate", "damage/support never record", "unknown never
  raises", "legacy medium never raises".
- All five return data shapes project without throwing and produce the expected exceptions; a hidden
  failed field is ignored.
- The text part leads with the preheader line, then the priority label, and contains everything the HTML
  contains.
- Subject contains the asset code, no free text, no "urgent", no "!", ≤ 78 characters.
- No output contains `org/`, `submissions`, `token=`, `sign`, a bucket name or a storage path, asserted
  with a fixture row whose `media_urls` hold realistic paths.
- Web links point only at the canonical host; `tel:` and `mailto:` only after sanitization.
- HTML ≤ 20 KB, escaped, no `<img>`, no `<style>`, no hidden text.
- A missing row sends nothing and logs `failed_transient` / `record_missing`; nothing throws.
- Idempotency key format unchanged.
- lint, typecheck, test, build pass; E2E notification-adjacent specs pass.

### D2

- Triage selects have no default; the server rejects unknown values; rows carry `triage_version: 1`.
- A post with only legacy `urgency` still succeeds and projects as legacy.
- Admin surfaces label renter selections "Reported …"; severity is no longer derived from urgency on new
  rows.
- E2E covers both forms, keyboard operation and the legacy post.

### D3

- Migration is additive and backfills correctly (`true → all`, `false → off`); anon cannot read the new
  columns; staff cannot write them.
- An immediate item reaches both addresses as two sends with two keys and two log lines; identical
  addresses produce one send; prompt/routine items never reach the escalation address.
- Return modes follow §9.3 exactly, including "evidence gaps only" not sending in `exceptions` mode.
- A staff return notifies only with exceptions, only on `completed`, never on `already_completed`.
- An outbound inspection never notifies.
- A tag request saved without a status change sends nothing.

### D4

- ≤ 3 previews; each ≤ 640 px on the long edge, ≤ 120 KB, JPEG; ≤ 400 KB total.
- Output carries no EXIF/GPS (asserted by reading the output's metadata).
- A path outside the submission's prefix, or not in its `media_urls`, is never read.
- Corrupt, oversized, timed-out or failed downloads still produce a sent text-only email.
- Originals are never attached; the text part is unchanged by preview success or failure.
- Logs carry counts only.
- `notify_include_photo_previews = false` produces a text-only email.

### D5

- Every row in §15 executed or explicitly marked not run, with date and client.
- B4's outstanding replay check (`EMAIL_DELIVERABILITY_RUNBOOK.md` row 8) attempted.

---

## 14. Explicit non-goals

- SMS, push notifications, a notification center or in-app notification feed.
- An on-call scheduler, escalation chains, SLA timers or assignment.
- A work-order/CMMS system, automatic dispatch, or asset service-state automation.
- **An operational hold / out-of-service workflow** — recorded as a separate future phase
  (`ROADMAP_DEFERRED.md` #3), not part of Phase D.
- AI or free-text incident classification, summarization or severity inference.
- Automatically changing a submission's or asset's status from a report.
- One-click or unauthenticated action links, including unsubscribe links that change settings.
- A durable queue, outbox or delivery-history table (the B4 decision stands).
- Renter-facing confirmation emails.
- Original full-resolution attachments; signed media URLs; a public bucket; stored derived images.
- Organization timezone settings; localized email; a templating framework or React Email.
- Open or click tracking; link shorteners; a dedicated IP; Resend's batch endpoint.
- Marketing email, a visual email rebrand, or brand artwork in email.
- Guaranteed delivery claims of any kind.

---

## 15. Operator test matrix

Run against demo/QA data only. Production sends only to an approved QA address (`delivered@resend.dev`
or `support@mulemark.io`) set through `production:qa-recipient`, cleared afterwards. Record date, client
and observed result for every row; a row not run stays marked **not run**.

### 15.1 Events and priorities

| ID | Scenario | Environment | Expected |
|---|---|---|---|
| E1 | Damage report: unsafe to operate | Production (QA org) | Subject `Immediate attention: {code} — reported unsafe to operate`; one email; `sent` + providerId |
| E2 | Damage report: operating, routine | Production | `New damage report — {code}`; routine label |
| E3 | Support request: stuck, immediate | Production | Immediate attention; contact preferred method first |
| E4 | Support request: operating question, routine | Production | Routine |
| E5 | Renter return with damage + missing accessories, mode `all` | Production | Follow up; 2 exceptions listed |
| E6 | Clean renter return, mode `all` | Production | "No action required" |
| E7 | Clean renter return, mode `exceptions` | Production | No email; `skipped_disabled` logged |
| E8 | Evidence-gap-only renter return, mode `exceptions` | Production | No email |
| E9 | Staff return with a failed check | Production | Follow up; staff named, no staff email |
| E10 | Clean staff return | Production | No email |
| E11 | Outbound inspection | Production | No email, no log line |
| E12 | Tag request status change | Production | One email |
| E13 | Tag request notes-only save | Production | No email |
| E14 | Any event on staging with a recipient set | Staging | `dry_run`, `reason: preview_environment`, no send |

### 15.2 Routing

| ID | Scenario | Expected |
|---|---|---|
| R1 | Escalation address set; immediate damage report | Two emails, two providerIds, two log lines (`default`, `escalation`) |
| R2 | Escalation address equals default | One email |
| R3 | Prompt-level report with escalation set | Default only |
| R4 | Immediate report with the damage flag off (DP-6 as recommended) | Escalation only |
| R5 | Replay of the same submission within 24 h | No second email per recipient; original providerId returned |

### 15.3 Clients and rendering

| ID | Client / condition | Check |
|---|---|---|
| C1 | Gmail web | Subject, preheader, priority word, links, previews inline, no clipping |
| C2 | Gmail iOS/Android notification preview | Subject keeps the asset code; first line readable |
| C3 | Outlook desktop (Windows) | Layout intact without CSS; previews inline or as attachments; no Junk (note allowlist state) |
| C4 | Outlook web | Same |
| C5 | Apple Mail (macOS and iOS) | Same; dark mode legible |
| C6 | Restrictive corporate client / gateway | Delivered; links unwrapped or noted; previews possibly stripped — brief still complete |
| C7 | Images blocked | Alt text meaningful; "Photos: N on the record" still true |
| C8 | Dark mode (Gmail app, Apple Mail, Outlook) | No invisible text; priority readable without colour |
| C9 | Text-only view | Complete brief; no information exists only in HTML |
| C10 | Reply to the email | Reaches `support@mulemark.io` |

### 15.4 Media and failure

| ID | Scenario | Expected |
|---|---|---|
| M1 | Return with 6 photos across 3 slots incl. damage | 3 previews, damage first |
| M2 | Photo with GPS EXIF | Preview carries no EXIF/GPS (inspect the received attachment) |
| M3 | 10 MB photo | Preview ≤ 120 KB, ≤ 640 px |
| M4 | Preview generation forced to fail (staging fault flag in tests only) | Text-only email still delivered |
| M5 | `notify_include_photo_previews = false` | Text-only |
| M6 | Provider failure | Submission unaffected; `failed_*` logged (B4 row 7, still not run) |

---

## 16. Operator decision points

Recommendations are stated; each needs an explicit decision before the slice that depends on it.

| # | Decision | Recommendation | Needed before |
|---|---|---|---|
| DP-1 | Damage form asks equipment state + response need only; damage severity not asked publicly | Yes — two groups carry the priority; severity from a renter adds little and staff assess it | D2 |
| DP-2 | Triage questions required with no pre-selected value (a "Not sure" option on equipment state) | Yes — avoids repeating the `medium` default problem | D2 |
| DP-3 | Subject priority prefixes (`Immediate attention:`, `Follow up:`) — revises the B4 "no urgency hook" rule | Yes — deterministic, non-marketing, and the most useful phone-preview signal | D1 |
| DP-4 | `tel:` / `mailto:` contact actions — revises the B4 "exactly one link" rule | Yes — the canonical host rule is preserved for web links | D1 |
| DP-5 | Inline photo previews at all, `sharp` as a new dependency, previews on by default per organization | Yes, with the organization toggle | D4 |
| DP-6 | Escalation address receives immediate items even when that event's default flag is off | Yes — the flag governs routine volume, not safety escalation | D3 |
| DP-7 | Return-checklist mode default for new organizations | Keep `off` (preserves today); onboarding recommends `exceptions` | D3 |
| DP-8 | Staff return checklists notify on exceptions | Yes | D3 |
| DP-9 | Public thanks page shows "for anything immediate, call {company phone}" after an immediate/unsafe selection | Yes — email is best-effort and a renter must not rely on it | D2 |
| DP-10 | Additive log fields (`recipientRole`, preview counts) | Yes | D3 / D4 |
