# Tag Production Readiness

> **Status: Deferred — pre-production checklist.** This captures the physical-tag realities that
> must be settled **before real customer tags are produced.** No product behavior changes here.
> Read alongside [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) (domain durability) and
> [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md).

## Why this matters

A physical QR tag is permanent and lives on equipment that gets used hard. Two things have to be
right before we put real tags on real customer equipment: the **tag itself** must survive the
field and stay scannable, and the **domain** it encodes must be stable for the life of the tag.
Getting either wrong means reprinting tags — expensive and trust-damaging.

## Physical tag realities

### Metal tags, not cheap stickers

Production tags are **durable metal** (or equivalent field-grade material), not paper/vinyl
stickers. Rental equipment is abrasive, greasy, and knocked around; a sticker won't last the life
of the asset. The tag has to outlive many rental cycles.

### PNW field conditions

Tags will live in **Pacific Northwest** conditions: persistent wet, mud, cold, and UV exposure.
The tag material, adhesive/mounting, and the marked QR code all have to **survive and remain
scannable** in that environment — not just on day one, but after seasons of use.

### MCore — metal-tag production & testing

Metal-tag production and testing is expected to run with **MCore after August 2026** (an
externally-driven timeline, framed as an expectation, not a commitment). Two things must be
validated with real produced samples:

- **Post-marking/cutting scanability.** Marking or cutting a QR into metal can degrade the code's
  contrast and module edges. **Every** production method/material combo must be **scan-tested
  after marking/cutting** — a code that renders fine on screen can fail once it's etched.
- **Durability under field conditions** — abrasion, weather, and mounting per the PNW notes above.

## Domain must be locked before production

Physical tags encode `${NEXT_PUBLIC_SITE_URL}/t/{short_code}`. Before any real customer tag is
produced:

- The **stable production/custom domain must be finalized** — this is also the open "final
  brand/domain strategy" item in [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md).
- **`localhost` and Vercel preview URLs are test-only** and must **never** be printed on a
  physical tag. Preview deployments are for validating the flow, not for production tags.
- The durability rules (redirect plan if the domain ever changes, short-code stability, etc.) are
  in [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) — not duplicated here.

## Pre-production checklist

- [ ] Production/custom domain finalized and set as `NEXT_PUBLIC_SITE_URL` (not preview/localhost).
- [ ] Tag material + mounting chosen for PNW field conditions (wet/mud/cold/UV).
- [ ] MCore production samples received (expected after August 2026).
- [ ] QR **scan-tested on real samples after marking/cutting**, on multiple phones.
- [ ] Durability check on a sample (abrasion/weather) before a full production run.
- [ ] Redirect/continuity plan confirmed per [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md).

## Out of scope

Choosing the specific vendor/material beyond the MCore path, print-run economics, and tag
artwork/branding (tracked under the brand/domain item). This doc records readiness criteria, not
those decisions.
