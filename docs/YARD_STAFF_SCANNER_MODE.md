# Yard Staff Outbound/Return Scanner Mode

> **Status: Phase 3A + 3A.1 + 3B + 3C BUILT** — outbound baseline, protected atomic staff return, the
> connected condition story (baseline-aware return, structured comparison, renter-report reconciliation,
> session evidence view), and unified condition-history presentation + open-damage surfacing. DB migrations
> `0027`, `0028`, `0029` ship unapplied until `npx.cmd supabase db push`; **Phase 3C adds no schema change**
> (presentation + queries only).

## Phase 3A — as built (authoritative)
Authenticated staff (customer_admin / customer_staff) scan the tag and run an **outbound (pre-use)
inspection** that records baseline condition/accessories/meters/photos and marks the asset **rented**.
- **Route:** `/staff/t/[shortCode]` (new `(staff)` route group, webfont-free, no AppShell). The public
  `/t/[shortCode]` shows an "Open staff workflow" link **only** to an authenticated member of the asset's
  org (`getProfile()` membership check). `lib/staff/guard.ts` resolves the short code via the RLS server
  client → a cross-org/unknown code is `notFound()`; unauthenticated → `/login?next=/staff/t/…`.
- **Engine reuse:** an `inspection_type = "outbound"` variant (`lib/inspections/outbound-templates.ts`,
  keys mirroring the return templates) built on the SAME field builders + validate/snapshot/media pipeline.
  The public inspection form is parametrized (action/copy/context slot) — no second forms engine.
- **Atomicity (migration `0027`):** the `start_outbound_rental` RPC (security invoker, org-scoped)
  creates the active session + sets `assets.active_rental_session_id` + inserts the `pre_use_inspection`
  baseline in ONE transaction. The `set_return_submission_session` trigger is extended to bind the baseline
  to the session. Staged flow: validate → upload media → RPC; the session is never created before valid
  answers + media, and media are cleaned up if the RPC doesn't return `started`. The partial-unique index
  blocks a second active session.
- **Mark rented / timeline / public:** marking rented sets the session pointer, which re-arms the public
  first-rental Quick Start + acknowledgement prompt. The timeline shows `Rental started` + a `Pre-use
  inspection` event (no duplicates). Admin visibility: the submission renders through the same schema-v2
  summary (heading "Outbound inspection"), a "Pre-use inspections" inbox chip, and a baseline link on the
  asset detail + staff summary. Baseline submissions are `status='resolved'` (kept out of the attention
  queue). Media stay private; the action is auditable via `created_by_profile_id` + `submitted_by_name`.
- **NOT built (still deferred):** before/after (outbound-vs-return) comparison, a dedicated `yard_worker`
  role, reservations/booking/billing/dispatch/CMMS/GPS/signatures, offline, video.

## Phase 3A.1 — as built (authoritative)
Corrects the staff RETURN workflow: Phase 3A had the staff summary link a rented asset to the PUBLIC renter
form. Staff now get a dedicated, protected return that completes the rental atomically.
- **Origin + actor (migration `0028`):** `form_submissions.submission_origin` ('public' | 'staff') +
  `submitted_by_profile_id`, both **server-set and un-forgeable** — the `set_return_submission_session`
  trigger stamps them on every insert (anon → public/null; authenticated 'staff' → the caller's own profile
  id, overwritten). Outbound baselines are corrected to origin='staff'.
- **Atomic completion (`complete_staff_return` RPC):** inserts the staff return, closes the active rental
  session, and clears `assets.active_rental_session_id` in ONE transaction (security invoker, org-scoped,
  mirrors `mark_return_and_resolve`). No separate "Mark returned & resolve" step. **Idempotent** — once the
  pointer is cleared, a replay returns the existing completion. Media upload precedes the RPC and is cleaned
  up on failure.
- **Route + template:** `/staff/t/[shortCode]/return` renders the parametrized `ReturnInspectionForm` with a
  **system return template, attestation stripped** (`lib/inspections/staff-return-templates.ts`) — no renter
  acknowledgement, no contact fields, a read-only staff identity block instead. Completing lands on a
  protected `/staff/t/[shortCode]/return/complete` result page (asset Available, session closed, reference,
  condition result, staff name, related renter-report count) — never the public "Sent to…" page.
