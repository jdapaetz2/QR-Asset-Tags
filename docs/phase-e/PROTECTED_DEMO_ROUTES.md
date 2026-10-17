# Protected demo routes (Engineering Phase E0)

**Status:** locked 2026-10-14 by E0 (read-only). Machine-readable twin:
[`manifests/protected-demo-routes.json`](manifests/protected-demo-routes.json). Later prompts read the manifest. They never
re-derive it from labels.

## The rule

The four published demo routes below are **immutable**. That covers:
- the host `mulemark.io`;
- the short code;
- the `qr_links` row id;
- the asset row id;
- the organization id;
- the row's lineage (`supersedes_qr_link_id`, production-primary flag, `active` status).

E2C may change what a route **shows**: the asset's name, make and model, its page, documents and photo. It may not change the route itself. In particular:

- Never rotate, rename, deactivate or delete a protected `qr_links` row. Never "fix" a naming mismatch by issuing a new code.
- No replacement QR artwork and no new domain (binding operator decision).
- Never delete or recreate a protected asset or QR row. Both cascade into scan history (see Hazards).
- **E2C cutover stays blocked** until the business-card evidence below is verified.

## How the evidence was gathered (no scan was recorded)

- **Artwork:** each file was decoded from its vector module grid by `scripts/lib/qr-decode.mjs`, run through
  `npm.cmd run phase-e:decode-qr -- <files>`.
  - Every Reed-Solomon block is re-computed and compared. A mismatch would be reported as undecodable, never repaired.
  - A file's `<title>`, `aria-label` and file name are recorded only as claims.
  - The decoder's 30 unit tests include round-trips through the app's own `qrcode` encoder.
- **Live files:**
  - The four `getmulemark.com/assets/qr-*.svg` files are **byte-identical** to the git blobs at marketing commit `57747c3`.
  - The eight live `tag-*.svg` files equal their committed source **plus** the `<style>` block injected by the marketing build (`tools/build.mjs:99-102`). Nothing else differs.
- **Registry hashes:** the marketing registry's `matrix_sha256` values are reproduced exactly for all four codes. The method is SHA-256 of the 33×33 module bytes, dark = 1, light = 0, row-major, no quiet zone. That chains supplied image → registry → live SVG → decoded URL.
- **Database facts** come from the read-only inventory `npm.cmd run phase-e:audit:production -- --org=11111111-1111-4111-8111-111111111111`.
  - Artifact `showcase-audit-production-northridge-20261014T203533Z.json`, sha256 `62e19f56…960f7d`, kept in the gitignored `qa-artifacts/phase-e/`.
- **No request was made to any `/t/` URL.** Earlier page reads used the scan-free `/nojs/t/{code}` render (`recordScan={false}`). That is resolver-equivalent evidence, not a scan of printed media.

## The four protected routes

All four live in organization `11111111-1111-4111-8111-111111111111` ("Northridge"). Each is `active`, production-primary, and has `supersedes_qr_link_id = null` with nothing superseding it.

| URL | Website label | QR row id | Asset row id (code · current name) | Exact scans (first → last) | Last 30 days |
|---|---|---|---|---|---|
| `https://mulemark.io/t/demo-ex017` | EXCAVATOR-017 | `41111111-1111-4111-8111-111111111101` | `21111111-1111-4111-8111-111111111101` (EXCAVATOR-017 · "Excavator 017") | 938 (2026-06-16 → 2026-10-12) | 44 |
| `https://mulemark.io/t/ezzs9ueg` | EXCAVATOR-3015 | `07c8ca60-0102-48c6-ac96-a8cb4b27ca90` | `7f7753d2-37f9-4e74-bbb2-90f048523f21` (EXCAVATOR-3015 · "Mini Excavator 301.5") | 790 (2026-06-27 → 2026-10-12) | 23 |
| `https://mulemark.io/t/demo-tr014` | TRAILER-014 | `41111111-1111-4111-8111-111111111102` | `21111111-1111-4111-8111-111111111102` (TRAILER-014 · "Trailer 014") | 57 (2026-06-17 → 2026-10-14) | 30 |
| `https://mulemark.io/t/67uqc3q7` | TRAILER-2041 | `97c20650-4c09-4828-ac02-3cd6b4d083cb` | `3313ed1c-f738-4817-b4fa-6f2163dc2e14` (TRAILER-2041 · "Utility Trailer 204") | 823 (2026-06-23 → 2026-10-12) | 27 |

