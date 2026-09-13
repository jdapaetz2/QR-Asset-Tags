# Storage, Quotas, Retention & Media Lifecycle

> **Status: Deferred — not built in this wave.** This documents a future wave so it can be
> scoped without re-discovery. `storage_limit_mb` and `video_uploads_enabled` exist on
> `organizations` today as **metadata only — not enforced.** No quota, retention, or lifecycle
> tooling exists yet. See [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md) and
> [`COMMERCIAL_MODEL.md`](COMMERCIAL_MODEL.md).
>
> **Failed-upload cleanup DOES exist (Phase A4; direct uploads since 0037).** Form photos upload browser → storage
> through signed upload URLs before the row is written. The submit cores delete objects that fail verification
> (`lib/forms/media-verify.ts`) and, once the row commits, any unclaimed objects under the submission prefix; the
> no-JavaScript fallback deletes its own just-uploaded objects on insert failure (`lib/forms/cleanup.ts`, through the
> scoped service-role handle, since anon has no delete policy). A client idempotency token prevents
> duplicate rows+files on resubmit, and an operator backstop (`scripts/cleanup-orphan-media.mjs`,
> dry-run default) removes any residual objects whose `form_submissions` row never materialized — never
> touching a submission that has a row. See [`ORPHAN_MEDIA_CLEANUP.md`](ORPHAN_MEDIA_CLEANUP.md). This is
> orphan cleanup, distinct from the quota/retention wave below.
>
> **Admin uploads (documents, cover images) also go browser → storage** before their row is written. A failing object
> is deleted at save time and a failed insert removes its object; deleting a document removes its row first and then
> its file, and deleting an asset removes its managed cover. Since Engineering Phase D4.1 the abandoned-upload tool
> reports (and, only when explicitly confirmed, removes) unreferenced objects in `submissions`, `documents` and the
> cover/logo folders of `public-assets` — see [`ORPHAN_MEDIA_CLEANUP.md`](ORPHAN_MEDIA_CLEANUP.md).

## Consumer photo formats (Engineering Phase D4.1)

**Policy.** Accept broadly at the file picker, identify a file by its bytes (never its extension or declared type),
keep a web-safe original when it already fits, otherwise convert it on the user's device, and store only a
browser-safe result. Stored operational images — damage, support, return and outbound photos, asset covers and
organization logos — stay **JPEG, PNG or WebP**, so the `submissions` and `public-assets` buckets, the admin
display and the D4 email previews are unchanged. Hosted documents are records and are kept as uploaded.

### Upload surfaces

| Surface | Who | Transport | Bucket | Limits | Photo handling |
|---|---|---|---|---|---|
| Damage / support form | anon | direct; no-JS body | `submissions` | 5 × 10 MB | adapter (evidence) |
| Renter return, staff return, outbound (every photo slot) | anon / staff | direct | `submissions` | 8 × 10 MB, 40 MB total | adapter (evidence), per slot |
| Asset cover | signed-in | direct; no-JS body | `public-assets` | 5 MB | adapter (cover) |
| Organization logo | admin / owner | action body | `public-assets` | 2 MB | adapter (logo) + server byte check |
| Hosted document | signed-in | direct; no-JS body | `documents` (private) | 50 MB | type from bytes; never converted |
| Owner branded-QR logo | owner | route body, in memory | — | 2 MB | unchanged (never stored) |

### What happens to a picked file

| Bytes are… | Evidence / cover | Logo | Hosted document |
|---|---|---|---|
| JPEG / PNG / WebP within the size limit and 40 MP | kept (renamed `photo-N`, type from bytes) | kept | kept |
| JPEG / PNG / WebP over the size limit or 40 MP | JPEG, at most 16 MP (evidence) / 8 MP (cover) | PNG ≤ 1024 px | kept (≤ 50 MB) |
| HEIC / HEIF | JPEG | PNG | **kept as the original** (migration 0039), "Download original" |
| AVIF | JPEG | PNG | kept as the original |
| GIF (first frame), Motion Photo JPEG (video dropped) | JPEG | PNG | not accepted / kept (JPEG) |
| TIFF | JPEG only where the browser decodes it in the worker — in practice refused with guidance | same | not accepted |
| SVG, PDF, PSD, RAW/DNG, unrecognised or corrupt | refused per file with guidance; the other photos and the form are kept | same | PDF kept; others refused |

Conversion attempts step down in quality and size until the output fits the stored limit (evidence 10 MB, cover
5 MB, logo 2 MB). The **10 MB evidence limit is unchanged**: 48/50/200 MP camera photos become a high-quality JPEG
of at most 16 MP rather than raising the cap. Converted files carry no EXIF or location metadata; orientation comes
from the image itself (EXIF orientation, HEIF/AVIF `irot`/`imir`).

### How it works

- **Identification (pure):** `lib/media/sniff.ts` (64 leading bytes; HEIC/HEIF/AVIF from `ftyp` brands, so a HEIC is
  no longer read as an MP4), `lib/media/classify.ts` (kind, Motion Photo marker, frame size from JPEG/PNG/WebP/GIF
  headers), `lib/media/photo-policy.ts` (profiles, keep/convert/refuse, guidance copy).