- **Status semantics:** a clean staff return → `resolved`; a return flagging damage/missing accessories →
  `new` (stays in the attention queue). The rental closes in both cases; damage is never auto-resolved.
- **Records:** staff vs renter returns read distinctly in the inbox (type label + Renter/Staff source badge)
  and timeline; the submission detail links same-session records from the opposite workflow
  (`rental_session_id`, admin-only, never public, same-session only). V2 snapshot self-identifies via
  `data.audience='staff'`.
- **NOT built (still deferred):** before/after comparison, org-customized templates for staff, a dedicated
  `yard_worker` role, work orders / maintenance scheduling / damage billing / signatures, SMS, offline, video.

## Phase 3B — as built (authoritative)
Connects the three condition sources (outbound baseline → renter return report → staff return) into one
story per rental session — all linked by `rental_session_id` only.
- **Baseline-aware staff return:** the staff return page loads the session's outbound baseline + any renter
  reports. A compact renter-report **context card** appears above the form (reference, time, damage/missing,
  notes, photo count, Open report) — context only, nothing pre-filled. Per-field **outbound baseline hints**
  (`outboundBaselineHints`) render as compact expandable `<details>` under the matching field via a new
  optional `baseline` prop on `ReturnInspectionForm`. No outbound → "No outbound baseline recorded"; staff
  answers stay fully editable + independent.
