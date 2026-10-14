# Onboarding data contract (Engineering Phase E0)

**Status:** proposed 2026-10-14, part of the grouped approval in [DECISIONS.md](DECISIONS.md).

This contract is shared by the showcase content packs (E2A) and the 25–250-asset concierge onboarding (E4B/E5A).

| File | Path |
|---|---|
| Schema (draft-07) | [`schema/equipment-content.schema.json`](schema/equipment-content.schema.json) |
| Example | [`schema/equipment-content.example.json`](schema/equipment-content.example.json): the two showcase trailers, no invented guidance |

**Validation, 2026-10-14:**
- The example validates with ajv 6.15.0, the repo's transitive copy.
- These cases were rejected: READY with open facts; a null model marked READY; a guidance step without a source; approval without a record; a partial batch without asset lists; an unknown field.
- E4B owns the permanent validator. Adding one as a dependency is that slice's decision.

**Division of labour:**
- The customer supplies facts and files.
- Mulemark configures, maps, imports and checks.
- Research is bounded. Anything unresolved goes back to the customer in **one** consolidated request.
- **No guessed value is ever published.**

## 1. Four layers

| Layer | Holds | Owner | Reused across |
|---|---|---|---|
| **MODEL** | `model_key` (manufacturer.model.configuration); exact configuration; applicability (serial range, years); approved manual revision (link or hosted); source-cited quick guide and warnings; return/outbound template recommendation; common accessories; exact-model photo | Mulemark prepares; qualified reviewer checks; customer confirms configuration | Every asset of that `model_key` in the org. Across orgs only for expressly approved material (rights `shareable_across_orgs`) |
| **ASSET** | Customer `asset_code` and name; `model_key` (or `null` = not established); actual photo; year and serial when known; fitted options; asset-specific exceptions (sourced); support overrides; QR intent and existing protected ids | Customer | — |
| **ORGANIZATION** | Name, logo and colour; support contact and hours; notification preferences (`instant_renter` / `daily_exceptions` / `off`); **customer policies** (accessories issued, fuel, deposits), owned by the customer and never presented as OEM fact; approver role | Customer | — |
| **SOURCE / REVIEW** | Every source with kind, provenance, edition, size and hash, applicability, **rights** (status + redistribution: `public-host` / `link-only` / `private-only` / `blocked`) and verification depth (`headers-only` / `read` / `customer-confirmed`); review status, blockers, warnings, missing facts; the approval record | Mulemark | Rights are per source and never inferred from availability |

### Hard rules

1. **A category never supplies model-specific instructions.**
   - Guidance exists only on an identified `model_key` or as a sourced asset exception.
   - Every guidance step cites at least one OEM document or customer-policy source (schema `minItems: 1`). The category is a label.
   - Today's category page templates (`lib/onboarding/templates.ts:31-185`, eight keys) are generic starting points by their own disclaimer. Under this contract they may seed **draft** text only and are never published as-is.
2. **An asset with `model_key: null` cannot be READY** (enforced by the schema). It may still publish non-model content (contacts, report-an-issue, policies) if the customer approves that scope.
3. **Rights before publication.**
   - Unknown rights block public hosting and cross-org sharing, but not private preparation of metadata.
   - CC BY and BY-SA photos need visible attribution. The public page has no field for it yet (additive need).
4. **Synthetic values are labelled.** Demo serials carry a `DEMO-` prefix, and a fictional serial is never evidence that a serial-specific manual applies.
5. **No completeness percentage clears a blocker.**

## 2. Mapping onto what exists today