- **Browser:** `lib/media/consumer-photo/` — `usePhotoInput` prepares photos on change and puts the prepared files
  back into the input (the existing direct-upload code then runs unchanged); submit waits while photos prepare.
  Conversion runs in `public/workers/photo-worker.js` with native `createImageBitmap` + `OffscreenCanvas`, with a
  main-thread canvas fallback. When the browser cannot decode HEIC/HEIF (everything except Safari 17+), the worker
  loads the **unmodified libheif-js 1.23.2** WebAssembly build (LGPL-3.0) from `public/vendor/libheif/`, copied from
  `node_modules` by `scripts/vendor-libheif.mjs` at `predev`/`prebuild` and in the e2e web server. See
  `THIRD_PARTY_NOTICES.md`. The scan page never loads any of it (`npm run check:scan-bundle` after a build).
- **Server (authoritative):** direct uploads are verified before a row references them — stored type, extension,
  leading bytes, a readable frame size within 16,384 px per side and 40 MP (read from up to the first 1 MB), size, and
  an upload no older than 24 hours (a stale object is refused, not deleted). No-JavaScript photo posts, the no-JS cover
  and the logo store only bytes that are a web-safe image of the declared type within those limits; a no-JS document's
  bytes must match its declared type.
- **Documents:** the form sets the upload's type from the bytes (Windows leaves HEIC untyped). Migration 0039 lets the
  private `documents` bucket hold `image/heic`, `image/heif` and `image/avif`. The admin list shows the stored format
  and size ("HEIC image · 0.7 MB") and offers HEIC/HEIF as **Download original**; the scan page says "Download".

### Evidence

- **Decoder gate G1** (local Chrome 152, the production worker, public samples): 1280×854 HEIC via libheif in 343 ms
  cold (includes the 1.4 MB wasm) and 129 ms warm; a 44 MP JPEG to 16 MP in 672 ms; EXIF orientation 6 → portrait;
  AVIF `irot`, grid and image sequences handled; converted outputs have no EXIF; TIFF, truncated and garbage HEIC
  refused cleanly. Transfer sizes: worker 5.7 KB, `libheif.js` 91 KB, `libheif.wasm` 1.42 MB (fetched only for HEIC).
- **Automated:** unit (sniff, classify against `sharp` output, policy, preparation with a fake converter, verifier
  age/size rules, no-JS byte refusal); security (documents bucket takes a private HEIC original that anon cannot read,
  `public-assets` still refuses HEIC); e2e `tests/e2e/public/photo-formats.spec.ts` (HEIC report, JPEG+PNG+AVIF+GIF,
  44 MP JPEG, a broken file kept apart, return slots, staff return, HEIC cover, untyped HEIC document).
- **Staging QA (2026-09-12):** `direct-upload-verify --samples` 22/22 (HEIC/AVIF/GIF report `SUB-2026-BF0EC1` and
  HEIC/AVIF return `SUB-2026-B556D9` stored as EXIF-free JPEG); `admin-upload-verify --after-0039 --samples` 19/19.
- **Production (2026-09-13):** `3fb3364` promoted (deployment `6417386658`, `smoke:production` 13/0/1, decoder files
  served), migration 0039 applied (`docs/MIGRATION_LEDGER.md`). On the Production QA tag the HEIC/AVIF return
  (`SUB-2026-A98ECE`) and the HEIC/AVIF/GIF report (`SUB-2026-30A18C`, on a re-run after one transient generic upload
  failure that kept the form and photos) were stored as EXIF-free JPEG; the large-photo report and return still pass.
- **Operator devices (2026-09-12, staging):** iPhone Safari, iPad Safari, Windows Chrome and Edge — photo library,
  camera, Files-app HEIC, screenshots, HEIC/AVIF from the Windows picker, HEIC cover and document: all worked. A
  `.tiff` was refused. Real iPhone photos sent by email arrived as JPEG (Mail converts HEIC): 24.5 MP and 12 MP photos
  of 2.6–5.2 MB are kept for evidence; the 5.2 MB one converts as a cover.

### Test fixtures

Public, clearly licensed samples are kept **outside the repository** (never committed) and read through
`MEDIA_FIXTURES_DIR` by the e2e spec and the `--samples=<dir>` QA runs: libheif `example.heic` (MIT) and
`colors-with-alpha-thumbnail.heic`; libavif test images `paris_icc_exif_xmp.avif`, `abc_color_irot_alpha_irot.avif`,
`clap_irot_imir_non_essential.avif`, `sofa_grid1x5_420.avif`, `colors-animated-8bpc.avif` (BSD-2-Clause);
`red-at-12-oclock-with-color-profile-10bpc.avif` (link-u, BSD-2-Clause); Wikimedia Commons CC0
`gazania-44mp.jpg`, `planta-baja.tif`, `knowledge-animated-transparent.gif`. Unit tests generate their own bytes.

### Known limitations

- **Kept originals keep their metadata**, including GPS location if the camera recorded it (unchanged from before
  D4.1). Only converted photos are metadata-free. Stripping metadata from kept photos is a separate decision.
- **libheif ignores ICC profiles:** a Display P3 HEIC converted outside Safari can look slightly less saturated.
  Safari decodes HEIC natively with colour management.
- **Real iPhone HEIC timing is extrapolated** (≈ 8.6 MP/s warm on desktop Chrome → about 1.4 s for 12 MP); no real
  iPhone HEIC reached the measurement (the emailed photos were JPEG). Device QA confirmed the flows work.
- **TIFF** is effectively unsupported (refused with guidance). Animated GIF/AVIF keep the first frame only; a Motion
  Photo loses its video. One libavif conformance file (`clap_irot_imir_non_essential.avif`, 10×8) is refused by Chrome.
- **Android / Samsung Internet not tested** on a real device (no device available).
- libheif has a steady CVE history; it runs only in the user's own browser worker on their own file. Pin and review
  upgrades as described in `THIRD_PARTY_NOTICES.md`.

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
