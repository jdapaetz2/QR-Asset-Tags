# Return Inspection V2 — Design of Record

> **Status: Phase 1 BUILT & CLOSED — ready to merge pending `db push`.** Phase 1 covers 1A (guided
> inspections), 1A.1 (mobile two-stage flow + conditional photos), and 1B (organization category defaults
> + template catalog). It ships behind migrations `0024` **and** `0025`, both **unapplied until the
> operator runs `npx.cmd supabase db push`**. The rest of this document remains the broader design of
> record; **the "as built" sections below are authoritative where they differ from the design** (see the
> reconciliation section immediately following). Phases 2 / 3 are still future waves.
> Related: [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md), [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md),
> [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md), [`NON_GOALS.md`](NON_GOALS.md),
> [`DATA_MODEL.md`](DATA_MODEL.md).

---

## Phase 1A — as built (authoritative)

This section records what actually shipped in Phase 1A. Where it differs from the design narrative later
in this document, **this section wins**.

**Templates (system, in code).** Six curated system templates live in `lib/inspections/templates.ts`
(`utility_trailer`, `mini_excavator_skid_steer`, `portable_generator`, `plate_compactor`,
`electrical_test_equipment`, `generic`), each version-stamped and deep-snapshotted into the submission at
submit time. No template DB table, no org customization, no form builder, no e-signatures (attestation
checkbox only). Closed field model in `lib/inspections/types.ts` (10 field types; single-equality
`visible_when` / `required_when`).

**Explicit asset-level assignment.** `assets.return_inspection_template_key` (migration `0024`, anon
column grant) is the source of truth. Assignment is chosen in the asset create/edit form and CSV import,
resolved by the single pure resolver `resolveReturnTemplateKey({assignmentKey, category})`:
valid explicit assignment → **conservative exact-alias** category suggestion → `generic`.

**No broad category normalization / fuzzy matching.** Category → template is an **exact-alias** lookup
only (trim + case-fold + collapse internal whitespace) in `lib/inspections/resolve.ts`. No substring,
similarity, or renaming. A suggestion only preselects/resolves — it **never** overwrites a stored explicit
key when the category later changes (the UI surfaces an inconsistency note instead).

**Media caps: 8 images / 40 MB total** (not the 12 / 60 MB floated in the design), images only, ≤10 MB
each, per-slot min/max, required damage photo when damage is observed. Enforced in
`lib/forms/media.ts` (`validateInspectionFiles`) + `lib/inspections/submit.ts`. The 40 MB cap fits under
the existing `serverActions.bodySizeLimit` (52 MB) — **the global limit was not raised** for more media.

**No browser autosave.** The guided form keeps every step mounted (hidden via the `hidden` attribute) and
submits once; there are no per-step server calls and no local-storage autosave.

**Server-authoritative + DB-enforced session integrity.** The browser sends only contact + `answer:*` +
`photo:*` + honeypot. The server derives org/asset/`form_type`/`status`/flags/template/snapshot. A
`BEFORE INSERT` trigger (`set_return_submission_session`, SECURITY DEFINER, `search_path=public`)
authoritatively sets `form_submissions.rental_session_id` from the asset's `active_rental_session_id`
(matching org+asset), overwriting any client-supplied value — so a public submission can never associate
itself with an unrelated rental session. `form_type` stays `return_checklist`; V1 vs V2 is discriminated
by `submission_data_json.schema_version` (2 = V2). No `mark_return_and_resolve` (0022) change, no backfill.

**Deferred (NOT built in 1A):** org category-default management + org-customized inspection content
(1B/2), form builder / drag-and-drop editor, e-signatures, yard-worker mode + outbound baseline /
comparison (3), video, offline, autosave, storage-quota billing, CMMS, rental booking.

### Phase 1A.1 — mobile flow correction (presentation only)
Follow-up wave after mobile testing. **No** change to the data/security model, migrations, template
assignment/resolution, snapshot mechanism, media limits, admin summary semantics, or V1 support.
- **Two stages, not ~5 screens.** The public form (`components/public/return-inspection-form.tsx`) is now
  **Inspection** (one vertically scrollable page of section cards) → **Review & submit**, with a single
  final POST. Both stages stay mounted (hidden) so Back never clears answers or selected files. Opening
  Review is gated by the pure `firstInspectionError` (`lib/inspections/validate.ts`), which scrolls/focuses
  the first invalid field; the server stays authoritative.