- **Structured comparison (`lib/inspections/session-comparison.ts`, pure):** `buildSessionComparison` diffs
  the V2 payloads by shared field id — meter delta, fuel/condition difference, pass→fail downgrade,
  accessory difference — plus a damage/missing reconciliation summary. Notes come from a CLOSED vocabulary
  ("Difference recorded", "Review recommended", "Renter reported damage", "Staff confirmed damage", "Staff
  did not confirm reported damage"). **No causation / blame / billing** anywhere. No source → no fabricated
  comparison.
- **Renter-report reconciliation (migration `0029`):** `complete_staff_return` re-defined to reconcile
  same-session renter reports IN THE SAME transaction — clean staff + clean renter → the renter report
  auto-**resolves**; otherwise it is marked **reviewed at most** (kept unresolved for a manager).
  Resolved/archived + all unrelated submissions untouched. Mirrored by a pure `reconcileRenterStatus`.
- **Session evidence view** (`/dashboard/rentals/[sessionId]`, authenticated, RLS-scoped): outbound /
  renter(s) / staff sources (via `ReturnInspectionSummary`), the differences table + follow-ups, photos
  grouped by source + slot (signed, private), inspector + renter + references/timestamps, and a Print
  button (printable HTML, no PDF infra). Linked from the staff completion page, submission detail, asset
  detail, and asset timeline.
- **NOT built (still deferred):** damage billing, fault attribution, work orders, maintenance scheduling,
  AI image comparison, renter signatures, GPS, offline, video.

## Phase 3C — as built (authoritative)
Unifies condition-history presentation and makes unresolved damage impossible to miss before re-renting. No
schema change (presentation + queries only).
- **One open-damage definition (`lib/submissions/damage.ts`, pure):** `isOpenDamageRow` = status new/reviewed
  AND (`damage_report` OR `return_checklist` with canonical `damage_observed=yes`, V1/V2, renter or staff).
  Excludes resolved/archived, the outbound baseline, and support requests. Plus `damageSeverityLabel`,
  `openDamageSummaryByAsset` (count + latest), and `openDamageHref` (the one filtered link).
- **No N+1:** the Assets list widens its existing single unresolved-submissions query
  (`OPEN_DAMAGE_COLUMNS`) and groups in memory; single-asset surfaces use one filtered query
  (`getOpenDamageForAsset`). No service-role.
- **Surfaces:** a clickable danger badge (`Open damage` / `Damage · N`) in the Assets-list Status cell, and a
  prominent above-the-fold `OpenDamageAlert` on asset detail (count + latest type · severity · time + Review
  damage / View asset history). Both self-clear when all damage resolves. The `attention=damage` submissions
  filter (asset + unresolved) narrows to open-damage rows only — never undamaged returns.
- **Shared presentation:** `SubmissionBadges` (type + Renter/Staff source + status + Damage/Missing chips,
  reusing `origin.ts`) is used by BOTH the submissions inbox row and the asset-timeline card. `FORM_TYPE_TONE`
  moved to `origin.ts#formTypeTone`. Timeline submission events now carry reference/origin/status/damage/
  missing and render as compact cards matching the inbox (relative time, no raw UTC); still read-time
  derived, newest-first, one event per row (no stored events, no duplication).
- **Cross-links:** damage-related submission details link to "Other open damage for this asset".
- **NOT built (still deferred):** maintenance work orders, repair scheduling, out-of-service workflow,
  automated damage billing, GPS, a stored event-log table, any new public functionality.

## Phase 3C.1 — as built (authoritative)
Mobile UX + soft damage-photo evidence for both renter and staff returns (shared `ReturnInspectionForm`). No
DB/RLS/storage/auth/session change; media limits unchanged.
- **Three primary stages:** Condition → Return details → Review & submit, with explicit Continue/Back (no
  auto-advance), "Step N of 3", per-stage validation, all stages mounted for the single final POST + value/file
  preservation. Stage grouping is the pure `lib/inspections/stages.ts#sectionStage` (section `stage` field else
  id inference) — every system/org/outbound template collapses to ≤3 stages, no template change.
- **Button choice controls:** closed-choice fields (`yes_no`, `pass_fail_na`, `select`, `fuel_charge_level`,
  accessory item state) render as **semantic radios styled as buttons** (44px, wrap at 360–430px, keyboard +
  SR accessible) instead of dropdowns. Text/meter/long-text stay text inputs.
- **Soft damage photos:** `damage_photos` is now optional (return template `V` → 2026-07-2; location/severity/
  description stay required). Zero damage photos no longer blocks Review. On Submit, reported damage with no
  photo opens an accessible native `<dialog>` ("Submit without damage photos?" → Add photos / Submit without
  photos). The server is authoritative: it counts damage photos from validated uploads
  (`resolveDamagePhotoEvidence`), requires the explicit `damage_photos_omission_ack` field, and stores
  `flags.damage_photos_missing` + `data.damage_photo_omission_acknowledged`.
- **Admin visibility:** the return summary shows a "No damage photos" badge + "Damage photos not provided"
  note; the reported damage still renders in full and still counts as open damage (`isOpenDamageRow` keys on
  the damage flag, not photos).
- **Renter vs staff unchanged:** public keeps optional contact + acknowledgement; staff keeps read-only
  identity + no acknowledgement; the omission dialog is renderer-level for both; staff completion still closes
  the session + marks the asset Available.

### Phase 3C.1.1 — hotfix (choice validation + fully non-blocking photos)
- **False required-error fix:** closed-choice fields (yes_no / pass_fail_na / select / severity / fuel /
  accessory items) now submit their value via a **single hidden `answer:<id>` input sourced from the client
  `values` state**; the visible radios group under a non-`answer` name (`ui:<id>`) for UX + a11y only. The
  submitted value is therefore identical to the Review summary + client validation — eliminating the
  "Tires / wheels is required" divergence. Selecting/changing a value clears its stale error immediately, and
  the step to Review validates ALL non-photo required fields (jumping to the offending field's stage).
- **Every photo slot is non-blocking:** `firstInspectionError` and both submit cores no longer enforce any
  photo minimum (overview/category/damage/additional) — validation-only change, **no template/version/snapshot
  change**. Photo fields show no required asterisk + "strongly recommended" copy. Damage location/severity/
  description stay hard-required.
- **One consolidated omission dialog** (priority: damage-without-photo → zero-photos; some-missing angles get a
  non-blocking Review note only). Server `resolvePhotoEvidence` stores `flags.damage_photos_missing` +
  `flags.condition_photos_missing`, `data.photo_omission_acknowledged`, and
  `data.missing_recommended_photo_slots` (all from validated uploads). Admin shows one concise **Evidence**
  note. No-photo damage still counts as open damage. Media limits unchanged.

### Phase 3C.2 — admin cleanup (presentation/routing only)
- **Compact submission rows + single label:** `SubmissionBadges` no longer renders a separate Renter/Staff
  source badge — the `submissionTypeLabel` ("Renter return" / "Staff return inspection" / "Outbound
  inspection") is the one primary label (inbox + timeline). Media thumbnail shrunk to `size-10`; the detail
  header drops the redundant source badge (origin stays in the Performed-by/Submitted-by block).
- **Authoritative quick action:** `canQuickResolveReturn({formType,status,origin,assetRented})` — "Mark
  returned & resolve" shows ONLY for a public/renter `return_checklist` that is new/reviewed AND whose asset
  still has an active rental session. Staff returns never show it; a renter return hides it once a staff
  return has closed the session. One batched active-session query in the inbox (no N+1); one count query on
  the detail page.
- **Session evidence:** canonical route stays `/dashboard/rentals/[sessionId]` (registered + RLS-scoped +
  works after close). `rentalEvidenceHref` guards a falsy id; the staff completion page falls back to the
  asset's most-recent session so the link always resolves.
- **Assets list:** the low-value **Created** column + its Sort option are removed (`VISIBLE_ASSET_SORTS`),
  reclaiming width for status / open-damage / rental action / View-edit; `?sort=created_at` stays
  backward-compatible in the parser. No return/session business logic changed.

### Phase 3C.3 — evidence routing + mobile detail priority + renter photo copy + explicit staff submit
- **Session evidence never 404s:** one canonical route `/dashboard/rentals/[sessionId]` (fetch-by-`rental_session_id`,
  RLS-scoped, closed sessions OK, per-source empty states — 404 only for a missing/cross-org session) plus a new
  index page `app/(admin)/dashboard/rentals/page.tsx` that redirects the bare `/dashboard/rentals` to the
  submissions inbox. One pure helper, `buildSessionEvidenceHref(sessionId)` (with a deprecated `rentalEvidenceHref`
  alias), is used at every link site (staff completion, submission detail, asset detail, asset timeline) and guards a
  falsy id → the safe index redirect. The residual 404 was the null-session-id → bare `/dashboard/rentals` (no index)
  case, now closed. Tests assert the helper output, both route files exist, and each caller passes a `rental_session_id`.
- **Mobile detail leads with the report:** inspection-style detail pages (`isInspectionFormType` — renter return, staff
  return, outbound) reorder to compact header → compact asset/action strip → **inspection report** → status/workflow →
  submitter/inspector → related records, so on a phone the structured report sits near the fold instead of below tall
  asset/status/submitter cards. The report renders ONCE; damage/support keep their established top-down order; desktop
  stays readable; no horizontal overflow.
- **Renter photo copy** (shared renderer only — no template/version/snapshot change): friendlier, context-specific
  guidance overrides the stored `help` by slot — general ("Add a photo if you can…"), damage ("If possible, add a clear
  photo of the damage…"), additional ("Add any other photos…"); Review/dialog warnings reworded ("No photos were
  added…", "Damage was reported without a photo…"). No legal/liability/mandatory claims; "Photos" never "Photo's"; the
  legacy "strongly recommended" copy is gone. Confirmation behavior unchanged (still soft, non-blocking).
- **Explicit staff submit only:** all stage navigation is `type="button"`; only the final "Submit return inspection" is
  `type="submit"`. An `allowSubmitRef` gate + `<form onSubmit>` cancel every implicit/stray submit — the action fires
  ONLY from the final Submit press (no dialog needed) or the confirmed omission dialog. Entering/leaving Review changes
  client stage only (no insert, no upload, no session close); the ref is consumed per submit so a double-click / Enter
  replay submits once. Review-first is preserved for the public renter form too.

### Phase 3C.4 — evidence loader repair + direct photo copy + count sync + above-fold status + bulk triage
- **Session-evidence 404 — final root cause = a swallowed DB error from an ambiguous embedded relationship.**
  `asset_rental_sessions` has TWO foreign keys to `assets` (`asset_id → assets.id` AND
  `assets.active_rental_session_id → asset_rental_sessions.id`), so the old `.select("… asset:assets(…)")` embed was
  ambiguous (PostgREST **PGRST201**); the page discarded the error and treated `data = null` as `notFound()`, so every
  session 404'd. **Not** RLS, not a wrong id, not active-session filtering. Fix: `getRentalSessionEvidence`
  (`lib/rentals/session-evidence.ts`) loads the session **by id, no embed**, captures `error`, **throws + logs
  `[session-evidence]`** on an unexpected DB error, returns `null` only for a missing / cross-org-hidden session, and
  loads asset + submissions separately (missing related records → empty states, never 404). `isLikelyUuid` rejects a
  malformed param up front. **No migration** — the `for all` org-scoped RLS already reads closed sessions.
- **Direct photo copy** (`lib/inspections/photo-copy.ts`, renderer-only — templates/snapshots untouched): expectation-
  setting, never hedged ("Add a photo showing the equipment's condition…", damage/additional/named-slot variants) +
  reworded review/dialog warnings; still optional, omission dialog unchanged. No "if possible/if you can/where
  practical/strongly recommended/Photo's".
- **One count, no stale badge:** `countNewSubmissions` (`status='new'`) feeds both the nav badge (`app-shell`) and the
  inbox "X new" pill. `revalidateSubmissionSurfaces()` (`revalidatePath("/dashboard","layout")` + the inbox) runs after
  every status mutation (single, mark-returned, staff completion, bulk, public submit) so the layout-hosted badge
  refreshes without a manual reload — no polling, no `router.refresh` loop.
- **Above-the-fold status actions:** direct state-aware buttons in the detail header (`nextStatusActions` +
  `SubmissionStatusActions`) replace the lower Status card + `<select>`. Archive confirms; reopen/restore explicit; the
  current status is never offered. An active renter return shows **Mark returned & resolve** and hides ordinary Resolve;
  a server guard in `setSubmissionStatus` rejects resolving an active renter return so no path bypasses physical return.
- **Inbox multi-select + safe bulk toolbar:** `BulkSelectionProvider` (client, keyed by filter signature → selection
  clears on any filter change) adds a checkbox column + select-all-visible; `bulkSetSubmissionStatus` (RLS client, no
  service role, UUID-validated, cap 100) updates in one request. Bulk **Resolve** is partitioned by
  `partitionBulkResolve` — active renter returns are skipped with a clear banner ("N renter return(s) … skipped because
  … rental is still active"); staff returns + damage/support resolve normally. Bulk Archive confirms with the count.

### Phase 3C.5 — status-action colors + outbound attestation/terminology + evidence presentation
- **Status-action colors track their target status.** One pure `submissionStatusActionClasses(targetStatus)` (`lib/ui/status.ts`)
  keyed on the TARGET state, matching the badge tone families — `resolved`→emerald, `new`→sky, `reviewed`/`archived`→neutral
  (Archive stays neutral, not destructive-red — the Archived badge is neutral). Used by `SubmissionStatusActions`, the bulk
  toolbar, and `MarkReturnedResolveButton` (emerald, its resolve target). Labels + focus/disabled affordances retained.
- **Outbound attestation false error — root cause = the acknowledgement was the ONLY field posting its value from the live
  checkbox DOM (`"on"`) instead of a hidden input mirroring React `values`** (the 3C.1.1 canonical pattern every choice field
  uses). That decoupled the POSTed attestation from `values.attestation="yes"` (Review + client gate), so the server saw
  `attestation !== "yes"` and rejected a confirmed attestation. Fix: the acknowledgement now renders a UI-only checkbox + a
  canonical hidden `answer:attestation` input sourced from state, so POST ≡ Review ≡ client gate ≡ server. `validate.ts`
  semantics + the explicit-submit gate are unchanged (one rental start per confirmed submit).
- **Outbound terminology + accessories** (shared form, keyed by `template.inspection_type`): stage 2 is "Outbound details",
  the final step "Review & start rental", the submit CTA "Complete inspection & mark rented", the completion banner "Outbound
  inspection completed — asset is now rented, rental session started". Accessories read **Issued / Not issued / N/A** and store
  `issued`/`not_issued` (return keeps `returned`/`missing`); `ACCESSORY_STATES` accepts both. `lib/inspections/accessories.ts`
  (`accessoryPresence` / `accessoryLabel`) normalizes for display + comparison, so LEGACY outbound rows (stored
  `returned`/`missing`) still render as Issued/Not issued — no JSON rewrite, no backfill. Outbound template version bumped
  `2026-07-1` → `2026-07-5`; return templates + wording unchanged.
- **Session evidence as collapsed disclosures.** Every group (Differences / Outbound baseline / Renter return report(s) /
  Staff return inspection / Photos by source) is a native `<details data-evidence-section>` (all collapsed by default; ≥44px
  summary with a count/status; multiple-open; opening fetches nothing; empty → concise text, never 404). Photos render ONCE
  (`ReturnInspectionSummary` gains `hidePhotos`) in a responsive tiled **gallery** (`EvidencePhotoGallery` +
  `galleryBySource`, `grid-cols-2 → sm:3 → lg:4`) that dedupes exact repeated storage paths and merges their slot captions;
  tiles open the signed image in a new tab; Download + private signed URLs preserved. `PrintEvidenceButton` opens every
  disclosure before `window.print()` (restored after) + an `@media print` block so the printed record is complete + compact.

---

> **Original design (future scope beyond 3A).** This documents the broader wave so it can be
> scoped without re-discovery. See [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md).

## Goal

Give **authenticated yard workers** a fast, phone-first way to scan a tag on a piece of
equipment as it leaves the yard (outbound) and again when it comes back (return), and to run a
**lightweight yard workflow** at each point. It ties the existing permanent QR tag to a
rental session and the asset's condition history — nothing heavier.

The intent is operational hygiene at the yard gate: *what went out, in what condition, with
what accessories, and what came back.*

## Boundary — what this is NOT

- **Not rental booking / reservations.** No availability calendar, no quotes, no contracts.
- **Not a full Rental Management System (RMS).** No billing, invoicing, or fleet financials.
- **Not a CMMS.** No work orders, PM scheduling, or maintenance planning.

It is a thin capture layer over the tag scan, tied to **rental sessions** and **condition
history** that the product already models. Anything beyond that is a separate, larger effort.

## Future capabilities (candidate scope)

- **`yard_worker` role** — a staff-level role scoped to yard operations (below customer_admin;
  cannot manage users, plans, or org settings).
- **Staff scanner mode** — an authenticated scan view distinct from the public equipment page,
  surfaced only to yard staff.
- **Outbound flow — "mark rented / start session":**
  - Capture **condition photos** at outbound.
  - Record **accessories / attachments** that go out with the unit.
  - Record **fuel / charge level** and a short **condition checklist**.
  - Start a rental session for the asset.
- **Return flow — "mark returned / close session":**
  - Capture **condition photos** at return.
  - Flag **damage** and **missing accessories** against what went out.
  - Record returned fuel/charge and checklist.
  - Close the rental session.
- **Timeline integration** — every outbound/return action writes to the **asset timeline**, so
  the equipment's history reads as one continuous record.
- **Optional notifications** — notify the admin on damage/missing-accessory flags (reusing the
  existing notification plumbing; opt-in per org).

## How it ties into what exists today

- **Rental sessions** already exist (migration 0014) — outbound/return would start/close them.
- **Acknowledgements** and the **asset timeline** already capture events — condition photos and
  yard actions would append to that same history.
- **Notifications** already have a dry-run-capable sender — damage/missing flags could reuse it.

None of the above is modified by this document; these are the seams a future wave would build on.

## Explicitly out of scope (for the future wave, too)

Booking/availability, billing/invoicing, maintenance work orders, telematics/GPS, and any
customer-facing self-service rental flow. If those are wanted, they are their own initiatives.