Scan counts are as of 2026-10-14 20:35Z and include test traffic. Real traffic is still arriving: 124 scans across the four codes in the last 30 days. Some are crawlers or link previews, because `/t/` carries no `noindex`.

### Artwork register

Every file below decodes, with Reed-Solomon verified, to exactly the URL in its row. Website files are V4-H. Tags carry the same matrix as the website file. "Matrix" is the decoder's canonical hash: rows of `1`/`0` joined by newlines.

| Artifact (marketing `57747c3`) | Bytes | File SHA-256 | Version · mask | Matrix (canonical) | Registry `matrix_sha256` |
|---|---|---|---|---|---|
| `site/assets/qr-excavator-017.svg` | 7,732 | `468811679f38a263520f0ccdb50250e50097d7a4d7bf4e479b62bd446abe8623` | V4-H · 1 | `30de7e0c…cbc343` | `fff7e6b3…c85b98d` ✓ |
| `site/assets/qr-excavator-3015.svg` | 7,925 | `838417f97b387543a391a1d3934b8bd7a8e988355f09f347f87a2bc4e3749217` | V4-H · 6 | `946b900d…61b069` | `ba3a2de1…720c65` ✓ |
| `site/assets/qr-trailer-014.svg` | 7,875 | `b807de77037dd2320f77aef071dc8e5a56e006f5ffe0f18be81a941f9ca36eb5` | V4-H · 6 | `4e605343…a29feb` | `1c85e68a…a7e20` ✓ |
| `site/assets/qr-trailer-2041.svg` | 7,763 | `01a5080cdfed4c135626c173c62b25cd3ce787b9e947ba464e0a3987e4a0e0e4` | V4-H · 6 | `144a2e65…39a03a` | `a518da50…b4af6d` ✓ |

The tag artwork (`tag-{code}-{bone,iron}.svg`, eight files) reads "NORTHRIDGE RENTALS · {asset code} · START HERE. COME BACK ANYTIME. · Quick Start · Help · Report an Issue". The public page must keep delivering those three promises. Full hashes for the live (built) and committed files are in the manifest.

### Lineage and history of the four rows

- `demo-ex017` and `demo-tr014` are seed rows. `supabase/migrations/0004_align_demo_seed.sql:59-68` set those short codes in place on the same row ids, so scan foreign keys stayed valid. That was before anything was printed. It is history, not a precedent.
- The TRAILER-014 asset row began as the seed's scissor lift. `0004:25-33` repurposed it as a Big Tex 35SA trailer.
- `ezzs9ueg` and `67uqc3q7` are generated eight-character codes.
  - `67uqc3q7` was created with its asset on 2026-06-23.
  - `ezzs9ueg` was created on 2026-06-27, four days after its asset.
  - Each is the only QR row its asset has now. A deleted predecessor would leave no trace, because deletes cascade.
- `lib/qr/svg.test.ts:70-72` labels `excavator-17` an alias and `67uqc3q7` a "generated replacement alias". Those are **unit-test fixtures**, not Production facts. No `excavator-17` row exists anywhere in Production.
- Stored `qr_links.public_url` values are stale: `app.example.com` for the seed rows, `localhost` for codes created from a local session against Production. The app computes the encoded URL from `NEXT_PUBLIC_SITE_URL` and never from that column. **Do not regenerate or re-encode codes to tidy it.**

## Business cards — UNVERIFIED (blocks the E2C cutover)

The card artwork is not on this machine and not in the marketing repository. It exists only in the ChatGPT Mulemark project: `Mulemark_Metal_Card_Deliverables_v1.zip` and `01_black` / `02_bone` / `03_stainless_MMBC_submission_CMYK.pdf`, dated 2026-09-11.

The website registry is **not** evidence of what the cards encode. A card might encode one of the four routes, a root page (`https://mulemark.io`, `https://getmulemark.com`) or something else.

**Operator action:** for each variant actually ordered, send either the printer's final proof or a phone scan of a physical card.
- Read the decoded URL without opening it; opening it writes a scan row. If it was opened, say so.
- Vector proofs are decoded with the same tool. Raster proofs and physical cards need the phone scan.

| Variant | Evidence | Decoded destination | Status |
|---|---|---|---|
| 01_black | — | — | UNVERIFIED |
| 02_bone | — | — | UNVERIFIED |
| 03_stainless | — | — | UNVERIFIED |