- **Inline damage.** The conditional Damage-details card (incl. its required photo) mounts inline directly
  under "Damage observed? = Yes" and unmounts on "No" — so hidden damage files are discarded, never
  uploaded. There is no separate photo screen.
- **Always-available Additional photos.** A new **optional** system slot `additional_photos` (stable id,
  `minPhotos:0`, in every template after damage details / before confirmation) lets renters attach extra
  photos regardless of the damage answer. It flows through the unchanged server collector + global 8-file
  / 40 MB caps and is grouped under **Additional photos** in the admin summary automatically.
- **Confirmation button.** The shared `FormThanks` now shows a prominent full-width **Return to equipment
  page** button (`/t/[shortCode]`) — applied to the return, damage, and support confirmation pages alike.

> **Superseded by Phase 3C.1 (mobile UX + soft damage photos):** the guided form is now a **three-stage**
> flow (Condition → Return details → Review), closed-choice fields render as **buttons** (not dropdowns), and
> damage photos are **strongly recommended, not required** — reported damage may be submitted without photos
> after an explicit confirmation, recorded as `flags.damage_photos_missing` +
> `damage_photo_omission_acknowledged` (return template `V` = 2026-07-2). See
> [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md) → "Phase 3C.1". No data-model/RLS/storage/media-limit change.

### Phase 1B — organization category defaults + template catalog
Lets an organization map its OWN exact category values to a default system return template, and adds a
read-only catalog. **No** custom template-content editing, form builder, fuzzy matching, or category
renaming. The final resolved key is still stored on each asset.
- **Migration `0025`** `inspection_category_defaults` (`organization_id`, `category_value`,
  `normalized_category_value`, `return_template_key`; unique `(organization_id,
  normalized_category_value)`; `for all` RLS `is_platform_owner() or organization_id = current_org_id()`;
  `authenticated`-only grant, **no anon**; no key CHECK — app-validated).
- **Resolution order** is now **explicit assignment → organization category default → conservative system
  suggestion → generic** (`resolveReturnTemplateKey` takes an optional `categoryDefaults` lookup;
  `source` gains `category_default`). Matching is exact-normalized (`normalizeCategoryKey`), never fuzzy.
- **Public route unchanged / never reads the table.** `app/forms/[shortCode]/return/page.tsx` and
  `lib/inspections/submit.ts` resolve purely from the asset's stored key and do **not** pass or fetch
  `categoryDefaults` — the mapping table is admin-time only (create/edit asset, import, bulk-apply).
- **Templates → Return inspections** page: read-only system catalog with an inert
  `ReturnTemplatePreview`, per-category mapping management (create/change via upsert, remove), a
  deliberate **Apply to unassigned** action (null-key assets in that category only; explicit assignments
  never touched; count-confirmed), and an "assets needing review" list (unassigned / generic /
  differs-from-default = "review recommended", not errors).
- Changing or removing a mapping only affects future resolution — it never rewrites existing assets.

### Phase 2 — versioned organization templates (constrained editor)
An organization may **copy** a curated system template and customize it within strict boundaries. NOT a
form builder: system templates stay in TypeScript/read-only; org templates live in the DB, are versioned,
and are **immutable once published**.
- **Migration `0026`** `inspection_templates` (`organization_id`, `inspection_type`, `family_key` [version
  lineage], `version` int, `status` draft/published/retired, `name`, `description`,
  `source_system_template_key`, `definition_json`; `unique(org, family_key, version)` + a partial unique
  **one-draft-per-family** index; `for all` RLS; **no anon grant**). A `enforce_inspection_template_lifecycle`
  trigger makes published versions immutable (published → only → retired; retired frozen; draft free).
  Adds `assets.return_inspection_template_id` (anon-readable) with a cross-org guard trigger, and
  `inspection_category_defaults.return_template_id`. **Public read** is only via the SECURITY DEFINER
  `get_asset_return_template(asset_id)` RPC — returns a **published** definition for a **public** asset in
  the **same org**, nothing else (no drafts, no lists, no cross-org).
- **Definition = `InspectionTemplate`.** `validateOrgTemplateDefinition` (server-authoritative) REBUILDS
  the definition from an allow-list + the closed field-type set, forbids multi-condition rules, and
  requires the attestation to remain — so no arbitrary HTML/CSS/script or unsupported types can be stored.
