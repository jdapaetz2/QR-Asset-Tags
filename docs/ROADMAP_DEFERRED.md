# Deferred Roadmap — Operational Foundations

Some operationally-important capabilities were **intentionally deferred** to keep the MVP
focused on the core loop (permanent QR tag → public equipment page → submissions → admin
dashboard). None of these are gaps or bugs — each is a **future wave** with enough scope to
stand on its own. This document is the canonical index so the intent isn't lost.

> **Status legend:** *Deferred* = not built; scope captured here (and, where noted, in a dedicated
> detail doc) so it can become a future wave without re-discovery. Each item lists a **Trigger** (the
> concrete condition that should promote it from backlog to work) and an **Interim mitigation** (what
> holds until then — several already exist in the shipped product).

## Deferred register

| # | Capability | Trigger (promote when…) | Interim mitigation | Detail |
|---|------------|-------------------------|--------------------|--------|
| 1 | **Offline PWA** — the public scan page works with no/poor connectivity. | A coverage-poor market segment becomes a deliberate sales lever (prospect yards/delivery radius with weak signal — see discovery check in `OPEN_QUESTIONS.md`). | Public page is deliberately lightweight and fast on weak signal; pair with printed scan-at-pickup guidance. Connectivity is assumed (`NON_GOALS.md`). | — |
| 2 | **SSG/ISR scan route** — statically pre-render `/t/{short_code}` for scale/cost. | Scan volume/hosting cost justifies it **and** a non-blocking path exists for the dynamic bits (scan logging, rental/publish state, tenant branding). | Route is dynamic server-rendered today; already ships zero webfonts and minimal payload. | `QR_DOMAIN_STRATEGY.md` |
| 3 | **Status DB migration** (new asset lifecycle states) — e.g. `out_of_service`/`maintenance`. | A real workflow needs a state the current model can't express (e.g. an asset must be blocked from rental/scan behavior on a true out-of-service status). | Archive/restore + `public_status` + rental sessions cover current needs; internal notes carry the rest. | `DATA_MODEL.md` |
| 4 | **Full split-view inbox** — side-by-side list/detail triage. | Real customer submission volume makes the current list→detail flow a bottleneck. | Shipped inbox has status filters (incl. unresolved), quick filters, search, and CSV export. | — |
| 5 | **Marketing site & `/for-operators`** — public product/marketing surface and operator landing. | Outreach requires a public presence (pilots move from warm intros to cold). | Sales collateral lives as internal docs; the app footer mark stays plain text (no marketing site) until then. | This doc → *Wave 6* |
| 6 | **Full i18n** — translate public + admin surfaces. | First commitment to a non-English pilot/market. | English-only by default (`OPEN_QUESTIONS.md` #8); `Intl` formatters (dates/relative time/money) are already in place, so wiring a locale is the remaining work, not a rebuild. | — |
| 7 | **Yard-worker outbound/return scanner mode** — authenticated staff scan at outbound/return: mark outbound, condition photos, accessories/fuel, return scan, return photos, timeline. | A prospect commits to staff scanning the yard workflow (discovery Q3, `OPEN_QUESTIONS.md`). | Renter-facing loop + admin rental sessions + acknowledgements + timeline already capture condition history without a dedicated yard mode. | [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md) |
| 8 | **Storage & media lifecycle** — quotas, retention, archive/delete, plan-based limits; keep records even when heavy media is archived/deleted. | Storage cost/retention becomes real (media volume, a plan tier that must enforce `storage_limit_mb`). | `storage_limit_mb`/`video_uploads_enabled` are captured as metadata (not enforced); submissions can be archived. "Unlimited scans is fine; unlimited storage is not." | [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md) |
| 9 | **Tag production economics & QA** — founder-owned: material, marking method, mounting, interim sourcing until an engraver arrives, and a physical test plan (sample tags, multi-phone scans, dirty/scratched/wet, size/contrast/finish, COGS). **Blocks pilot pricing.** | Before real customer tags are produced / pilot pricing is finalized (MCore metal tags available after Aug 2026 per the detail doc). | QR SVG/CSV/production-sheet export exists for interim sourcing; durability/scan-after-marking test plan is documented, not yet executed. | [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md), [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) |
| 10 | **Brand / domain commitment** — lock production/custom domain and the brand name (working name pending **CIPO/USPTO** clearance) before tags are printed. | Trademark clearance resolves **and** the production domain is chosen (printed tags encode the domain permanently). | Brand strings centralized (`lib/constants.ts`); domain-durability strategy documented; tags not yet produced, so nothing is locked prematurely. | [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md), [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md) |
| 11 | **Branded email / Supabase SMTP** — verified sender domain for invites and notifications. | A final domain + sender identity is selected. | Copyable invite links work with no SMTP (`WAVE_5_CLOSEOUT.md`); Resend notifications send where configured, else dry-run. See `SUPABASE_AUTH_CONFIG.md`. | `SUPABASE_AUTH_CONFIG.md` |

The short backlog bullets in [`COMMERCIAL_MODEL.md`](COMMERCIAL_MODEL.md) and
[`WAVE_4_CLOSEOUT.md`](WAVE_4_CLOSEOUT.md) point here for the full detail.

---

## Wave 6 — Sales / Demo Wave (placeholder)

A future **standalone** wave to turn the working product into something sellable. This is a
placeholder to reserve the scope — **nothing here is committed or built.** Existing pilot
collateral ([`PILOT_DEMO_SCRIPT.md`](PILOT_DEMO_SCRIPT.md),
[`PILOT_CUSTOMER_DEMO.md`](PILOT_CUSTOMER_DEMO.md)) is a starting point, not the finished set.

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