If a card encodes a root or marketing URL, that page must keep offering a clear route to the showcase. Today `mulemark.io/` links `/t/demo-ex017`, and `getmulemark.com/demo` links all four routes.

## Other artwork and codes that may be in circulation

| Artifact | Encodes | Assessment |
|---|---|---|
| `Downloads/qr-sheet.svg`, `(1)`–`(6)` (2026-06-19; three distinct files) | `http://localhost:3000/t/{demo-comp003, demo-ex017, demo-gen008, eb43bf3r, demo-tr014}` at V3–V5, levels M/Q/H | Local-development host; never valid as a printed destination. **Not protected.** |
| `Downloads/qr-sheet (7).svg` (2026-07-20) | `https://qr-asset-tags.vercel.app/t/{demo-comp004, demo-ex017, ezzs9ueg, demo-gen008, eb43bf3r, demo-tr014, 67uqc3q7, 7gzt4aqc}` | **Conditionally protected.** If anything from this sheet was printed, the host and all eight codes are in circulation. The host still serves the app (HTTP 200 at `/`, no redirect, 2026-10-14). **Correction (E1, 2026-10-17):** seven of the eight codes resolve. `7gzt4aqc` (WSHR-001) shows "This page isn't available", because that asset's equipment page has been unpublished since 2026-07-13. The scan-free health check found this, and the Production audit confirms it. Nothing was changed; whether to publish the page depends on the printed-sheet answer. The sheet labels COMPACTOR-003 with `demo-comp004`, its current primary after the July rotation. |

**Operator question, same message as the cards:** was the July 20 sheet, or any other QR sheet or physical tag, ever printed?

Two Northridge tag requests sit at `in_production` / `ready`:
- `da5fc3db` covers METER-204 and TRAILER-2041;
- `104b4d37` covers EXCAVATOR-017 and EXCAVATOR-3015.

They are almost certainly QA records, but confirm that no physical tag was made from them. A "yes" makes `4c4dy59n` (METER-204) protected too.

While the answers are pending:
- Keep the `qr-asset-tags.vercel.app` alias: never rename or delete the Vercel project.
- Keep all twelve Northridge QR rows exactly as they are; the [archive boundary](CANONICAL_SHOWCASE_FLEET.md#8-archive-and-reset-boundary) treats them all as KEEP.

## Hazards a later prompt must design around

1. **Any Northridge user can switch off a printed code.** `setQrLinkStatus` (`lib/qr/actions.ts:96-120`) checks only `requireProfile()`. RLS scopes it to the org, but nothing protects a production-primary row. A disabled code stops resolving. `docs/CURRENT_ARCHITECTURE.md:73-74` says the opposite and is corrected by a note in E0.
   - **Proposed remedy, not built:** an additive guard so a protected or production-primary row can be disabled only by the owner, with a reason. This needs a migration approval.
2. **Cascades destroy history.** `scan_events.qr_link_id … on delete cascade` (`0001_init.sql:211`, restated in `0023`). Asset-scoped tables also cascade from `assets`. Deleting and recreating a protected asset or QR row would silently destroy its scan history and change its ids.
3. **`supabase/seed.sql` must never run against a hosted database,** despite `docs/DEMO_SCRIPT.md:20-24`. It is insert-only and scoped to the demo org, so it is not destructive, but on Production it would:
   - add six more published assets with six **new public routes** (`demo-sl021`, `demo-lt006`, `demo-ac012`, `demo-ts004`, `demo-ss009`, `demo-cm005`);
   - add seven synthetic submissions, two tag requests and four documents, mixed indistinguishably into real history.

   E0 adds a hazard banner to that doc.
4. **Demo data already lives in numbered migrations** (`0003_seed.sql`, `0004_align_demo_seed.sql`, `0007_demo_cover_images.sql`). They are historical and already applied, so never edit them. E2B must not add demo data to a migration.
5. **Crawlers and previews write scans.** `/t/` has no `noindex` and no bot filter. Scan totals on these routes are never evidence of adoption.

## Re-verification

Run these from the app repo:

```
npm.cmd run phase-e:decode-qr -- <svg files>
npm.cmd run phase-e:audit:production -- --org=11111111-1111-4111-8111-111111111111
```

- The decoder reads local files only; download the live SVGs first.
- Both tools are read-only. Neither ever requests a `/t/` URL.