- **Resolution order** is now **asset custom published template → asset system key → org category default
  (custom id or system key) → system suggestion → generic.** The custom tier is a server pre-step
  (published-ness is a DB fact); a retired/absent custom falls through and the asset is flagged for review
  (never auto-switched).
- **Snapshot unchanged:** the resolved (custom or system) definition is frozen into each submission, so old
  submissions always render from their stored snapshot even after new versions publish.
- **Editor** at `.../return-inspections/custom/[id]`: rename, description, per-field label/help/required,
  add-field (closed set), reorder, select options, photo slots, single-equality conditions, enable/disable
  sections, inert preview, publish, create-new-version, retire, discard-draft, and a count-confirmed
  **Move assigned assets to new version**.
- **Not built (still deferred):** blank-canvas creation, drag-and-drop layout, arbitrary rules/JS, nested
  conditions, e-signatures, template marketplace, AI-generated safety content, outbound inspections,
  before/after comparison, yard-worker mode, and (this wave) assigning **custom** template ids via CSV
  import (import still resolves to a system key).

---

## Goal
Turn the flat public Return checklist (name/contact, condition notes, fuel/charge, cleaned y/n,
accessories-returned y/n, damage-observed y/n, ≤5 photos) into a **category-aware, guided, mobile
return inspection** that produces clear condition evidence and makes the product stickier — **without**
a form builder, e-signatures, or CMMS scope, and by **reusing** the existing submission / media /
timeline / rental-session / `mark_return_and_resolve` machinery.

## Differentiation held onto
Permanent metal QR tag; no app for renter-facing use; the same QR page carries support, manuals, issue
intake, and return inspection; public renter workflow now + authenticated yard-worker workflow later;
rental-session + asset-timeline context; done-with-you implementation.

---

## 1. Current state (audited)
- **Public return:** `app/forms/[shortCode]/return/page.tsx` → `PublicFormLayout` (locked-asset card) →
  `ReturnForm` inside the shared `PublicForm` shell (name/contact/photos/honeypot/submit).
- **Shared submit core:** `lib/forms/submit.ts` `submitPublicForm` — honeypot → `resolvePublicEquipment`
  (org/asset server-derived) → validate fields+files → org-scoped upload → insert (id + created_at set
  app-side for a byte-identical reference) → `notifySubmission` → `redirect(thanks?ref=)`. Only anti-abuse
  is the honeypot.
- **Schema:** `form_submissions` (`0001_init.sql`) — `form_type` CHECK already allows `return_checklist`
  (+ an unwired `pre_use_inspection`); `submission_data_json jsonb` (untyped), `media_urls jsonb` (array
  of storage **paths**, signed at read), status new/reviewed/resolved/archived. Anon **insert-only**;
  authenticated org-scoped RW.
- **Return helpers:** `lib/submissions/returns.ts` `returnChecklistFlags` (`damage_observed==="yes"`,
  `accessories_returned==="no"`); `lib/submissions/display.ts` `submissionFields`.
- **Admin detail:** `app/(admin)/dashboard/submissions/[submissionId]/page.tsx` — `<dl>` of fields,
  signed thumbnails, status form, `MarkReturnedResolveButton`, asset + timeline links.
- **Timeline:** `lib/timeline/timeline.ts` — **derived at read** from submissions + rental_sessions +
  acks + tag_requests (no stored event log).
- **Rentals:** `asset_rental_sessions` (`0014`), one active per asset, `assets.active_rental_session_id`
  app-maintained pointer (anon reads only that column). `mark_return_and_resolve` RPC (`0022`) closes the
  session + clears the pointer + resolves the submission atomically/idempotently.
- **Media:** bucket `submissions` (private); app enforces **5 files / 10 MB each / images only**;
  path `org/{org}/asset/{asset}/submission/{sub}/{uuid}.ext`.
- **Template precedent:** `equipment_page_templates` (`0008`) holds **only org rows**; the 8 **system
  templates live in TS** (`lib/onboarding/templates.ts`), resolved code-side (org key → system → null);
  **no versioning/snapshot**; RLS authenticated-only.
- **Categories:** `assets.category` is **free text** (no taxonomy). Next migration number = **0024**.

---

## 2. Data model — reuse submissions + JSON snapshot; templates in code
Do **not** add first-class inspection submission tables. `form_submissions` already carries org/asset
linkage, media, status, anon-insert RLS, reference numbers, timeline derivation, and the atomic close
RPC.

