# Deferred Roadmap — Operational Foundations

Some operationally-important capabilities were **intentionally deferred** to keep the MVP
focused on the core loop (permanent QR tag → public equipment page → submissions → admin
dashboard). None of these are gaps or bugs — each is a **future wave** with enough scope to
stand on its own. This document is the canonical index so the intent isn't lost.

> **Status legend:** *Deferred / documented* = not built; scope captured here (and, where
> noted, in a dedicated detail doc) so it can become a future wave without re-discovery.

## Deferred waves

| # | Capability | Status | Detail |
|---|------------|--------|--------|
| 1 | **Yard Staff Outbound/Return Scanner Mode** — authenticated yard workers scan a tag at outbound/return to run a lightweight yard workflow tied to rental sessions + condition history. | Deferred / documented | [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md) |
| 2 | **Storage limits, quotas, retention & media lifecycle** — manage storage cost/retention across documents, photos, acknowledgements, and future condition media. "Unlimited scans is fine. Unlimited storage is not." | Deferred / documented | [`STORAGE_MEDIA_LIFECYCLE.md`](STORAGE_MEDIA_LIFECYCLE.md) |
| 3 | **Tag production readiness** — MCore metal tags, PNW field-condition durability, and QR scanability testing after marking/cutting. | Deferred / documented | [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md), [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) |
| 4 | **Final brand / domain strategy** — lock the production/custom domain (and brand) before real customer tags are produced. | Deferred / documented | [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md), [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) |
| 5 | **Sales / demo flow as a standalone wave** — a dedicated go-to-market wave (see the placeholder below). | Deferred / documented | This doc → *Wave 6 — Sales/Demo Wave* |

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
