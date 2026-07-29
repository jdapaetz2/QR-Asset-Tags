# Storage, Quotas, Retention & Media Lifecycle

> **Status: Deferred — not built in this wave.** This documents a future wave so it can be
> scoped without re-discovery. `storage_limit_mb` and `video_uploads_enabled` exist on
> `organizations` today as **metadata only — not enforced.** No quota, retention, or lifecycle
> tooling exists yet. See [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md) and
> [`COMMERCIAL_MODEL.md`](COMMERCIAL_MODEL.md).
>
> **Failed-upload cleanup DOES exist (Phase A4).** Public upload cores delete their own just-uploaded
> objects on any insert/upload failure (`lib/forms/cleanup.ts`), a client idempotency token prevents
> duplicate rows+files on resubmit, and an operator backstop (`scripts/cleanup-orphan-media.mjs`,
> dry-run default) removes any residual objects whose `form_submissions` row never materialized — never
> touching a submission that has a row. See [`ORPHAN_MEDIA_CLEANUP.md`](ORPHAN_MEDIA_CLEANUP.md). This is
> orphan cleanup, distinct from the quota/retention wave below.

## Principle

> **Unlimited scans is fine. Unlimited storage is not.**

Scans are cheap and are deliberately uncapped — they're the product's core value. Stored media
has a real, recurring cost that grows with every upload and never shrinks on its own. To keep
the business sustainable, storage must eventually be **measured, bounded, and tied to plans.**

## What consumes storage

- Documents and manuals (customer-uploaded).
- Cover images for assets.
- Submission photos (damage/support/return forms).
- Return photos.
- Acknowledgement records.
- **Future:** yard-worker outbound/return condition photos
  (see [`YARD_STAFF_SCANNER_MODE.md`](YARD_STAFF_SCANNER_MODE.md)).
- **Possible future:** video uploads (large; gated by plan/platform setting).

## Future capabilities (candidate scope)

- **Storage usage by org** — compute and display total bytes stored per organization.
- **Quota by plan** — a storage allowance tied to each plan tier.
- **Size/type limits by org and plan** — per-file size caps and allowed MIME types, configurable
  per org and/or plan.
- **Video enable/disable** — a plan or platform-admin setting controlling whether video uploads
  are permitted (the `video_uploads_enabled` field is reserved for this).
- **Archive / delete tooling** — platform-admin tools to archive cold media to cheaper storage
  or delete heavy media that's past retention.
- **Retention policy** — rules for how long media is kept before archive/deletion, by type.
- **Platform-admin storage dashboard** — usage across all orgs, biggest consumers, trend.
- **Customer-visible usage** — show an org its own usage against quota, *if appropriate* for the
  plan (avoid alarming small yards; surface only where it helps).
- **Media export / offboarding path** — a way to hand a customer their media on exit
  (complements the CSV export offboarding already described in
  [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md)).

## Invariant — never lose the record

**Timeline and submission *records* must be preserved even when the heavy *media* is archived or
deleted.** Archiving a large photo or video must not erase the fact that a submission, return, or
condition capture happened — the event, its metadata, and its place in the asset timeline stay.
Only the bytes of the media file are subject to archive/retention.

## Relationship to the commercial model

Storage is expected to become part of what a plan buys — an allowance that scales with tier —
without changing the headline **per-covered-asset** pricing. This document does not change
pricing or the schema; it records the intended shape so a future wave can implement enforcement
against the existing `storage_limit_mb` / `video_uploads_enabled` metadata.

## Out of scope (for the future wave, too)

Billing/metering integrations (Stripe), CDN strategy, and per-asset storage pricing. Those are
separate decisions if and when they're needed.
