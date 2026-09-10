# Deferred Roadmap — Operational Foundations

Some operationally-important capabilities were **intentionally deferred** to keep the MVP
focused on the core loop (permanent QR tag → public equipment page → submissions → admin
dashboard). None of these are gaps or bugs — each is a **future wave** with enough scope to
stand on its own. This document is the canonical index so the intent isn't lost.

> **Status legend:** *Deferred* = not built; scope captured here (and, where noted, in a dedicated
> detail doc) so it can become a future wave without re-discovery. Each item lists a **Trigger** (the
> concrete condition that should promote it from backlog to work) and an **Interim mitigation** (what
> holds until then — several already exist in the shipped product).
>
> **Reconciled 2026-09-10 (Engineering Phase D0).** This register was last edited in July 2026 and had
> fallen behind the product. The original Trigger and Interim-mitigation text is kept verbatim as the
> historical rationale; the new **Status** column records what is actually true now, with evidence in
> [Reconciliation — 2026-09-10](#reconciliation--2026-09-10) below. Status values: **Shipped**,
> **Partially shipped**, **Still deferred**, **Newly triggered**.

## Deferred register

| # | Capability | Trigger (promote when…) | Interim mitigation | Detail | Status (verified 2026-09-10) |
|---|------------|-------------------------|--------------------|--------|------------------------------|
| 1 | **Offline PWA** — the public scan page works with no/poor connectivity. | A coverage-poor market segment becomes a deliberate sales lever (prospect yards/delivery radius with weak signal — see discovery check in `OPEN_QUESTIONS.md`). | Public page is deliberately lightweight and fast on weak signal; pair with printed scan-at-pickup guidance. Connectivity is assumed (`NON_GOALS.md`). | — | **Still deferred.** No service worker or manifest exists. Trigger not met. |
| 2 | **SSG/ISR scan route** — statically pre-render `/t/{short_code}` for scale/cost. | Scan volume/hosting cost justifies it **and** a non-blocking path exists for the dynamic bits (scan logging, rental/publish state, tenant branding). | Route is dynamic server-rendered today; already ships zero webfonts and minimal payload. | `QR_DOMAIN_STRATEGY.md` | **Still deferred.** Part of the second trigger condition now exists: scan logging runs after the response (Phase C5). Scan cost has not justified it. See R2. |
| 3 | **Status DB migration** (new asset lifecycle states) — e.g. `out_of_service`/`maintenance`. | A real workflow needs a state the current model can't express (e.g. an asset must be blocked from rental/scan behavior on a true out-of-service status). | Archive/restore + `public_status` + rental sessions cover current needs; internal notes carry the rest. | `DATA_MODEL.md` | **Newly triggered — candidate for a separate future "Operational hold" phase. NOT part of Engineering Phase D.** See R3. |
| 4 | **Full split-view inbox** — side-by-side list/detail triage. | Real customer submission volume makes the current list→detail flow a bottleneck. | Shipped inbox has status filters (incl. unresolved), quick filters, search, and CSV export. | — | **Still deferred.** Mitigation has grown: bulk triage and efficient freshness polling (Phase C7). No customer volume yet. |
| 5 | **Marketing site & `/for-operators`** — public product/marketing surface and operator landing. | Outreach requires a public presence (pilots move from warm intros to cold). | Sales collateral lives as internal docs; the app footer mark stays plain text (no marketing site) until then. | This doc → *Wave 6* | **Still deferred.** A basic root landing page exists; no `/pricing` or `/for-operators`. The mitigation's "footer mark stays plain text" is stale — see R5. |
| 6 | **Full i18n** — translate public + admin surfaces. | First commitment to a non-English pilot/market. | English-only by default (`OPEN_QUESTIONS.md` #8); `Intl` formatters (dates/relative time/money) are already in place, so wiring a locale is the remaining work, not a rebuild. | — | **Still deferred.** Mitigation is optimistic — see R6. |
| 7 | **Yard-worker outbound/return scanner mode** — authenticated staff scan at outbound/return: mark outbound, condition photos, accessories/fuel, return scan, return photos, timeline. | A prospect commits to staff scanning the yard workflow (discovery Q3, `OPEN_QUESTIONS.md`). | Renter-facing loop + admin rental sessions + acknowledgements + timeline already capture condition history without a dedicated yard mode. | [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md) | **Shipped** (Phases 3A / 3A.1 / 3B / 3C, migrations 0027–0031). Still not built: a dedicated `yard_worker` role, an in-app camera scanner, offline. See R7. |
| 8 | **Storage & media lifecycle** — quotas, retention, archive/delete, plan-based limits; keep records even when heavy media is archived/deleted. | Storage cost/retention becomes real (media volume, a plan tier that must enforce `storage_limit_mb`). | `storage_limit_mb`/`video_uploads_enabled` are captured as metadata (not enforced); submissions can be archived. "Unlimited scans is fine; unlimited storage is not." | [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md) | **Still deferred.** Orphan-media cleanup and media rate limits shipped (Phase A4); quotas and retention do not exist. Engineering Phase D deliberately creates no stored derived images while this stays deferred. See R8. |
| 9 | **Tag production economics & QA** — founder-owned: material, marking method, mounting, interim sourcing until an engraver arrives, and a physical test plan (sample tags, multi-phone scans, dirty/scratched/wet, size/contrast/finish, COGS). **Blocks pilot pricing.** | Before real customer tags are produced / pilot pricing is finalized (MCore metal tags available after Aug 2026 per the detail doc). | QR SVG/CSV/production-sheet export exists for interim sourcing; durability/scan-after-marking test plan is documented, not yet executed. | [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md), [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) | **Partially shipped** — software only. Physical material, marking, durability, scan QA and COGS are unstarted; the "after Aug 2026" MCore expectation has passed with no samples recorded. See R9. |
| 10 | **Brand / domain commitment** — lock production/custom domain and the brand name (working name pending **CIPO/USPTO** clearance) before tags are printed. | Trademark clearance resolves **and** the production domain is chosen (printed tags encode the domain permanently). | Brand strings centralized (`lib/constants.ts`); domain-durability strategy documented; tags not yet produced, so nothing is locked prematurely. | [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md), [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md) | **Partially shipped.** The domain is committed and live (`https://mulemark.io`, Phase B3). The name is still pending clearance, and the redirect obligation still has no named owner. See R10. |
| 11 | **Branded email / Supabase SMTP** — verified sender domain for invites and notifications. | A final domain + sender identity is selected. | Copyable invite links work with no SMTP (`WAVE_5_CLOSEOUT.md`); Resend notifications send where configured, else dry-run. See `SUPABASE_AUTH_CONFIG.md`. | `SUPABASE_AUTH_CONFIG.md` | **Shipped for notifications** (Phase B4, `notify.mulemark.io`, live 2026-08-31). **Still deferred for auth email:** invites remain copyable links and magic-link uses Supabase's default email; no custom SMTP. See R11. |

The short backlog bullets in [`COMMERCIAL_MODEL.md`](COMMERCIAL_MODEL.md) and
[`WAVE_4_CLOSEOUT.md`](WAVE_4_CLOSEOUT.md) point here for the full detail.

### Newly triggered or active since the last edit

| Item | Status | Notes |
|---|---|---|
| **Actionable incident notifications** | **Active — Engineering Phase D** (D0 designed, D0.1 decisions locked 2026-09-10) | [`ACTIONABLE_NOTIFICATION_DESIGN.md`](ACTIONABLE_NOTIFICATION_DESIGN.md). Promotes one narrow slice of the roadmap's "multi-recipient notifications" backlog item: a separate urgent route (switch + address). Adds a daily return-exceptions summary. Neither is a general notification queue; full multi-recipient routing remains deferred. |
| **Operational hold / out-of-service workflow** | **Newly triggered candidate — separate future phase** | Extends #3. See R3. Explicitly **not** part of Engineering Phase D: Phase D must never change an asset's rental or service state from a report. |

---

## Reconciliation — 2026-09-10

Evidence for each Status above. Nothing in the register was deleted; where interim-mitigation wording is
now wrong, the correction lives here.

- **R2 — SSG/ISR.** `app/t/[shortCode]/page.tsx` is `force-dynamic` with no `generateStaticParams` or
  `revalidate`; scan logging is scheduled with `after()` (`scheduleScanOnce`, Phase C5), which removes the
  write from the render path but not the per-request rental/publish/branding reads. The Detail link
  `QR_DOMAIN_STRATEGY.md` does not discuss static rendering; there is no dedicated detail doc.
- **R3 — Status migration → operational hold.** No `out_of_service`, `maintenance` or hold state exists in
  any migration or in code. The closest mechanisms block nothing: the Mark-rented dialog warns about
  unresolved submissions and offers "Mark rented anyway" (`components/mark-rented-button.tsx`); open-damage
  badges and alerts surface damage; archiving and `public_status` hide an asset. A staff return that flags
  damage still closes the rental and marks the asset available — only the submission stays `new`
  (`docs/YARD_STAFF_SCANNER_MODE.md`). **Why newly triggered:** the incident examples that shaped
  Engineering Phase D (a rollover, equipment stuck or immobilized, equipment reported unsafe) are exactly
  the cases where an operator would want to hold an asset from its next rental. `roadmap.md` already
  lists "Out-of-service/hold state — Deferred, likely early". **Recorded as a separate future phase**, to be
  scoped on its own evidence (who may place and clear a hold, what it blocks, what the public page shows);
  it is not part of Phase D.
- **R4 — Split-view inbox.** The inbox list links to a separate detail page
  (`app/(admin)/dashboard/submissions/[submissionId]/page.tsx`). Since this row was written, bulk triage and
  the C7 freshness endpoint (`app/api/submissions/freshness/route.ts`) shipped.
- **R5 — Marketing site.** `app/page.tsx` is a basic landing page (hero, feature cards, demo and login
  calls to action); no `/pricing` or `/for-operators` route exists. The public footer now renders the
  Mulemark glyph and wordmark artwork with "Powered by", not plain text (`components/public/public-footer.tsx`).
  The landing page states "Mulemark produces and ships the physical tags" (`app/page.tsx:27-29`) while
  physical production is unstarted (R9) — flag for the commercial-readiness workstream. **Wave 6** below is
  unchanged and still deferred; the only existing collateral is `DEMO_SCRIPT.md` and
  `PILOT_CUSTOMER_DEMO.md` (`PILOT_DEMO_SCRIPT.md` is a redirect stub).
- **R6 — i18n.** No i18n library; all copy is inline English; `app/layout.tsx` sets `lang="en"`. `Intl`
  formatters exist but hard-code locales (`"en"` in `lib/ui/time.ts`, `"en-US"` in analytics and the
  dashboard, `"en-CA"` in plan presets), so wiring a locale is more than configuration.
- **R7 — Yard scanner mode.** Staff routes under `app/(staff)/staff/t/[shortCode]/` (outbound, return,
  return completion, session evidence, submission view); RPCs `start_outbound_rental` and
  `complete_staff_return` (migrations 0027–0030) and history indexes (0031);
  `docs/YARD_STAFF_SCANNER_MODE.md` records the workflow as **IMPLEMENTED**. `docs/OPEN_QUESTIONS.md`,
  `docs/COMMERCIAL_MODEL.md` and `docs/WAVE_5_CLOSEOUT.md` still describe it as deferred and are stale on
  this point.
- **R8 — Storage lifecycle.** `storage_limit_mb` and `video_uploads_enabled` are stored and displayed but
  never read by upload code; `docs/STORAGE_MEDIA_LIFECYCLE.md` still reads "Deferred"; failed-upload and
  orphan cleanup exist (`lib/forms/cleanup.ts`, `scripts/cleanup-orphan-media.mjs`). Uploaded photos are
  stored exactly as sent, with no resize and no EXIF stripping.
- **R9 — Tag production.** Software: tag requests (migrations 0010–0011), the owner production queue and
  QR SVG / sheet / CSV exports. Physical: every item in `docs/TAG_PRODUCTION_READINESS.md` is unchecked,
  and `PHASE_B_ENGINEERING_READINESS.md` verdict 6 (physical production) is "NOT YET ASSESSED".
- **R10 — Brand / domain.** Domain: `roadmap.md` Phase B3 "LIVE (operator closeout 2026-08-31)";
  `docs/PRODUCTION_DOMAIN_CHECKLIST.md` item 11 "documented, owner not yet named". Name:
  `docs/brand/BRAND.md` still pending clearance, while `lib/constants.ts:13` calls Mulemark "the settled
  product name" — the code comment overstates the legal position.
- **R11 — Branded email.** Notifications: `EMAIL_DELIVERABILITY_RUNBOOK.md` — all four notification events
  verified live, SPF/DKIM/DMARC pass; two conditions remain (live replay/idempotency, cold-mailbox
  placement). Auth email: `docs/SUPABASE_AUTH_CONFIG.md` — invitations are app-generated copyable links;
  magic-link still depends on Supabase's default email.

---

## Wave 6 — Sales / Demo Wave (placeholder)

A future **standalone** wave to turn the working product into something sellable. This is a
placeholder to reserve the scope — **nothing here is committed or built.** Existing pilot
collateral ([`PILOT_DEMO_SCRIPT.md`](PILOT_DEMO_SCRIPT.md),
[`PILOT_CUSTOMER_DEMO.md`](PILOT_CUSTOMER_DEMO.md)) is a starting point, not the finished set.

> **Status (verified 2026-09-10): still deferred.** See R5.

Candidate deliverables (to be scoped when the wave is picked up):

- **Demo script** — a repeatable, timed walkthrough of the core loop.
- **One-page sales PDF** — the product on a single page for a prospect.
- **Pricing sheet** — customer-facing summary of the per-covered-asset model
  (see [`COMMERCIAL_MODEL.md`](COMMERCIAL_MODEL.md)).
- **Pilot offer** — the terms of a first-customer pilot.
- **ROI calculator** — quantify time/loss savings for a rental yard.
- **Objection handling** — common pushback and responses.
- **Outreach emails** — cold/warm outreach templates.
- **Discovery-call checklist** — qualify a prospect and capture their setup.
- **Live demo data prep** — a clean, believable demo org + assets for live sessions.

Framing: this is future scope, not a promise. Sequence and contents will be decided when the
wave is scheduled.