- **Keep `form_type='return_checklist'`** so `mark_return_and_resolve`, inbox filters, and
  `canQuickResolveReturn` are unchanged. Discriminate V1 vs V2 with `submission_data_json.schema_version`.
- **V2 `submission_data_json`** (self-describing + version-frozen):
  ```json
  { "schema_version": 2, "template_key": "mini_excavator", "template_version": "2026-07-1",
    "template_snapshot": { "…exact template used…" },
    "answers": { "<field_id>": "<value>", "photos_overview": [{"path": "…", "caption": "…"}] },
    "flags": { "damage_observed": "yes|no", "accessories_missing": true } }
  ```
  `template_snapshot` **freezes the exact checklist** → history is immutable even if the template later
  changes. `flags.*` are canonical top-level so `returnChecklistFlags` + the dashboard attention queue
  keep working (helper updated to read either shape).
- **Photos** stay in the flat `media_urls` union (existing thumbnail/first-image/mark code unaffected);
  per-slot mapping (`slot_id`, `caption`) lives in `answers.photos_*`.
- **Migration `0024`** (nullable, server-set, no behavior change for old rows) adds to `form_submissions`:
  `rental_session_id uuid` (server-derived from `resolved.activeRentalSessionId`; foundational for future
  baseline comparison + richer timeline; hard to backfill later), `inspection_template_key text`,
  `inspection_template_version text` (indexable without JSON digging). No template FK (templates are code
  in Phase 1). No `form_type` CHECK change, no RLS change.
- **System templates live in TS code** (mirrors the equipment-template precedent — zero seed drift, no
  anon DB read): `lib/inspections/templates.ts` + pure `resolveReturnTemplate(category)` (system by
  category → generic fallback). The public form's RSC imports the resolved definition directly — **no
  template table, no anon RLS in Phase 1.**
- **Future-proofing (no build):** the template carries `inspection_type` (`return` now;
  `outbound`/`delivery`/`service` later); the same V2 JSON shape + `rental_session_id` let those reuse the
  identical machinery — a comparison is a query over an asset's submissions by type + session.

## 3. Template model
- **Phase 1 — system templates only, in code.** Curated per-category TS constants with an explicit
  `version`; resolution `asset override → system-by-category → generic`. No org editing, no builder, no
  DB table. Matches `NON_GOALS.md` ("fixed templates only", "no drag-and-drop builder").
- **Phase 2 — constrained org copy/customize.** DB table `inspection_templates` mirroring
  `equipment_page_templates` (single table, `organization_id NULL` reserved-system / `is_system` flag,
  **org rows only in DB**; RLS `select: is_system OR own-org OR owner; write: own non-system`). Columns:
  `inspection_type`, `category`, `version int`, `status`, `definition_json`, `source_template_key`.
  Customization is **enable/disable sections, mark required, add fields from the closed set** — not a
  blank canvas. **Versioning = immutable-on-publish** (editing a published template makes a new version;
  the submission snapshot guarantees history regardless). Default resolution by convention (one published
  org template per `(org, inspection_type, category)` via partial unique index) + optional
  `assets.return_template_id` override; order = asset → org+category → system+category → generic. Public
  rendering of an org template adds an **anon published-read policy** (same class as published equipment
  pages). **Re-scope flag:** Phase 2 org customization softens `NON_GOALS.md` "fixed templates only" —
  record the decision in `OPEN_QUESTIONS.md` when scheduled.

## 4. Initial category presets (system)
Shared spine per preset: **Identity (locked) · Overview photos (required) · Condition checklist ·
Meters/fuel · Accessories · Damage (conditional) · Attestation.**
- **utility_trailer** — overview (front/hitch, deck, tires); tires/wheels pass-fail-na; lights & wiring
  pass-fail-na; ramps/gate y/n; deck condition long_text; accessories (straps, chains, pins, spare).
- **mini_excavator_skid_steer** — engine hours numeric_meter; fuel_charge_level; tracks/tires
  pass-fail-na; hydraulics/leaks pass-fail-na; bucket/attachment select; coolant/oil pass-fail-na;
  accessories (keys, attachments, manual); overview + attachment photos.
- **portable_generator** — run hours numeric_meter (opt); fuel_charge_level; oil pass-fail-na;
  cords/outlets pass-fail-na; starts_ok y/n; accessories (cords, wheel kit, manual).