| Contract field | Stored in | Written by today | Gap |
|---|---|---|---|
| `asset_code`, `asset_name`, `category`, `make`/`model`, `serial_number`, `year`, support overrides | `assets` columns | CSV import (`lib/onboarding/import.ts:17-33`, 15 columns, `asset_code` and `asset_name` required) or the asset form | `make` and `model` are free text; nothing ties an asset to a `model_key` |
| `photo` | `assets.cover_image_url` (hosted under `public-assets/org/<org>/asset/<asset>/cover/…`, or any external URL) | Asset form upload or CSV `cover_image_url` | No rights or attribution fields. Hotlinked external URLs are accepted (Northridge's covers all are) |
| `templates.equipment_page_seed` | `equipment_pages` (7 text fields + `is_published`), copied from a template | CSV `template_key` + `publish_equipment_page` (`lib/onboarding/actions.ts:181-201`) | The import can **publish category text immediately**. Page upsert errors are swallowed (no row error) |
| `quick_guide`, `warnings` | The same 7 page fields as free text | Page editor | No per-step sources, pictograms or review state |
| `templates.return` / `.outbound` | `assets.return_inspection_template_key`; `inspection_category_defaults` (0025); versioned `inspection_templates` (0026) | CSV `return_inspection_template_key`, category defaults, settings | Page-template keys (8) and return/outbound keys (6, including `generic`) do not line up: `mini_excavator` vs `mini_excavator_skid_steer`; no return template for scissor lifts or compressors |
| `manual` | `documents` row: one per asset; `url` **or** `storage_path`; `visibility`; manual `link_status` | Documents UI (hosted uploads under `documents/org/<org>/asset/<asset>/documents/…`) | No shared revision, rights, hash or dedup. The same PDF is re-uploaded per asset (E4A) |
| ORGANIZATION layer | `organizations` (logo_url, primary_color, support_phone/email, powered_by_label, notification columns) | Owner `createOrganization` (`lib/org/actions.ts:168`), customer settings | Policies have no home. `logo_url` accepts hotlinks |
| SOURCE / REVIEW layer | — | — | Nothing exists: no source register, review status or approval record |
| `qr.create` | `qr_links` row | CSV `create_qr_link` (`lib/onboarding/actions.ts:205-222`) | When covered-asset coverage is exhausted, the trigger error ends the retry loop **with no row error**, so QR creation is silently skipped |
| `publish_intent` | `assets.public_status`, `equipment_pages.is_published` | CSV `publish_asset` / `publish_equipment_page` | Publishes at import time. Under this contract both stay false until an affirmative approval (E5A) |
| Batch | — | `importAssets` is **customer-admin only** (`lib/onboarding/actions.ts:50-57`), org taken from the caller's profile | The owner has no org, so owner-led batch import does not exist. No transaction or upsert; re-running duplicates or fails per row |

## 3. Tiers and review status

| Tier | Meaning | Visible to |
|---|---|---|
| **Draft** | Any facts captured; private; nothing published | Mulemark, customer admin |
| **Review-ready** | No blockers. Warnings and missing facts listed. Customer preview available | Customer approver |
| **Publishable** | Review `READY` or `READY_WITH_WARNINGS` **and** an affirmative approval covering this asset and content version **and** rights clear for every public item | Public, after release |

The review status is separate from lifecycle (draft/public/archived) and rental state:

| Status | Meaning |
|---|---|
| `READY` | No blockers, warnings or missing facts |
| `READY_WITH_WARNINGS` | No blockers. Warnings accepted by the approver |
| `CUSTOMER_INPUT_REQUIRED` | Blocked on a fact or file only the customer has |
| `MULEMARK_REVIEW` | Blocked on Mulemark work: authoring, source reading, rights clearance |

### Blockers and warnings

**Blockers** (block the affected content):
- an asset or model guidance step without a source;
- model or configuration uncertain: model-specific guidance is blocked, though the asset may publish without it;
- a safety-critical fact missing for content that depends on it: control pattern, load ratings, pressures, fuel, electrical specification, brakes, coupler size;
- rights unknown for anything to be publicly hosted, or a photo that is not of the exact model (or an unlabelled illustration);
- no reachable support contact at asset or org level;
- a duplicate `asset_code`;
- a QR tag requested with no coverage available.

**Warnings** (publishable once the approver accepts them):
- missing serial or year;
- no photo;
- manual by link only;
- accessory list unknown;
- `generic` return template in use.

## 4. Reuse, correction and research limits

- **Model-group reuse.** Content is authored once per `model_key`. Assets inherit it and add only sourced exceptions for fitted options. A correction at model level updates every asset in the group. The customer answers **one consolidated questionnaire per model group**, not per asset.
- **Batch correction.** Fixes are applied to the manifest and re-imported as a resumable, idempotent batch (E4B). There is no per-row hand editing in Production.
- **Bounded research**, per model group:
  - at most about 45 minutes (configurable, measured);
  - at most about two authoritative sources per fact;
  - no purchase without a cost decision;
  - no login bypass and no invented URL.
  - Whatever stays unresolved becomes `CUSTOMER_INPUT_REQUIRED` in the single consolidated request. Nothing is guessed.
- **Launch batch.** Each batch names its scope.
- **Partial release** only with explicit customer approval that records the included **and** excluded asset codes (the schema requires both lists when `launch_scope` is `partial`).

## 5. Time objective and measurement (not a promise)

- **Provisional internal objective:** review-ready software within about **3 business days** after the batch is complete, meaning the customer's data and files are received and preflight passes. It is not an SLA until rehearsals and commercial review justify one.
- **Measured per batch** (schema `batch.measurements`):
  - elapsed time (`batch_complete_at` → `review_ready_at`);
  - **customer wait hours**, excluded from Mulemark's elapsed time;
  - Mulemark **hands-on minutes**, logged per activity: preflight, mapping, research, authoring, QA.
- **E5B rehearses** synthetic batches of about 25, 100 and 250 assets to replace the provisional figure with measured ones.
- **Physical tags** may be the longest lead time. Tag production planning runs in parallel once an approval exists.

## 6. Additive needs (named, not built)

Each needs its own slice approval, and migrations need staging and then Production approval.

| Need | Slice |
|---|---|
| Source register with rights, provenance, hash and applicability; one shared document revision referenced by many assets; per-tenant authorization; dedup within a rights class | E4A |
| Content review status per model and asset, separate from lifecycle | E4B |
| Owner-led batch import for an explicit target org: dry-run, resumable, idempotent upsert keyed by `asset_code`, coverage pre-check with explicit errors, surfaced page errors, publish flags off until approval | E4B |
| Authenticated, versioned, scoped content-approval record (not an e-signature) | E5A |
| Photo attribution line on the public page (CC BY/BY-SA) and pictogram support in guidance | E2A/E4A |
| Guard so a protected or production-primary QR row can be disabled only by the owner, with a reason | E2C prerequisite |
| Org-scoped, time-boxed notification suppression for seeding, only if the E2B loader cannot stay below the digest watermark | E2B, if needed |
| An onboarding run log. `activity_log` exists but nothing writes to it | E4B |