- **plate_compactor** — fuel_charge_level; plate pass-fail-na; belt/guard pass-fail-na; starts_ok y/n;
  accessories (water kit, manual).
- **electrical_test_equipment** — powers_on y/n; leads/probes pass-fail-na; case/screen pass-fail-na;
  calibration_sticker_present y/n; accessories (leads, case, charger, manual); overview photos.
- **generic** (fallback) — overview photos; condition long_text; fuel_charge_level (opt); cleaned y/n;
  accessories checklist; damage conditional; attestation. (≈ today's form, guided.)

## 5. Field types + conditional logic
- **Closed field set:** `pass_fail_na`, `yes_no`, `select`, `short_text`, `long_text`, `numeric_meter`
  (unit + optional min/max), `fuel_charge_level`, `accessory_checklist` (items returned/missing/na),
  `photo_slot` (id, caption, required, min/max), `acknowledgement` (attestation checkbox — **not an
  e-signature**). Field shape `{ id, type, label, help?, required, options?, photo? }`.
- **Conditional logic (no rules engine):** a field/section may carry `visible_when` / `required_when`
  = a single equality against another field in the same submission, e.g.
  `{ field: "damage_observed", equals: "yes" }`. Damage case reveals a **Damage details** section:
  location (required), severity (required select), description (required), **≥1 damage photo (required)**.
  Evaluated client-side for UX and **re-validated server-side as the authority** (pure
  `evaluateInspection`, unit-tested).

## 6. Guided photos + media/storage impact
- `photo_slot` fields carry slot identity + caption: `overview` (required, min 1), optional category
  angles, damage close-ups (conditional). Each file records `{ slot_id, path, caption }` in `answers`;
  `media_urls` stays the flat union.
- **Raise the per-submission cap to ~12 images for inspections**, keeping **10 MB/file, images-only**,
  plus a **total-bytes guard** (≈ ≤60 MB). Storage cost is the real constraint
  (`STORAGE_MEDIA_LIFECYCLE.md`: "unlimited scans fine, unlimited storage not"); `storage_limit_mb` stays
  the eventual enforcement point. No video this slice. Bucket/RLS/path unchanged.

## 7. Public inspection UX
Single mobile page on `app/forms/[shortCode]/return` (no login, system fonts, zero webfonts, mobile-first,
AA + 44px targets). Client-side sectioned wizard, **one POST at the end**: locked identity → progress
("Section X of N") → template sections → conditional questions → clear required markers + inline
validation → **review step** → submit → confirmation + `SUB-YYYY-XXXXXX` reference. Optional light
localStorage autosave keyed by asset+session (reuse `lib/rentals/rentals.ts` key pattern). Careful
language: **"Return information submitted for rental-company review."**

## 8. Admin review UX
Branch the submission detail on `schema_version`. V2 shows a **structured summary** from
`template_snapshot` + `answers` (template order): attention badge (damage / accessories-missing),
accessories-missing list, damage-details block, **photos grouped by slot** (signed), meter/fuel values,
timeline link, and the existing **Mark returned & resolve**. Before/after-baseline comparison is Phase 3.
V1 submissions keep rendering via `submissionFields`.

## 9. Security / RLS
- **Phase 1 adds no anon table access** — system templates are code; the public form imports them. Anon
  still only INSERTs `form_submissions` + uploads under `org/…`. Server derives org/asset/`rental_session_id`
  from the resolver (never client input). Snapshot + flags written server-side.
- `0024` columns are nullable, covered by existing `form_submissions` RLS (no new policy). `rental_session_id`
  is set from `resolved.activeRentalSessionId` (opaque), consistent with acknowledgements.
- **Phase 2** `inspection_templates`: authenticated org-scoped RW mirroring `equipment_page_templates` +
  an anon published-read policy. No service-role anywhere in this feature.

## 10–11. Migration + backward compatibility
- `0024`: 3 nullable columns; ships unapplied (operator `supabase db push`). No CHECK/RLS change.
- Old V1 return submissions (no `schema_version`, flat five keys) keep rendering and resolving unchanged;
  V2 rows carry `schema_version:2` + snapshot and render structured. The dashboard attention queue,
  mark-resolve, and timeline all key off `form_type` + `status` + canonical `flags`, which V2 preserves.
  **No data backfill.**

## 12. Risks + deferred
- **Media volume/cost** — capped total files/bytes; `storage_limit_mb` enforcement deferred.
- **Template drift vs history** — solved by the immutable per-submission snapshot.
- **`NON_GOALS.md` tensions** — Phase 2 org customization (re-scope → OPEN_QUESTIONS); attestation, **not
  e-signatures**.
- **Public template exposure** — none in Phase 1 (code); Phase 2 anon-read is non-sensitive published
  content.
- **Deferred:** org customization (Phase 2); outbound baseline + before/after comparison + yard-worker
  mode (Phase 3 / `YARD_STAFF_SCANNER_MODE.md`); video; offline.

## Safety & legal framing
Never presented as a legal inspection/certification, a substitute for trained staff, a maintenance
release, a rental agreement, or proof that no damage exists. Public microcopy: "Return information
submitted for rental-company review." Keep the existing `PUBLIC_DISCLAIMER`. The attestation checkbox is
a simple acknowledgement, not a signed legal statement.

## Future yard-worker mode (roadmap — do NOT build here)
Authenticated Yard Staff Outbound/Return Mode is scoped in `YARD_STAFF_SCANNER_MODE.md` +
`ROADMAP_DEFERRED.md` (#7). V2's data model is its foundation: `inspection_type` on templates,
`rental_session_id` + V2 snapshot on submissions, and code-side template resolution make outbound baseline
capture, expected-accessories/baseline load on return, side-by-side comparison, and timeline writes
**additive later — no rework**.

## Phased plan (demoable vertical slices)
- **Phase 1 — guided return inspection (system templates).** `0024` columns; `lib/inspections/*` (presets
  + resolver + schema/eval + tests); guided public form; V2 submit (snapshot + flags + rental_session_id +
  per-slot photos); media cap raise; admin structured summary; backward compat. Demo: scan each demo
  category → right preset; damage conditional; submit → reference; admin structured detail; mark
  returned & resolve.
- **Phase 2 — org copy/customize.** `inspection_templates` table + constrained editor + assignment
  (org/category/asset) + anon published-read; resolver org→system→generic.
- **Phase 3 — outbound baseline + comparison (feeds yard mode).** Outbound inspection type, baseline
  capture, before/after comparison in admin.

## Files/routes likely to change (Phase 1)
- **New:** `supabase/migrations/0024_return_inspection_v2.sql`; `lib/inspections/{templates,resolve,schema}.ts`
  (+ tests); `components/public/return-inspection-form.tsx` (+ step/review/photo-slot subcomponents);
  `components/submissions/return-inspection-summary.tsx`.
- **Edit:** `app/forms/[shortCode]/return/page.tsx`; `lib/forms/{actions,submit,validate,media}.ts`;
  `lib/submissions/returns.ts`; `app/(admin)/dashboard/submissions/[submissionId]/page.tsx`; and (when
  Phase 1 lands) cross-links in `YARD_STAFF_SCANNER_MODE.md` + `ROADMAP_DEFERRED.md`.
- **Untouched:** `mark_return_and_resolve` (0022), `asset_rental_sessions`, timeline builder, resolver,
  rentals actions, storage bucket/RLS, all non-return forms.

## Acceptance criteria — first slice (Phase 1)
1. A public asset's Return action shows a **guided, sectioned** inspection from the asset's category
   system template (generic fallback when category unknown).
2. Required fields + the **damage conditional** (location/severity/description/≥1 photo when damage=yes)
   are enforced **server-side**; the client mirrors for UX.
3. A **review step** precedes submit; submit lands on the thanks page with a `SUB-YYYY-XXXXXX` reference.
4. The submission stores `schema_version:2`, `template_key`+`template_version`, an immutable
   `template_snapshot`, structured `answers`, per-slot photo metadata, canonical `flags`; photos in
   `media_urls`; `rental_session_id` set when the asset had an active session.
5. Admin detail shows the structured summary (attention badge, accessories-missing, damage block, photos
   grouped by slot, meter/fuel, timeline link) and **Mark returned & resolve** still works (RPC + timeline
   unchanged).
6. Existing V1 return submissions still render and resolve; dashboard attention flags fire for V2
   damage/missing.
7. New pure helpers are unit-tested; lint/typecheck/test/build pass; `0024` ships unapplied with an
   operator apply note; no schema/RLS/auth/QR/rental/plan/notification/export regressions.
