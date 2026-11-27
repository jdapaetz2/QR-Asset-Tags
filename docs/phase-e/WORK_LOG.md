# Phase E work log

Durable record for resumed sessions:
- approvals;
- environment state;
- what ran and what it touched;
- artifact and manifest hashes;
- open decisions;
- the next command.

Per the brief, **do not repeat a successful audit just because a session resumed.** Re-run only the drift checks named here.

## E0 — audit, canonical fleet lock and delivery contract (2026-10-14)

### Approvals

| When | What | How |
|---|---|---|
| 2026-10-14 | E0 plan approved, including two deviations: (1) commit two read-only tools with tests and `package.json` scripts; (2) zero `/t/` requests, using `/nojs/t/` for page reads | Plan mode, ExitPlanMode |
| 2026-10-16 | Grouped approval items 1–5 ([DECISIONS.md §4](DECISIONS.md#4-the-grouped-approval-e0-requests)) **approved as written**. The OMM purchase listed inside item 1 is treated as still needing an explicit cost confirmation, because the chat summary asked for it separately | Operator chat reply "Approve 1-5" |

### Starting state

**Repositories**
- **App repo** `jdapaetz2/QR-Asset-Tags`.
  - Branch `phase-e/showcase-onboarding`, created from `pilot-credibility` at `096e7bb4ec9d5ecca37f1444fa8a8f10ad790506` (2026-09-15, docs-only closeout of D5.1).
  - The tree was clean and equal to `origin` at branch time.
- **Production deployment:** `mulemark.io` serves `93fe39bb4c5836b74d757ea5bfafe03184573052` (deployment `4cu3ewBh`, promoted 2026-09-14 22:45Z). `096e7bb` adds docs only.
- **Marketing repo** `jdapaetz2/Getmulemark.com` (private).
  - `main` = `57747c3` (2026-09-17). `copy/about-rental-lifecycle` is identical to `main`; `launch/consent-and-events` (PR #2) adds consent and analytics only and changes no QR asset.
  - Live `getmulemark.com/assets/qr-*.svg` are byte-identical to the `57747c3` blobs. The live tag SVGs are the committed source plus the build's style block.

**Environments**

| Environment | Supabase ref | Notes |
|---|---|---|
| Production | `apeiswnkheiwrpvumder` | — |
| Staging | `kwserenxwjxozztyigmw` | The Supabase CLI stays linked here |

- **Schema:** 0001–0039 on both. *Ledger evidence* (`docs/MIGRATION_LEDGER.md:63-64`: matched on 2026-09-12/13, none added since). Not re-queried in E0.

**Tools**
- Available:
  - Node 24.16;
  - npm via `npm.cmd`;
  - repo packages `qrcode` 1.5.4, `sharp`, `pngjs`, Playwright, `@supabase/supabase-js`;
  - ajv 6.15.0 (transitive);
  - Python 3.14 (numpy and reedsolo only).
- Absent: `gh`, zbar, ImageMagick, OpenCV.

### What ran (all read-only)

| Action | Target | Effect |
|---|---|---|
| Partial clone (`--filter=blob:none --depth 1`) of the marketing repo into the session scratchpad; branch diffs | GitHub | Local copy only, never run, never committed |
| Download of 12 live SVGs (`/assets/qr-*.svg`, `/assets/tag-*.svg`) to the scratchpad | getmulemark.com | Static files; no `/t/` |
| `npm.cmd run phase-e:decode-qr` on the 12 live files and the 8 `Downloads/qr-sheet*.svg` files | Local files | — |
| `HEAD /` on `qr-asset-tags.vercel.app` and `mulemark.io` | Root pages | No scan; both returned HTTP 200 |
| `npm.cmd run phase-e:audit:production -- --org=…` for Northridge (×2) and the Production QA org | Production | SELECT, head counts, Storage list. **No writes** |
| `npm.cmd run phase-e:audit:staging -- --org=…` for Northridge, QA A and QA B | Staging | Same, no writes |
| OEM pages (Big Tex 35SA, 14LP, owner's manuals), Commons API; `HEAD` only on 5 Big Tex PDFs | Web | No PDF downloaded |
| Guard checks: missing `--org`, non-fixture `--org`, a staging org on Production, the Production QA org on staging, `--target=staging` with Production credentials | — | All refused before any query |

**Not done in E0:** data writes, Storage changes, email, migrations, deployments, DNS changes or QR changes. **`/t/` requests made: 0.** Production effects: reads only.

### Artifacts (gitignored `qa-artifacts/phase-e/`, never committed)

| File | SHA-256 |
|---|---|
| `showcase-audit-production-northridge-20261014T203400Z.json` (first run, superseded) | `c0b5b66aaf354278567dfd091adf6d7d718ea053ba805cf9bc8bd04acb48dbb2` |
| `showcase-audit-production-northridge-20261014T203533Z.json` (**reference**) | `62e19f56068a1c4f0d07823d1cbe876f8e834104e1f2aed5fa89155739960f7d` |
| `showcase-audit-production-production-qa-20261014T203539Z.json` | `94664f76451f5650c98c3b5f8f4b2b274fa25f2cd0286ca78560a34384a70bfa` |
| `showcase-audit-staging-northridge-20261014T203553Z.json` | `c511d5d755ea3c8308b2dd3330d9908d53c46820272651cb877a14d33b0a3864` |
| `showcase-audit-staging-staging-qa-a-20261014T203600Z.json` | `1bf3a53363ee976e4e98b448e8ee9075ae48dc54b935ec4b1489715a813188a4` |
| `showcase-audit-staging-staging-qa-b-20261014T203604Z.json` | `e3d6bdbd7035a4c9940f69421c1d8706c11dc0e8bea654351796085f698c7a4b` |

### Tracked manifests and schema

SHA-256 of the committed (LF) bytes. A Windows checkout with `core.autocrlf=true` rewrites line endings, so hash the git blob (`git show HEAD:<path>`), not the working copy.

| File | SHA-256 |
|---|---|
| `docs/phase-e/manifests/protected-demo-routes.json` | `2a407389b1bcbd733d576d4c36d6e5a579ee8c4b28108de6b638dcd9e9d22e02` |
| `docs/phase-e/manifests/northridge-archive-boundary.json` | `907eb94e0c8be1d50ee05c93b3ce1c0db068f4e0d93acecb0695792e1f5ca782` (approval status recorded 2026-10-16; E0 commit `c71eeb0` carried `0eeb0b4c…7ad9`) |
| `docs/phase-e/schema/equipment-content.schema.json` | `35af37e4281474330146b3e40cc78ed9d394990e51034bfe91d7315f30ec05e2` |
| `docs/phase-e/schema/equipment-content.example.json` | `a68be0d7bf865ea6d0e8f7ad21db764857b341d6d0f2ec64d8786a85cffbd719` |

The example validates against the schema with ajv 6.15.0, and the 8 negative cases are rejected.

### Findings handed to later slices

| Finding | Owner |
|---|---|
| **Westerra (real dealer) logo hotlinked** as the Northridge brand | E2A/E2C |
| Third-party hotlinked covers on all showcase assets (rights unknown) | E2A/E2C |
| 5 hosted documents with unknown provenance and rights, public | E2C (non-public at cutover) |
| 7 submission media references pointing at missing Storage objects | E1 archive notes |
| Northridge support phone not dialable; "Powered by AssetTag QR" label | E2C |
| TEST-001 published with test copy; 5 open rental sessions | E2C |
| Any org user can disable a printed code; `CURRENT_ARCHITECTURE.md:73-74` was wrong (note added) | Guard before E2C |
| `supabase/seed.sql` must never run on a hosted DB (banner added to `DEMO_SCRIPT.md`) | — |
| Stored `qr_links.public_url` hosts are stale (`app.example.com`, `localhost`); the app never reads them | Leave as-is |
| Production QA org holds 129 MB of submission photos (Free-plan Storage budget) | Operator awareness |

### Open, operator-pending

1. Business-card proofs or scans: 01_black, 02_bone, 03_stainless.
2. Was the 2026-07-20 sheet (`qr-asset-tags.vercel.app`) or any tag from requests `da5fc3db` / `104b4d37` printed?
3. Big Tex 35SA and 14LP photos (owned, or Big Tex permission).
4. Explicit cost confirmation for the two OMMs (Bobcat 7255004; Cat 301.5). The operator makes the purchase.
5. Northridge logo replacement and support-number choice.

### Next command (at E0 close)

Prompt E1 — done; see below.

## E1 — recoverable archive, QA isolation and reset rehearsal (2026-10-16/17)

### Approvals and operator decisions

| When | What | How |
|---|---|---|
| 2026-10-16 | E1 plan approved (bounded implementation; no Production reset, deletion, migration or email) | Plan mode, ExitPlanMode |
| 2026-10-16 | Archive location: a local folder outside the repository and OneDrive (`%USERPROFILE%\Mulemark-Ops-Archive\`) | AskUserQuestion: "Local folder" |
| 2026-10-16 | Docker loopback: operator set the Engine `"ip": "127.0.0.1"` and default bridge `host_binding_ipv4`; then approved starting the stack and pre-creating the network with loopback binding | AskUserQuestion: "I'll fix it", "Go ahead" ×2 |
| 2026-10-16 | **Split by data:** the all-interfaces local stack gets synthetic and staging-QA data only; a real archive restores only into a temporary container bound explicitly to `127.0.0.1:55432` with data on tmpfs | AskUserQuestion: "Split by data" |
| 2026-10-17 | `7gzt4aqc` (WSHR-001, conditional sheet) may stay unavailable even if the 2026-07-20 sheet was printed; it is not protected. The other sheet codes are unaffected | Operator chat: "The code, if there was one, can die" |
| 2026-10-17 | **E2A input, the Bobcat E20 manual:** the operator will buy OMM P/N 7255004. This confirms the cost for that manual. Cheapest official option: Bobcat's Canadian store, digital PDF `7255004ENUSPDF`, CA$85.99 (paper `7255004ENUS` is CA$91.49 plus shipping). The Cat 301.5 manual still needs its part number, price and a separate yes | Operator chat: "Sure, I'll buy the bobcat manual" |
| 2026-10-17 | **E2A input, photos:** the showcase pages may not go without photos. Wikimedia Commons, Openverse and Flickr (commercial-use licences only) have no usable photo of the Big Tex 35SA or 14LP, so the operator will ask Big Tex for permission to use its official product photos | Operator chat |

### Environment findings

- **Docker Desktop ignores loopback defaults for CLI-created containers.** Even with the Engine's `ip` set, a default bridge `host_binding_ipv4`, and a network pre-created with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, the Supabase stack published on `0.0.0.0` and `::`. This was checked with `docker port` and `Get-NetTCPConnection`, and the stack was stopped with volumes kept each time. An explicit `-p 127.0.0.1:…` **is** honoured, hence the standalone container.
- **Windows reserved TCP 54229–54328** (WinNAT) once blocked `supabase start`. The operator cleared it.
- **The Kong route to auth goes stale after `supabase db reset`.** The reset restarts the auth container, and Kong can keep routing to the old address, so `/auth/v1/health` through `127.0.0.1:54321` returns 502 while the container reports healthy. Fixture user creation then fails with an empty error. Fix: `docker restart supabase_kong_QR_Asset_Tags` until `/auth/v1/health` returns 200. This is local only and touches no volume.
- **Time-zone data:** this machine's ICU puts 6 AM `America/Vancouver` on 2026-11-02 at 13:00 UTC, with no return to PST. The planner mirrors the app's own computation (parity-tested), so they agree. If the Vercel runtime's data still has PST, the planner's watermark is at most one hour *earlier*, which is the safe direction.

### What ran

| When (UTC) | Action | Target | Effect |
|---|---|---|---|
| 10-16 | Local stack runs: graph generation, synthetic rehearsal (`npm.cmd run test:phase-e-local`) | Local | Local data only |
| 10-17 00:28 | `npm.cmd run phase-e:audit:staging -- --org=11111111-…` | Staging | Reads |
| 00:28–00:30 | `npm.cmd run phase-e:archive:staging` for QA org A and staging Northridge; verified; restored into the local stack (both VERIFIED) | Staging → local | Staging reads; local writes |
| 00:30–00:31 | `npm.cmd run phase-e:reset:staging` no-op and draft-e2c manifests and dry runs (both ACCEPTED) | Staging | Reads |
| 00:31–00:33 | `npm.cmd run smoke:staging` (probe-gated): 28 pass, 0 fail, 1 skip; probe verified at start and end | Staging | **QA writes** (below) |
| Before 00:28, and 00:37 | `npm.cmd run phase-e:health:production` on `mulemark.io` and `qr-asset-tags.vercel.app` (two runs) | Production | `/nojs/t/` GETs only (no scan rows) |
| 00:33 | `npm.cmd run phase-e:audit:production -- --org=11111111-…` | Production | Reads |
| 00:34 | `npm.cmd run phase-e:archive:production -- --org=11111111-…`, then offline verify | Production → archive folder | Reads; package outside Git |
| 00:35–00:37 | Standalone: up (loopback verified by the tool and independently), restore, reset rehearsal (no-op; draft-e2c applied and re-applied; rollback to the archive applied; no-op), down | Loopback container | Local tmpfs only; container removed, 0 listeners left |
| 00:37 | `npm.cmd run phase-e:reset:production` no-op, draft-e2c and archive-equality (restore-kind) manifests and dry runs (all ACCEPTED) | Production | Reads |

**Live QA writes (recorded):** `smoke:staging` on 2026-10-17 at about 00:31 UTC made only these writes:
- in staging QA org A: one support request and one damage report on `stg-qa-public`, named "B5 smoke 2026-10-17T00:3x" and from `smoke@mulemark-staging.invalid`;
- scan rows from its `/t/` visits to the QA codes `stg-qa-public`, `stg-qa-disabled` and `stg-qa-rented` (QA org A), plus a staff scan and a denied org-B code.

It submitted no acknowledgement, and nothing was written outside the staging QA organizations.

**Not done in E1:**
- **Production:** writes, deletes, email, migrations, deployments, DNS or QR changes. The effects were reads and scan-free `/nojs/t/` GETs. `/t/` requests made to Production: **0**.
- **Staging:** writes other than the smoke's recorded QA rows.

### Drift check (E0 boundary → 2026-10-17 00:33Z)

All rows unchanged except the append-only tables:
- assets 11, QR rows 12, pages 11, documents 6, sessions 18, submissions 49, acknowledgements 10, profiles 1, tag requests 4 (assets 6), activity 0;
- Storage 47 / 5 / 1 objects with the same bytes.
- Scans 3,182 → **3,190**: visitors since 2026-10-14.
- Digest runs 33 → **35**: the daily cron on 10-15 and 10-16.

Both are expected; scans and the ledger are append-only and never written by a reset.

### Packages (outside Git; summaries in `docs/phase-e/archives/`)

| Package | Manifest SHA-256 | Contents |
|---|---|---|
| `northridge-production-20261017T003411Z` | `b1c781684c7364656b460cfa2eb1f54416067327737a31b913f05d3a5a30cff5` | 17 tables (3,190 scans, 49 submissions, 35 ledger rows); 53 objects, 23,107,566 bytes; 104 references, 7 missing (the E0 seven); 1 external identity (platform owner) |
| `northridge-staging-20261017T003019Z` | `892af4bc21a489c7cdddecd88a695a4fbb32ffdaa396d4d3854b1f14aed007df` | 4 assets, 4 QR rows, 1 submission, 2 scans; no objects |
| `staging-qa-a-staging-20261017T002858Z` | `45dcb1d440abc6fde22ad58fa4845bead65473a311eb8bd9bd7ae27793b3acba` | 89 submissions, 213 scans; 35 objects, 91,474,044 bytes; 2 missing references |

**Copies of the Production package:**
- The original, in the archive folder.
- A local copy at `C:\Mulemark-Archive-Copy\`, made 2026-10-17 at the operator's request: 37 files re-verified OK with the same manifest `b1c78168…`. It sits outside OneDrive; the Desktop holds only a shortcut to it, because the Desktop syncs to the employer's OneDrive.

The local copy is on the same disk, so it does not count as separate media. A verified copy on a USB drive or external disk is still required before any E2C approval ([runbook §1.1](DEMO_RECOVERY_RUNBOOK.md#11-making-and-checking-the-second-copy)).

### Rehearsal results

**Production package → standalone:** VERIFIED.
- 80 integrity checks pass; 17 tables hash-identical.
- Active pointers are consistent.
- 12 routes were checked under anonymous RLS (12 protected), with 0 mismatches.
- All 53 objects are hash-verified.

**Reset on the restored real data (standalone):**
- **No-op:** ACCEPTED, all KEEP.
- **Draft E2C:** assets UPDATE 5 (pointers), sessions UPDATE 5 (open → cancelled), documents UPDATE 5 (hosted → private), acknowledgements DELETE 10, submissions DELETE 49; everything else KEEP. This is exactly the approved boundary. It applied as 13 guarded statements in one transaction and converged; the rerun was 0 statements.
- **Rollback to the archive:** the exact inverse. It applied as 45 statements and converged, and a fresh no-op afterwards is all KEEP.

**Production dry runs** (tracked summaries):
- `noop-production-20261017T003703Z`: ACCEPTED, all KEEP.
- `draft-e2c-production-20261017T003707Z`: ACCEPTED, the same counts as the standalone rehearsal.
- `restore-production-20261017T003711Z`: ACCEPTED with **zero changes**. Live Production equals the archive.
- Watermark: last success 2026-10-16 13:00Z. Seeded returns must be dated at or before 2026-10-16 13:00Z for the 10-17 cutoff.

**QR rows:** all 12 are byte-equal between the archive and a live snapshot at 00:37:11Z, and match the E0 registry for code, status and primary.

**Health:** `mulemark.io` 5/5 (4 protected routes resolve to their assets; `demo-comp003` stays unavailable). The alias is also 5/5, plus the conditional sheet codes; see the finding below.

**Staging:** both packages restore VERIFIED into the local stack. QA org A's 35 objects were re-uploaded and re-hashed, and its 2 dangling references are still missing. Staging dry runs: the no-op is ACCEPTED, all KEEP; the draft is ACCEPTED, with 1 submission deleted.

### Gates

| Gate | Result |
|---|---|
| `npm.cmd test` | 202 files, 2,341 tests pass |
| `npm.cmd run lint` / `typecheck` / `build` | Clean / clean / pass |
| `npm.cmd run test:phase-e-local` | 34/34 |
| `npm.cmd run test:security` | 125/125 (10 files). Run as `db:reset`, then the Kong restart above, then the suite, because the first two attempts hit the stale Kong route in global setup |
| `npm.cmd run test:e2e` (after `test:e2e:reset`, then the Kong restart) | 105 passed, 0 failed, 8 skipped. The skips are all of `public/photo-formats.spec.ts`, which skips itself when `MEDIA_FIXTURES_DIR` is not set (its licensed sample photos live outside the repository); they predate E1. `[e2e-env] verified` printed before the build |

### Tracked manifests and schema (E1)

SHA-256 of the committed (LF) bytes.

| File | SHA-256 |
|---|---|
| `docs/phase-e/manifests/northridge-archive-boundary.json` | `5fca488fa59c7434b75f4065b3cd08e1d48b23709109b9d19efddf0bf3052324` (adds the `retention` hold; was `907eb94e…`) |
| `docs/phase-e/manifests/tenant-dependency-graph.json` | `05ff946b1d08ae2c96c0e1ed798b31549b6c65b0470aca2d86974fe663bbea2d` (`graph_sha256` `f90f1d97894199a1dbc3535a231c6a35f25ba87736a3d2cf0f6763c98500e065`; 18 tables, 39 migrations) |
| `docs/phase-e/manifests/protected-demo-routes.json` | `2a407389…2e02` (unchanged) |
| `docs/phase-e/archives/northridge-production-20261017T003411Z.json` | `f4c1caafe30e5f0f1d5e19b34e47ad9f37f0b343b9f27cbdbc00d1ee065ac874` (redacted summary, including the standalone rehearsal) |

**Untracked audit artifacts** (`qa-artifacts/phase-e/`):

| File | SHA-256 |
|---|---|
| `showcase-audit-production-northridge-20261017T003343Z.json` | `7e246de6bffe3a82ffea27729fd1da68374896423ead69327bafa0fadce08ef7` |
| `showcase-audit-staging-northridge-20261017T002840Z.json` | `3f1a5d830a27384f46af42100ebb08226cd7c8e7bfa3d8ba01f54c1d4bc9d7d2` |

### Findings

| Finding | Owner |
|---|---|
| `7gzt4aqc` (WSHR-001, on the conditional 2026-07-20 sheet) shows "This page isn't available": its equipment page has been unpublished since 2026-07-13. [PROTECTED_DEMO_ROUTES.md](PROTECTED_DEMO_ROUTES.md) said all eight sheet codes resolve; corrected. Nothing changed | **Closed** 2026-10-17: the operator lets the code stay unavailable |
| E1 `apply` refuses hosted targets by design. E2C must add the approved hosted execution path (SQL editor or database URL); `plan` already emits the reviewable transaction. Informational: nothing to decide until E2C, which brings the options | E2C |
| A rollback re-inserting a return checklist created after the last digest watermark is refused (conservative). Wait for the next daily run or decide explicitly | E2C runbook |

### Open, operator-pending

The E0 list still applies, plus two items. Neither is needed now:
1. **Before any E2C approval:** a second verified archive copy on a USB drive or external disk ([runbook §1.1](DEMO_RECOVERY_RUNBOOK.md#11-making-and-checking-the-second-copy)). The agent can copy and check it once the drive is plugged in and its letter given.
2. **Before E2B:** paste one read-only query into the Production SQL editor and send back the single row it returns ([runbook §6](DEMO_RECOVERY_RUNBOOK.md#6-seed-notification-suppression)). Expected: `21 | none | pg_cron not installed`. The Vercel crons, Edge Functions and Auth hooks were covered from the repository.

### Next command

**Prompt E2A** (content packs and pictograms), started in plan mode **only when the operator runs it**. It is never started automatically. Resume from this log. Do not re-export: the Production package above is the E1 recovery copy. Drift check first:

```
npm.cmd run phase-e:audit:production -- --org=11111111-1111-4111-8111-111111111111
```

## E2A — sourced showcase packs and pictographic guides (2026-10-17)

E2A ran in two stages with one grouped approval between them:
- **Stage 1:** sources, identities, photos, pack drafts, storyboards and the review gallery.
- **Operator approval.**
- **Stage 2:** artwork, guide PDFs, page text, import manifests, index, extensions, marketing candidates, tests and the commit.

Nothing is published, and Northridge is unchanged.

The drift check above was **not** run: the approved E2A plan touches no Supabase project. E2B starts with it.

### Approvals and operator decisions

| When | What | How |
|---|---|---|
| 2026-10-17 | E2A plan approved: two stages, the grouped approval of storyboards and photos before any artwork, the 12 listed downloads, one Cat Publications price search | Plan mode, ExitPlanMode |
| 2026-10-17 | Bobcat manual purchase and the Big Tex photo request (both recorded under E1 above) | Operator chat |
| 2026-10-17 | Only official sources are used. Bobcat's manual is not reproduced; the E20 Start-Up Guide is original, cites its sources and links to Bobcat's official manual | Operator chat ("rebuild the E20 manual"), answered with this approach |

### What ran

| When | Action | Target | Effect |
|---|---|---|---|
| 10-17 | The 12 approved downloads (Big Tex ×5, Bobcat ×2, Cat ×2, Commons photos ×3), each hashed | OEM sites, Wikimedia Commons | Reads; files in the vault |
| 10-17 | Cat Publications search for M0088895: price only, no account, no purchase | catpublications.com | Read |
| 10-17 | Saved the Big Tex 35SA, 14LP and owners-manuals pages for spec provenance; HEAD checks of every OEM file (sizes match the vault) | bigtextrailers.com, Bobcat and Cat hosts | Reads |
| 10-17 | `npm.cmd run phase-e:packs:photos` (recipes `e20-a`, `e20-b`, `cat-301-5`; `e20-b` dropped in Stage 2) | Local | Photo derivatives under `docs/phase-e/packs/*/media/` |
| 10-17 | `npm.cmd run phase-e:packs:review` | Local | Packs synced; review copies, storyboards, `SOURCES.md`, both galleries |
| 10-17 (Stage 2) | `npm.cmd run phase-e:packs:build` (guides, review, import manifests); `phase-e:packs:photos` again (full-frame E20 copy) | Local | Panels, guide PDFs, index, import manifests |
| 10-17 (Stage 2) | Cat Publications pages (no account): looked for a stable product link for M0088895 and found none | catpublications.com | Reads |
| 10-17 (Stage 2) | Shallow clone of the marketing repository (`57747c3`) into the session scratchpad; candidate edits there, `git apply --check` of both patches. Nothing committed or pushed there; its own scripts were not run | GitHub | Read; local scratch copy only |

No Supabase project was touched, no `/t/` URL was requested, nothing was published or emailed, and Northridge is unchanged.

### Source vault (outside Git)

`%USERPROFILE%\Mulemark-Sources\e2a\`. `SHA256SUMS` lists all 15 originals: 9 OEM PDFs, 3 OEM web pages and 3 Commons photos. Also there:
- `renders\`: cited manual pages as images (made with `scripts\phase-e\packs\render-pdf-pages.ps1`);
- `inspect\retouch\`: before-and-after crops of every photo edit;
- `review\REVIEW_GALLERY_PRIVATE.html`: the review gallery with manual pages and unretouched crops. **Private: never commit, share or publish it.**

The register is [packs/SOURCES_REGISTER.json](packs/SOURCES_REGISTER.json), rendered as [packs/SOURCES.md](packs/SOURCES.md).

### Findings

| Finding | Effect |
|---|---|
| Both Big Tex owner's manuals are unfinished: the lug-nut torque table is a placeholder (Owners Manual p. 70, Dump Trailers p. 80) | Torque is BLOCKED. Guides say "tight before each tow" and show no number |
| The Hoist Manual (February 2013) lists the 14LX/GX, 10LP-12 and 70LP, not the 14LP | Its troubleshooting answers are BLOCKED until Big Tex confirms; question added to the operator's Big Tex email |
| Big Tex's two connector sheets disagree about the 7-way black and blue wires | No pin-level guidance; staff check the connection only |
| The 35SA page calls the ramp gate both standard and optional; the 14LP page does not mark the solar charger or remote | The showcase units have them fitted; recorded as warnings |
| The licensed E20 photos and OMM 7255004 are the E20 with serial prefix B3BL. Bobcat's current site and brochure B-3038 describe the newer E20 (November 2025) | E20 specs come only from 7255004; B-3038 is never used |
| Bobcat's B-1699 rental safety sheet covers all its compact excavators and gives the US utility-locate number (811) | Rules from it are REVIEW_REQUIRED until cross-checked in the E20 OMM; the regional number is a Northridge input |
| Cat OMM M0088895-24 (June 2026) covers the 301.5 prefixes MNH and ZHL; price US$97 download, US$97 CD, US$114 printed | All 301.5 steps and panels are BLOCKED until the operator decides |
| The Cat brochure's text layer interleaves its columns | Specs were read from page images (p. 2: maximum operating weight with canopy 1,775 kg / 3,913 lb) |
| E20 photo A shows a rental company's decals, phone number and fleet number; the Cat photo has a political sticker and a dealer decal; photo B has a dealer sticker | Removed by recorded, repeatable recipes; wear and background left as photographed |
| The equipment-content schema needed somewhere for specs, panels, item status and credits | Schema 1.1.0, additive: every 1.0.0 manifest still validates |

### Status at the Stage 1 stop

| Asset | Model key | READY | REVIEW_REQUIRED | BLOCKED | What holds it |
|---|---|---|---|---|---|
| EXCAVATOR-017 | `bobcat.e20.b3bl-canopy` | 0 | 19 | 9 | E20 OMM purchase; photo choice; reviewer |
| EXCAVATOR-3015 | `cat.301-5.canopy` | 10 | 1 | 16 | Cat OMM decision; reviewer |
| TRAILER-014 | `bigtex.35sa.12` | 13 | 23 | 2 | Big Tex photo permission; reviewer; torque |
| TRAILER-2041 | `bigtex.14lp.14` | 12 | 31 | 5 | Big Tex photo permission; reviewer; hoist manual; torque; hoist capacity |

### Grouped approval (Stage 1 → Stage 2)

| When | What | How |
|---|---|---|
| 2026-10-17 | Storyboards and source mapping approved "for the initial pass" | Operator chat, item 1 |
| 2026-10-17 | E20 photo **A** (the US canopy unit, retouched); candidate B dropped and its derivatives deleted | Operator chat, item 2 |
| 2026-10-17 | Cat photo edit approved | Operator chat, item 3 |
| 2026-10-17 | Bobcat E20 manual: being bought, not yet in hand | Operator chat, item 4 |
| 2026-10-17 | Cat manual: **no for now**. The Cat page links Cat's official channel; every Cat operating step and panel stays BLOCKED | Operator chat, item 5 |
| 2026-10-17 | Big Tex request sent (photos, manual hosting, hoist-manual applicability; the draft also asked for the torque values); waiting on the reply | Operator chat, item 6 |
| 2026-10-17 | **Reviewer: the operator**, with final approval authority. Items stay REVIEW_REQUIRED until the operator reviews the finished guides and page text | Operator chat, item 7 |
| 2026-10-17 | Defaults for the fictional Northridge: show 811; the yard does the daily service checks and renters walk around for leaks and damage | Operator chat, item 8 |

### Stage 2 outputs

| Output | Where | Notes |
|---|---|---|
| 20 original pictogram panels (35SA 8, 14LP 8, E20 4) | `packs/<model>/guide/*.svg`, `guide/web/*.{png,webp}` | Drawn in code from primitives (`pictogram-kit.mjs`, `pictogram-panels.mjs`); nothing traced from photos, OEM figures or standard symbols. E20 panels 3, 4, 7 and 8 need the OMM; all 8 Cat panels need the declined OMM |
| Start-Up Guide PDFs (2 pages each, "Review draft" banner) | `packs/<model>/guide/<model>-start-up-guide.pdf` | 35SA 413 KB, 14LP 418 KB (compact layout), E20 194 KB with labelled gaps for the four blocked panels. No Cat guide |
| Public page text: the 7 fields per asset, each with a status and the ids it condenses | `asset.page` in each `pack.json` | E20 quick start BLOCKED (needs the OMM's start-up and control steps). Cat page uses the fictional handover policy and the brochure's fuel-tank figure only |
| Documents per asset: the guide (hosted) and official manual links | `asset.documents` | Bobcat and Cat manuals are sold; links go to the official stores. Cat Publications has no stable product link, so the title says to search M0088895 |
| Showcase story, narrative and limitation per asset | `asset.showcase` | From the E0 stories |
| Field-level E2C import manifests | `packs/<model>/import-manifest.json` | From and to per field, the app's storage paths, pinned v4 ids, existing unknown-rights documents set private, QR rows untouched. `apply.allowed` is false for all four |
| Model-pack index | `packs/MODEL_PACK_INDEX.{json,md}` | Cat listed as standard tier until its panels can be drawn |
| Extension proposals (not built) | `packs/EXTENSIONS.md` | Credit line, pictograms in the page, a dump-trailer return checklist, store-link labelling |
| Marketing candidates (not pushed) | `packs/marketing/` | A: the live site's E20 scene hotlinks the **unedited** photo with the rental company's decals; the patch swaps in the full-frame retouched copy. B: demo-card labels, after E2C only. The trailer scene waits on Big Tex |
| Schema 1.1.0 additions | `schema/equipment-content.schema.json` | `asset.page`, `asset.documents`, `asset.showcase`; policy citations (`pol-…`) |

Every generated file is deterministic: a second `phase-e:packs:build` left all 63 guide files byte-identical.

### Status at E2A close

| Asset | Model key | Items (ready / review / blocked) | Page fields | Panels drawn | Guide | Photo | Import |
|---|---|---|---|---|---|---|---|
| EXCAVATOR-017 | `bobcat.e20.b3bl-canopy` | 1 / 18 / 9 | 2 / 3 / 2 | 4 of 8 | PDF (draft) | READY | not yet |
| EXCAVATOR-3015 | `cat.301-5.canopy` | 11 / 0 / 16 | 6 / 0 / 1 | 0 of 8 | none | READY | not yet |
| TRAILER-014 | `bigtex.35sa.12` | 13 / 23 / 2 | 3 / 4 / 0 | 8 of 8 | PDF (draft) | BLOCKED | not yet |
| TRAILER-2041 | `bigtex.14lp.14` | 12 / 31 / 5 | 2 / 5 / 0 | 8 of 8 | PDF (draft) | BLOCKED | not yet |

### Tracked files (E2A)

- `docs/phase-e/schema/equipment-content.schema.json` (1.1.0); `docs/phase-e/packs/` (see its [README](packs/README.md))
- `scripts/lib/photo-retouch.mjs`, `scripts/lib/content-pack.mjs`, each with tests
- `scripts/phase-e/packs/`: `photo-derivatives.mjs`, `pictogram-kit.mjs`, `pictogram-panels.mjs`, `guide-build.mjs`, `pack-review.mjs`, `import-manifests.mjs`, `render-pdf-pages.ps1`, `packs.test.mjs`
- `package.json`: `phase-e:packs:photos`, `:review`, `:guides`, `:import`, `:build`
- `.gitattributes` (new): pack SVGs and patches are stored byte-for-byte (`-text`). This machine has `core.autocrlf=true`, which would otherwise rewrite their line endings on checkout and break the recorded SHA-256 values
- Doc updates: this log, `PHASE_E_PLAN.md`, `ONBOARDING_DATA_CONTRACT.md`, `CANONICAL_SHOWCASE_FLEET.md`

### Gates (2026-10-17)

| Gate | Result |
|---|---|
| `npm.cmd run lint` | 0 errors. The one warning (an unused parameter in `guide-build.mjs`) was fixed and the pack scripts re-linted clean |
| `npm.cmd run typecheck` | Pass |
| `npm.cmd test` | 205 files, 2,375 tests passed, including the 38 E2A tests (schema, sources, status rules, hashes, PDF structure, image sizes, budgets, SVG safety, contrast and legibility, import manifests, vault hashes) |
| `npm.cmd run build` | Compiled successfully |

Also checked by eye: all 20 panels on contact sheets, every page of the three guide PDFs (rendered with `render-pdf-pages.ps1`), and both galleries (headless Chromium, every image loads).

### Open, operator-pending

1. **Review** the three draft guides and the page text (the operator is the reviewer). Approved items become READY and the review-draft banner drops on the next build.
2. **Bobcat E20 manual** (`7255004ENUSPDF`): save the PDF in the vault. Then panels 3, 4, 7 and 8, the E20 specs, fuel notes and the start-up and control steps get written and drawn.
3. **Big Tex's reply**: photos (both trailers' heroes and the marketing trailer scene), manual hosting, the 14LP hoist manual and the torque values.
4. **Cat manual**: declined for now. If that changes, the Cat panels and safety notes follow.
5. **Marketing**: patch A (E20 photo) can go live any time; patch B only after E2C. Both are applied in the marketing repository by the operator.

## E2A rework — picture-first guides and gallery (2026-10-17)

The operator reviewed the gallery and asked for a redo: far too little picture information, and as few words as possible, with any words supporting the pictures rather than explaining them. The rework covers the panels, the guides, the gallery and the public page text. The sourcing rules are unchanged: every picture comes from a cited manual page or a Northridge policy, blocked items stay blocked, and everything stays REVIEW_REQUIRED.

### Approval

| When | What | How |
|---|---|---|
| 2026-10-17 | Picture-first plan approved: the text rule, all 20 panels redrawn as frame sequences, 24 sign tiles, accessory icons, schema 1.2.0, two-page picture guides, the gallery rewrite and shorter page text | Plan mode, ExitPlanMode |

### What changed

| Output | Change |
|---|---|
| Text rule | Drawings carry numbers, units and symbols only; panel titles at most 4 words, sign labels at most 3; the rest moves to alt text and collapsed records. Enforced at draw time (`text-policy.mjs`) and by the tests |
| Panels (20) | Redrawn as up to 4 frames each: do, don't (red outline and cross), check (green tick), close-up. Each frame names the ids it comes from; alt text is built from the frames |
| Errors fixed in the art | "kg" on a trailer rated in pounds (now a weight symbol); an unsourced "40%" (the manual says about 60% in the front half, so the rear is unlabelled); trailers drawn unhitched where the manual loads and dumps them hitched (35SA panel 7; 14LP panels 4, 6, 7); trucks floating above the ground; turn-signal arrows pointing the wrong way; the E20 "backing up" a slope now faces downhill, as B-1699 words it; alt texts that did not match the drawings |
| Safety signs (24) | Original ISO 3864-style tiles, one per sourced warning or Northridge policy: 35SA 5, 14LP 10, E20 6, Cat 3 |
| Accessory icons | Straps, chain pins and spare (trailers), hoist remote (14LP), keys, attachments and manual (excavators, from the return template). "Tarp" removed from the 14LP list: no policy issues it |
| Start-Up Guides | Two tagged Letter pages: panels 1-4 and the signs, then panels 5-8, the accessories to bring back and a one-line source note. Titles only. E20 slots 3, 4, 7 and 8 show "manual needed" cards. Still no Cat guide (no drawable panel) |
| Gallery | Per machine: photo or "photo pending" card with number chips, large panels with titles, signs, accessories and document icons, one status mark each and one legend. Records, sources, page text (as a phone preview), manual pages and retouch crops are collapsed. Visible words: 6,369 before, 266 after |
| Page text | Quick start: one line per panel, 10 words or fewer. Safety: one line per sign, plus the 35SA weight limit and the E20 swing and slope rules (its quick start stays BLOCKED, so they must stay publishable). At most 4 lines of fuel, troubleshooting and return text. The 14LP keeps its tire and loading checks as two unnumbered lines, since no panel covers them. Changed fields are REVIEW_REQUIRED; headlines and emergency text unchanged |
| Records | The e20-p2 caption no longer says "Report anything" (not in its source). The 35SA speed limit moved from panel 8 to its own sign |
| Schema 1.2.0 | Additive: panel `frames`, model `signs` and `accessory_icons` ([contract note](ONBOARDING_DATA_CONTRACT.md)) |

### Status after the rework

| Asset | Model key | Items (ready / review / blocked) | Page fields | Panels drawn | Signs | Guide |
|---|---|---|---|---|---|---|
| EXCAVATOR-017 | `bobcat.e20.b3bl-canopy` | 1 / 24 / 9 | 2 / 3 / 2 | 4 of 8 | 6 | PDF (draft), 204 KB |
| EXCAVATOR-3015 | `cat.301-5.canopy` | 11 / 3 / 16 | 6 / 0 / 1 | 0 of 8 | 3 | none |
| TRAILER-014 | `bigtex.35sa.12` | 13 / 28 / 2 | 3 / 4 / 0 | 8 of 8 | 5 | PDF (draft), 356 KB |
| TRAILER-2041 | `bigtex.14lp.14` | 12 / 41 / 5 | 2 / 5 / 0 | 8 of 8 | 10 | PDF (draft), 418 KB |

Signs count as items, so the review counts went up. Import manifests: `apply.allowed` is still false for all four.

### Checks

| Check | Result |
|---|---|
| New tests (`text-policy.test.mjs`; `packs.test.mjs`, `content-pack.test.mjs` extended) | No words in any drawing; every drawn number found in its source; title and sign-label limits; alt text equals the frames; nothing drawn from a BLOCKED item; signs match the drawing registry; accessories traced; visible-word caps (gallery at most 90 per machine and 320 in all, each guide at most 100); SVG safety, labelling and contrast extended to the signs; tagged PDFs |
| `npm.cmd run lint`, `npm.cmd run typecheck` | Pass |
| `npm.cmd test` | 206 files, 2,393 tests passed |
| `npm.cmd run build` | Compiled successfully |
| Repeatability | A second `phase-e:packs:build` left all 168 pack files byte-identical |
| By eye | Contact sheets of all panels and signs at 360 px; every page of the three guides; the gallery at 390 px and 1280 px wide (no sideways scroll) |

Two more dump-manual pages (PDF pages 6 and 63) were rendered into the vault for the private gallery's sign records. Local work only: no Supabase project, no `/t/` URL, nothing published, Northridge unchanged.

### Tracked files (rework)

- New: `scripts/phase-e/packs/text-policy.mjs` (with tests), `pictogram-signs.mjs`, `guide-layout.mjs`
- Changed: `pictogram-kit.mjs`, `pictogram-panels.mjs`, `guide-build.mjs`, `pack-review.mjs`, `packs.test.mjs`, `scripts/lib/content-pack.mjs` (with tests), the schema, the four packs and everything generated from them
- Docs: this log, `PHASE_E_PLAN.md`, `ONBOARDING_DATA_CONTRACT.md`, `packs/README.md`

### Open, operator-pending

Everything in the E2A list above still applies, plus: **review the redrawn panels, the 24 signs and the shortened page text** in the gallery and the three guides.

### Next command

**Prompt E2B** (the 105-day synthetic dataset), started in plan mode **only when the operator runs it**; never automatically. It starts with the drift check above, which E2A did not need. After any change to a pack, the register or the drawings, run this from the project folder:

```
npm.cmd run phase-e:packs:build
```

## E2B — coherent showcase history and repeatable sales scenarios (2026-10-20/21)

A coherent, synthetic 105-day rental history for the four showcase assets: built, rehearsed on the local stack and staging, and dry-run against Production (reads only). The stories are in [SHOWCASE_STORIES.md](SHOWCASE_STORIES.md), the results in [E2B_REHEARSAL_REPORT.md](E2B_REHEARSAL_REPORT.md), and the cutover in [E2C_CUTOVER_PACKAGE.md](E2C_CUTOVER_PACKAGE.md).

### Approvals and operator decisions

| When | What | How |
|---|---|---|
| 2026-10-19 | Read-only Production catalog check before E2B (runbook §6): `21 \| none \| pg_cron not installed`, as expected | Operator, SQL editor |
| 2026-10-20 | E2B plan approved | Plan mode, ExitPlanMode |
| 2026-10-20 | Staging is written through a database URL the operator adds (`PHASE_E_STAGING_DB_URL`) | Answer |
| 2026-10-20 | Staff are fictional names only, with no accounts | Answer |
| 2026-10-20 | Evidence images: the licensed E20 and Cat photos tagged "Illustrative photo" for routine excavator photos; original drawings tagged "Illustration" for the trailer photos and the key incidents; other incidents without a photo; minimal labels, only where required | Answer |
| 2026-10-20 | The analytics "repeated reports" quirk goes in the presenter notes now and gets a separate fix | Answer |

### Drift check (E1 → 2026-10-20 15:50Z, read-only audit)

All rows unchanged except the append-only tables:
- scans 3,190 → **3,202** (visitors);
- digest runs 35 → **39** (the daily runs, last window ending 2026-10-20 13:00 UTC).

Scans on the four showcase assets: 017 948, 3015 792, 014 60, 2041 828 (mostly June and July testing; an E2C decision).

### What was built

| Part | Files |
|---|---|
| Scenario (authored) | `docs/phase-e/showcase/scenario.json`: seed, anchor, fictional renters and staff, per-model use patterns and rates, curated incidents |
| Evidence media (written once, hashed) | `docs/phase-e/showcase/media/` (11 WebP), `media.json`, `MEDIA_NOTICE.md`; `scripts/phase-e/showcase/make-media.mjs`, `evidence-drawings.mjs` |
| Builder | `scripts/phase-e/showcase/build-dataset.ts` (the app's own inspection, triage, acknowledgement and scan code), `build.showcase.ts`, `build.mjs`, `vitest.showcase-build.config.ts`; `npm run phase-e:showcase:build` |
| Dataset (generated, tracked) | `docs/phase-e/showcase/dataset.json`: every row, frozen template snapshots, the evidence objects, pinned ids |
| Planner | `scripts/lib/showcase-reset.mjs`: the dataset kinds `showcase`, `presenter` and `refresh`, with bounded changes, exact removals, appended scans and the new refusals. `scripts/lib/showcase-compose.mjs`, `showcase-dataset.mjs`. `tenant-snapshot.mjs` gains an exact-count check |
| Staging guard | `scripts/lib/showcase-target.mjs`, recognised by `qa-guard-coverage` |
| CLI | `scripts/phase-e/showcase-reset.mjs`: the new kinds, `--remove`, `--approved-plan`, `--dataset`, `--scans`, and the staging apply. Production applies are refused before any connection |
| Bootstrap and check | `scripts/phase-e/showcase-bootstrap.mjs` (local and staging only), `showcase-staging-check.mjs` (read-only) |
| Owner report | `lib/owner/org-activity.ts`; `app/(platform)/owner/analytics/page.tsx` labels demo organizations and uses exact counts (it undercounted past 1,000 rows) |
| Rehearsals | `tests/phase-e-showcase-local/` (`npm run test:phase-e-showcase-local`); `tests/phase-e-showcase-walkthrough/` and `playwright.phase-e-showcase.config.ts` (`npm run test:phase-e-showcase-walkthrough`) |

### Dataset

- Anchor **2026-10-20 06:00 America/Vancouver** (the rehearsal anchor; E2C rebuilds it for the cutover date).
- 92 rentals (90 completed, 017 and 2041 on rent): 64 outbound inspections, 77 staff returns, 18 renter returns, 55 acknowledgements, 12 damage reports, 8 support requests, 700 scans, 226 evidence files.
- At the anchor: 3 items `new`, 2 `reviewed`.
- SHA-256 hashes:
  - `scenario.json` `3a17569de110b983b0ec15486d29d20984c9d471aecab843c2f8d2ef3c92c49d`;
  - `dataset.json` `92f58bce59d7cc09d08db900339d99881ba894aea3c232ca93fce4ec4155aea9`;
  - `media.json` `cb73df94dfa95fda2fa8386b9423a3f19189c350886fabab1d179bdb2e0021f7`.

### What ran

| Step | Target | Result |
|---|---|---|
| `phase-e:showcase:media`, `phase-e:showcase:build` | Repository files | 11 images, the dataset |
| `test:phase-e-showcase-local` | Local stack | **13/13** |
| `test:phase-e-local` (E1) | Local stack | **34/34** |
| `test:phase-e-showcase-walkthrough` | Local stack, the real app | **6/6** |
| Production dry run (`showcase-production-e2b-dryrun-20261020`) | Production, reads only | **ACCEPTED**; summary in `docs/phase-e/archives/` |
| Staging rehearsal (bootstrap, plan, `--fail-at`, apply, converge, no-op, presenter dry run, read-only checks) | Staging, guarded database URL | **Applied and converged**: 183 statements, all 15 checks passed, including the scan-free `/nojs/t/` view of the four codes on the branch Preview |

### Findings

- **Fixed in E2B:**
  - The planner could not converge after it removed append-only rows (the re-plan counted them as missing). Intended removals are now exempt, with a regression test.
  - The owner report undercounted organizations past one PostgREST page (1,000 rows). It now uses exact counts.
  - Hosted snapshots could be truncated by a server row cap without notice. Exact counts are now checked.
  - The rental evidence page printed a meter difference as a raw float ("+10.700000000000045 hours"). It is now shown at the readings' own precision, with a unit test (`lib/inspections/session-comparison.ts`).
- **Known app behaviour, for presenters** ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md)): "repeated reports" on every showcase machine, "came with photos" counting every record, "Difference recorded" for hours and fuel, and recommended photos reported missing.
- **Production test scans:** about 2,628 pre-cutover test scans on the four assets would swamp the 90-day analytics. That is an E2C decision.

### Gates (2026-10-20)

| Check | Result |
|---|---|
| `npm.cmd run lint`, `npm.cmd run typecheck` | Pass |
| `npm.cmd test` | 211 files, 2,430 tests passed |
| `npm.cmd run build` | Compiled successfully |

### Operator decisions after the E2B close

| When | What | How |
|---|---|---|
| 2026-11-02 | The pre-cutover test scans on the four assets are removed at the cutover | Operator chat |
| 2026-11-02 | The redrawn imagery (panels, signs, Start-Up Guides) is parked as an open item to come back to later. It stays off Production | Operator chat |
| 2026-11-02 | Big Tex gave permission to use any of its images. The reply is not yet in the source vault | Operator chat |
| 2026-11-03 | Big Tex's reply: photos and materials from its website may be used, credited to "Big Tex Trailer Manufacturing, LLC" where practical; higher-resolution versions on request. It does not answer the hoist-manual or torque questions. Text saved in the source vault | Operator chat (email pasted) |
| 2026-11-03 | Bobcat's E20 manual not bought. Proceed without it and come back to it later | Operator chat |
| 2026-11-03 | Page text in [E2C_PAGE_TEXT_REVIEW.md](E2C_PAGE_TEXT_REVIEW.md) approved as worded; tweaks may come later | Operator chat |
| 2026-11-03 | Anchor date D = 2026-11-03 | Operator chat |
| 2026-11-03 | Production apply mode: a database URL with a Production guard | Operator chat |
| 2026-11-03 | Northridge's logo is cleared at the cutover until owned artwork exists | Operator chat |

Findings the same day, recorded in [E2C_CUTOVER_PACKAGE.md](E2C_CUTOVER_PACKAGE.md):
- **Organization settings:** the package left out the real dealer's logo, the undialable support phone and the old "Powered by" label (decision 7).
- **Time zone:** in data 2026b, `America/Vancouver` stays on UTC-7 all year. A test build for 2026-11-10 passed the time rules; its output stayed outside the repository and the tracked dataset was not touched.
- **Scan removal:** `--scans=remove-showcase` has only a unit test, so E2C rehearses it on staging first.

On 2026-11-03 a test build for the chosen anchor passed the same time rules. Its output again stayed outside the repository.

### Open, operator-pending

- The support phone and the "Powered by" label (decision 7 in [E2C_CUTOVER_PACKAGE.md](E2C_CUTOVER_PACKAGE.md)). The E2C plan carries the recommendations for approval.
- Before any E2C approval: the business-card evidence, the printed-sheet answer and a second verified archive copy on a USB drive or external disk.
- **Later, not blocking E2C:**
  - the parked imagery (panels, signs, Start-Up Guides);
  - Bobcat's E20 manual;
  - Big Tex's answers on the hoist manual and torque;
  - a new Northridge logo;
  - page-text tweaks.
- A look at the evidence drawings, which are replaceable ([showcase/MEDIA_NOTICE.md](showcase/MEDIA_NOTICE.md)).

### Next command

**Prompt E2C**, only when the operator runs it; never automatically. Before the cutover, rebuild the dataset for the chosen anchor date:

```
npm run phase-e:showcase:build -- --anchor=2026-11-03
```

## E2C — release the curated Northridge showcase (2026-11-03 to 2026-11-23, done)

The operator pasted Prompt E2C on 2026-11-03. Plan approved the same day in plan mode: four stages with one hard stop, the approval packet.

### Approvals and operator decisions

| When | What | How |
|---|---|---|
| 2026-11-03 | E2C plan approved. It includes the Big Tex downloads, the staging push of migrations 0040 and 0041, and the Production DB-URL guard | Plan mode, ExitPlanMode |
| 2026-11-03 | TRAILER-2041's page is "Dump Trailer 2041" (the card's title line says "UTILITY TRAILER 204"; its code line matches) | Operator answer |
| 2026-11-03 | Present with the existing private Northridge demo login | Operator answer |
| 2026-11-03 | Keep the support phone as it is | Operator answer |

### Evidence (before any Production write)

| What | Result |
|---|---|
| Business cards | Printer's proof #000115318 (four backs) decoded locally: the four protected routes, V4-H, matrices identical to the website register ([PROTECTED_DEMO_ROUTES.md](PROTECTED_DEMO_ROUTES.md)) |
| Printed sheets | The 2026-07-20 sheet was used only by the operator for testing; nothing else was printed |
| Second archive copy | The E1 package `northridge-production-20261017T003411Z` copied to `D:\Mulemark-Ops-Archive\` and verified: `OK (manifest b1c781684c736465…)`, matching the recorded hash |
| Time zone | `America/Vancouver` stays on UTC-7 in tz data 2026b, so the anchor is 13:00 UTC |

### Built (stage 1)

**Content:**
- **Packs** (schema 1.3.0):
  - the operator's page-text approval;
  - parked Start-Up Guides (`release: parked`, never imported);
  - the E20 handover wording (`pol-e20-handover`);
  - approved blanks for E20 fuel and Cat safety;
  - an `approval` record whose content version the import manifests check.
  All four import manifests are `apply.allowed`.
- **Big Tex photos:** 10 downloaded into the vault, hashed, with the reply text saved.
  - **Covers:** both trailers, on a white 16:9 canvas with the credit baked in (`photo-derivatives.mjs`, recipes `35sa-bigtex` and `14lp-bigtex`).
  - **Evidence:** four photos replace the trailer hitch and deck drawings (`make-media.mjs`), tagged "Illustrative photo · Photo: Big Tex Trailer Manufacturing, LLC".
- **History:** rebuilt for the 2026-11-03 anchor; the scenario's anchor moved with it.

**Reset tool:**
- **Production apply path** (`showcase-target.mjs` `productionDbConfig`, `assertProductionDatabase`): the hosted apply kinds are showcase, presenter, refresh and restore, always with `--approved-plan`.
  - The cutover and a rollback need Northridge suspended.
  - The cutover needs approved E2A content.
  - `--fail-at` is refused on Production.
- **Organization settings at the cutover:** logo cleared; the stored "Powered by" label corrected.
- **Rollback reinstatement:** a rollback now puts back the old scans a cutover removed (`reinstate`). The first local rehearsal of scan removal found that the rollback did not.

**App:**
- **Demo notice:** on the scan page and the forms, decided by the Demo plan (`plan_key = 'demo'`, owner-only) through `is_demo_organization` (0041). No organization id appears in any component; `DEMO_ORGANIZATION_IDS` is retired.
- **QR guard:** owner-only disable of a production-primary QR link (0040), with the action's message and the button hidden.
- **Release check:** `/api/version` returns the deployment's commit and environment.
- **Pre-call tool:** `phase-e:precall:{production,staging}`.
- **Housekeeping:** `*.crt` is now gitignored.

### Gates (local)

| Gate | Result |
|---|---|
| Lint, typecheck | Pass |
| `npm test` | 213 files, 2,448 tests passed |
| `test:security` (local stack, 0001–0041) | 11 files, 132 tests passed. The new persona tests: admin and staff refused 42501, owner and server allowed; `is_demo_organization` for anon follows the Demo plan of an active organization only; only the owner can set the plan |
| `test:phase-e-showcase-local` | 13/13: stand-in old scans removed by exact id, the organization's 2 settings, guides not imported, the rollback restores the scans and the settings |
| `test:phase-e-local` (E1) | 34/34 |
| Walkthrough | 7/7. The owner sets the Demo plan in the owner UI; the four scan pages and three forms show the demo notice and no guide; axe (WCAG 2.1 A/AA) found **no violations** on those seven pages |

Stage 1 commit: `af8a34a` (pushed; Preview only).

### Staging rehearsal (2026-11-03/04, guarded staging URL)

| Step | Result |
|---|---|
| Rollback with the E1 staging package (`northridge-staging-20261017T003019Z`) | **REFUSED**, correctly: the package predates the E2B bootstrap, so restoring it would change protected QR rows and leave TRAILER-2041 pointing at a deleted rental |
| Fix 1: archives across function-only migrations | `tenant-graph.mjs` `compatibleGraphShas`: archives taken before 0040/0041 (graph `f90f1d97…`) stay restorable. A test proves the old hash is reproduced exactly; any table change breaks it |
| Fix 2: rollback removes the cutover's rows | `restoreDesired` also removes the cutover's inserted rows when the archive already holds them (an archive taken after the cutover). A pre-cutover archive, as on Production, never holds them |
| New rollback point | The two showcase rental pointers cleared (rehearsal setup), then a fresh staging archive `northridge-staging-20261104T005255Z` (verified, manifest `2b21ebd1…`) |
| Rollback on a hosted target (first time) | Plan ACCEPTED (removes 92 rentals, 179 submissions, 55 acknowledgements, 700 scans and the 8 E2B documents; keeps machines, pages and QR rows); applied in one transaction, CONVERGED |
| Bootstrap | 0 changes |
| Stand-in old scans | 4 labelled rows, one per showcase machine (`phase-e-e2c-staging-rehearsal (stand-in old test scan)`) |
| E2C cutover plan | ACCEPTED. History in (92 / 179 / 55 / 700); the 4 stand-in scans removed by exact id; 5 documents (no guides); 3 assets and 3 pages updated; the organization's 2 settings; 230 files to stage |
| `--fail-at=writes` | Stopped and rolled back. The files were staged first (230 present afterwards; nothing overwritten) |
| Apply | One transaction, 181 guarded statements, CONVERGED |
| Demo plan | Set as the staging platform owner (plan fields are owner-only) |
| No-op plan | ACCEPTED, all KEEP |
| `phase-e:precall:staging` before the staging migrations | Data, covers, documents, history, curated items and the four routes PASS. The demo notice failed, as expected until 0041 is on staging. The Bobcat store link did not answer an automated request (note; opens by hand) |

### Production reads (2026-11-04, read-only)

| Read | Result |
|---|---|
| Drift audit | Unchanged since E2B except visitor scans (3,202 → 3,248) and digest runs (39 → 53). Scans on the four machines: 974 / 797 / 66 / 837 = **2,674** |
| Fresh archive | `northridge-production-20261104T010914Z`, verified (manifest `46c68b3a67bafb3ece4a9525346632a1f8c8fed143876be91fcb8d7019670b72`). 17 tables (3,248 scans, 49 submissions, 53 ledger rows); 53 objects, 23,107,566 bytes; 7 missing references (the E0 seven) |
| Restore proof | Standalone loopback container: **VERIFIED**. 80 integrity checks passed, 17 tables hash-identical, 12 routes checked under anon RLS with 0 mismatches, 53 objects hash-verified. The container was removed afterwards |
| USB copy | `D:\Mulemark-Ops-Archive\northridge-production-20261104T010914Z` verified, same manifest |
| Cutover dry run | **ACCEPTED** (`showcase-production-20261104T011054Z`). The counts are in the approval packet. Digest watermark: last success 2026-11-03 13:00 UTC = the anchor (so the server's time zone agrees: UTC-7) |

### Marketing (prepared, not pushed)

`docs/phase-e/packs/marketing/e2c-showcase-marketing.patch` (A + B + C; SHA-256 `1145a511…`). It applies cleanly to `57747c3`; the site's `check` and `build` pass; the QR and tag files are unchanged ([MARKETING_CONSISTENCY_REPORT.md](MARKETING_CONSISTENCY_REPORT.md)).

### Follow-up commit (stage 1b)

- **What's in it:** the two rollback fixes found on staging (`compatibleGraphShas`; `restoreDesired`), the restore tool's use of them, the marketing patch and report, and the six counts-only archive and plan summaries above.
- **QA-guard exemption:** `lib/tenant-graph.mjs` is now exempt in `qa-guard-coverage`. Its only `.update(` call feeds a SHA-256 hash; it makes no write and no request.
- **Gates:** lint and typecheck pass; `npm test` 213 files, 2,450 tests passed; `test:phase-e-showcase-local` 13/13 and `test:phase-e-local` 34/34, both re-run after the restore change.

### Keyboard and touch targets (Gate A)

The walkthrough now measures what axe can't see on the four scan pages and three forms: `keyboardAndTargets` in `tests/phase-e-showcase-walkthrough/stories.spec.ts`, with results in `qa-artifacts/phase-e-showcase/keyboard-targets.json`.
- **Keyboard (asserted): all 7 pages pass.** Tab reaches every control in page order, counting a radio group once, and each focused control visibly changes on screen (pixel comparison with the unfocused page).
- **Touch targets (44 px design rule; recorded, not asserted):** shortfalls on every tenant's public pages, all from before Phase E.
  - **Scan pages:** the documents' "Open" links 35 × 20; "Call" and "Email" 24 px tall; "Staff member? Sign in" 16 px tall.
  - **Support and damage forms:** the name, email and phone fields 38 px; the contact select 39 px; the submit button 36 px.
  - **Return form:** the engine-hours field 38 px.

  Not fixed in E2C, because the fix changes every customer's pages. A CSS-only follow-up is offered as a separate task; it is listed in the approval packet's known limitations.
- **Run:** walkthrough 7/7 (2.1 min); axe found no violations on the 7 pages.

### Staging migrations and verification (2026-11-04)

The operator pushed 0040 and 0041 to staging with the CLI:
- the link check passed (`kwserenxwjxozztyigmw`, non-production);
- the dry run listed only those two;
- `migration list` shows 0001–0041 on both sides.

| Check (against `8f6c514`) | Result |
|---|---|
| Preview `/api/version` | `8f6c5147704c8fbd7bfb6a157821faaedd8d54a0`, environment `preview` |
| Demo flag (0041), anon RPC | `is_demo_organization(Northridge)` = `true` |
| `phase-e:precall:staging` | **Ready:** 42 PASS, 0 FAIL, 2 notes. The demo notice now shows on all four `/nojs/t/` pages. Note 1: Bobcat's store link refused the scripted HEAD request, but opens in a browser (checked by hand: the E20 manual's product page, 7255004ENUSPDF). Note 2: 0 visitor rows since the anchor |
| `smoke:staging` | 29 checks: 28 pass, 0 fail, 1 skipped (the email dry-run log can't be seen from a browser) |

- **Commits pushed:** `1a622b8` (stage 1b) and `8f6c514` (the walkthrough measurement). **`8f6c514` is the commit to promote.** Nothing is pushed after it until the promotion.
- **Tap-target follow-up:** a separate session is working on it in this same checkout. Its edits to six public components and the walkthrough stay uncommitted until after the promotion. They are not part of this release.
- **Stop:** the approval packet ([E2C_APPROVAL_PACKET.md](E2C_APPROVAL_PACKET.md)) went to the operator for item-by-item approval. Nothing has run on Production.

### Status check (2026-11-18, read-only, before approval)

Two weeks after the packet. Nothing has run on Production.
- **Production app:**
  - `mulemark.io/api/version` and `qr-asset-tags.vercel.app/api/version` both return 404. That route exists only from `8f6c514` on, so Production still serves the old app (`93fe39b`).
  - A note from 2026-11-17 says `8f6c514` had been promoted. That promotion didn't take effect, so it is still item 2.
- **Production health:** `phase-e:health:production` 5/5 (scan-free).
- **Drift** (`phase-e:audit:production`, read-only): unchanged since 2026-11-04 except scans and digest runs.
  - Scans on the four machines: 988 / 804 / 72 / 842 = **2,706**, 32 more than at the dry run.
  - All scans: 3,280. Digest runs: 68.
- **Staging Preview:** still serves `8f6c5147…`; the branch hasn't moved.
- **Marketing:** `main` is still `57747c3`, so the patch applies as prepared.
- **USB:** `D:\Mulemark-Ops-Archive` present.
- **History anchor:** 2026-11-03 is now 15 days old, and the pre-call check flags anchors over 7 days old (DEMO_REFRESH_POLICY.md).
  - Proposed to the operator with the packet refresher: rebuild the dataset on the cutover day, anchored at that day's 13:00 UTC, following the operator's "apply from today's date".
  - Same records and counts; the dates and hashes change.

### Approval (2026-11-20)

The operator approved the packet item by item on 2026-11-20 (22:28 UTC): **"Approve 1–6 as revised, include later scans, caption OK"**. The revisions follow the operator's wish not to run pushes or deletions themselves unless necessary.

| Item | Who | As revised |
|---|---|---|
| 1. Production migrations | Me | The project's CLI with `--db-url` from `.env.production-db.local`. No relink: the CLI stays linked to staging |
| 2. Promotion | Operator | Vercel → Promote to Production, on the Preview of `8f6c514` |
| 3. Deletions | Me | In the one transaction. **Include later scans:** scans on the four machines after the dry run, up to the suspension, are removed too. Any other difference stops the run |
| 4. Publication | Me | The same transaction, after staging the files. The operator does the owner switches: suspend first; at the end, the Demo plan and reactivate |
| 5. Marketing | Me | Apply the patch, commit as the operator, push `main`. The caption "On the tongue rail" is approved |
| 6. Live-review email | Operator | The two test forms notify `support@mulemark.io`. Afterwards a presenter reset removes the two submissions by exact id |

- **History anchor moved to 2026-11-20** 06:00 Vancouver (13:00 UTC), the planned cutover day, following "apply from today's date".
  - The rebuilt dataset: SHA-256 `b8c7c60b…`, 983,866 bytes, with the same 92 / 179 / 55 / 700 rows.
  - The curated straps case moved to `SUB-2026-66A6B7` ([SHOWCASE_STORIES.md](SHOWCASE_STORIES.md)).
  - `npm test`: 213 files, 2,450 tests passed.
- **Local suites not re-run:** the local database could not start.
  - Windows reserves the port range 54318–54417, which includes the local Supabase database port 54322. Restarting the `winnat` service as administrator frees it.
  - The local suites last passed on 2026-11-04 with the same tools. This change is data only, and its tests pass.

### Production database URL (2026-11-20)

- **The file:** `.env.production-db.local` in the project folder, gitignored by `.env*`. The operator pasted the session-pooler string into it.
- **First string:** it did not parse.
  - Special characters in the password broke the address, and the guard's error named the parsed "host", which was a few password characters.
  - My check scripts now redact that echo. The operator percent-encoded the characters; the password itself was not changed.
- **Follow-up:** redact the host in `productionDbConfig`'s error (`scripts/lib/showcase-target.mjs`).
- **Read-only identity check:** session pooler on port 5432, TLS verified against `prod-ca-2021.crt`; the staging probe absent; the four protected QR rows exactly as tracked; the 21-trigger catalog.

### Dry run (2026-11-20 22:36 UTC)

`showcase-production-20261120T223626Z`: **ACCEPTED**. The same changes as on 2026-11-04 (packet §4), with three differences:
- **Scans removed:** 2,710, because of visitor scans since 11-04.
- **Files to stage:** 228, not 230. The re-anchored history has 224 evidence images.
- **Digest ledger:** 70 rows, all kept.

Watermark: the last digest success was 2026-11-20 13:00 UTC, equal to the new anchor.

### Production migrations (item 1, 2026-11-21 06:34 UTC)

- **How:** the project's own CLI, with the guarded URL passed as `--db-url` and redacted from all output. No relink.
  - The dry run listed only `0040_qr_primary_disable_guard.sql` and `0041_demo_organization_flag.sql`, with the packet's hashes.
  - Pushed. `migration list` shows 0001–0041 on both sides.
- **Checks:**
  - `is_demo_organization` is present; for Northridge, anon gets `false` (not on the Demo plan yet);
  - still 21 triggers;
  - the identity checks pass.

### Promotion (item 2, 2026-11-21)

The operator promoted the Preview of `8f6c514` (about 07:07 UTC).
- **Version:** `mulemark.io/api/version` and `qr-asset-tags.vercel.app/api/version` both return `{"commit":"8f6c5147704c8fbd7bfb6a157821faaedd8d54a0","environment":"production"}`.
- **`smoke:production`:** 14 checks, 13 pass, 0 fail, 1 skipped (the check that writes a scan, deliberately not run).
- **`phase-e:health:production`:** 5/5.

### Cutover (2026-11-23)

| UTC | Step | Result |
|---|---|---|
| 16:26 | Operator suspends Northridge | |
| 16:28 | **Fresh archive** (the rollback point) | `northridge-production-20261123T162851Z`, verified, manifest `4a11e57ad54a51af742ad95f3fa9582beb2572e8685cce14776d1cd88ca816ed`. 17 tables (3,289 scans, 49 submissions, 73 digest-ledger rows); 53 objects, 23,107,566 bytes; 7 missing references (the E0 seven) |
| 16:30 | **Final delta** from the suspended snapshot | `showcase-production-20261123T163011Z`: **ACCEPTED**. Identical to the 11-20 dry run except **5 more scans** on the four machines (2,715 removed), which "include later scans" covers, and 73 digest-ledger rows kept. The SQL has the same shape as on 11-20: one transaction, triggers on, the organization row locked, 315 guards and post-checks, and no DDL except the 3 temporary snapshot tables |
| 16:35 | Dataset committed | `eec17a3`. Its blob hashes to the approved `b8c7c60b…` |
| 16:35 | **Finding, fixed:** the Production apply would not have staged the files | See below. Fixed in `1b394fb` |
| 16:44 | **USB copy** | `D:\Mulemark Backup\`, on a different USB drive from the one holding `D:\Mulemark-Ops-Archive`. The package verified OK (same manifest). This run's manifest, plan and SQL were copied too, with equal hashes |
| 16:45–16:48 | **Apply** | One transaction, 196 guarded statements, counts as planned. Storage: 228 files uploaded, 0 already present. Re-plan after commit: **CONVERGED** |
| 16:53 | Operator: Demo plan, then reactivate | Northridge active, on `plan_key = demo`. **Offline 27 minutes** (16:26–16:53) |

**The staging finding:**
- **What was wrong:** the apply staged Storage objects only on the local stack and staging. That `canStage` check dates from E2B, when Production applies were refused.
- **Effect if run as it was:** none of the 228 files were on Production, so the rows would have pointed at missing covers and evidence.
- **Fix (`1b394fb`):** Production stages the files too, the same way as staging: only missing files are uploaded, nothing is overwritten, and each one is read back and checked by hash.
- **Checks:** lint and the scripts' tests (325) pass.

**Applied counts:**
- **Updated:** the organization 1, assets 7, equipment pages 4, documents 5, rentals 3.
- **Inserted:** documents 5, rentals 92, acknowledgements 55, submissions 179, scans 700.
- **Deleted:** rentals 14, acknowledgements 10, submissions 49, scans 2,715.
- **Untouched:** QR rows, profiles, tag requests, the page template and the digest ledger.

| File (outside Git, `%USERPROFILE%\Mulemark-Ops-Archive\e2c\`) | SHA-256 |
|---|---|
| Manifest `showcase-production-e2c-20261123-final.json` | `ac21edfccead62b38f643399791891287740b5ed225a74726e3c481769adb166` |
| Plan (the `--approved-plan`) | `3db652152cc8ed00281c06a61f01ddb8bf8f71506d6addedbb14436ee92d524e` |
| SQL (2,258,948 bytes) | `d53699ce3299da42ef4786ec256b9c0cdccdea9447cf191f68974c5e537a241b` |

### Verification (2026-11-23, after reactivation)

| Check | Result |
|---|---|
| No-op plan | `noop-production-20261123T165444Z`: ACCEPTED, all KEEP. 1,274 scans: 574 kept and the 700 of the history |
| QR rows | All 12 identical, column for column, to the pre-cutover archive, before and after the reactivation |
| Demo flag | Anon `is_demo_organization(Northridge)` returns `true`. Northridge is `active` on the `demo` plan |
| Identity | Staging probe absent; the 4 protected QR rows exactly as tracked; 21 triggers |
| `phase-e:health:production` | 5/5 on `mulemark.io` and on `qr-asset-tags.vercel.app`. On the alias host, the conditional `7gzt4aqc` (WSHR-001) still shows the unavailable notice: unchanged since 2026-07-13, and closed on 2026-10-17 |
| `phase-e:precall:production` | **Ready**, with 2 notes. The four pages resolve and show the demo notice; the covers answer 200; the manual links answer, except that Bobcat's store refuses the scripted request (known). All 92 / 55 / 179 / 700 history rows are present; the curated rentals are on rent; 3 new and 2 reviewed items; anchor 3 days old; 0 visitor rows since the anchor |
| Audit | Matches the showcase: logo none; support phone not dialable. Scans on the four machines 225 / 195 / 160 / 120; rentals 25 / 20 / 30 / 17. Artifact `qa-artifacts/phase-e/showcase-audit-production-northridge-20261123T165513Z.json` (not committed) |

### Marketing (item 5, 2026-11-23)

| UTC | Step | Result |
|---|---|---|
| 16:56 | Pushed the approved patch to `jdapaetz2/Getmulemark.com` `main` as `5e9e068` | Vercel **blocked** the deployment. The commit's author email (the app repository's identity) isn't the email of the GitHub account the Vercel project is linked to ("GitHub user not found"). The operator found it in Vercel |
| 19:07 | Re-authored the same commit with the account's email (`--amend --reset-author`, the same tree) and pushed with a lease on `5e9e068` | `main` = **`0a4fcae`** |
| 19:08 | Vercel deployed it | Live on getmulemark.com about 40 s after the push |
| 19:13 | Live check, scan-free (no `/t/` request) | **24 of 24 pass** |
| 20:59 | On the operator's "replace it", replaced `0a4fcae` with the same commit in LF line endings (Line endings, below), pushed with a lease on `0a4fcae` | `main` = **`2c54323`** |
| 21:00 | Vercel deployed it | Live about 30 s after the push. The five served files that had carried CR bytes now carry none, each smaller by exactly its CR count |
| 21:00 | Live check, scan-free | **24 of 24 pass** |

- **What the live check covers:**
  - `/demo` names the four models;
  - `/equipment-tags` card 02 shows the Big Tex 35SA photo with "On the tongue rail", and no Twister photo or landing-leg caption;
  - `/credits` credits Big Tex Trailer Manufacturing, LLC and no longer credits the replaced photos;
  - the home page's E20 scene renders `assets/photos/bobcat-e20.jpg`. The build publishes the retouched source under that stable name: the live file is byte-identical to `artwork/photos/bobcat-e20-modified.jpg` (SHA-256 `3aa71945…`). The home page has no Wikimedia link left.
- **Unchanged:**
  - the QR and tag artwork (empty diff);
  - every link and `/t/` target on `/` and `/demo`.

  On `/equipment-tags` the only link change is the trailer photo's source: Twister on Wikimedia became Big Tex's own image.
- **Timing:** the site trailed the app by 2 h 15 min (16:53 → 19:08 UTC) instead of minutes, because of the blocked deployment.
- **Line endings (fixed at 20:59):** `0a4fcae` was the approved patch `1145a511…`, except that 13 of its text files were committed with CRLF line endings, while the repository uses LF. The commit showed 1,130 changed lines; the patch adds 100 and removes 89.
  - The operator approved replacing it ("replace it").
  - **`2c54323`:** the tree `3b7233c5…`, re-checked by applying the patch file to `57747c3` again. It has the same parent, message, author and author date, and no CR bytes. Against `0a4fcae`, only those 13 files differ, and only by CR bytes.
- **Identity:** commits in the marketing repository use the email of the GitHub account linked to Vercel. The app repository keeps its own identity; its deployments build.

### Live review (2026-11-23)

The operator, on a phone with the printed cards, after the reactivation:
- **Cards:** all four scanned, and each scan resolved to its machine.
  - 10 scans, all through the QR codes on a mobile device, 17:02–18:41 UTC: EXCAVATOR-017 ×3, EXCAVATOR-3015 ×2, TRAILER-014 ×3, TRAILER-2041 ×2.
  - They are kept, as checks rather than adoption:

  | UTC | Machine | Scan id |
  |---|---|---|
  | 17:02:29 | EXCAVATOR-017 | `9a44f2bd-b18e-47b6-8de5-7144fd82a928` |
  | 17:15:00 | TRAILER-2041 | `31d86d61-97ef-4ab7-abf0-d37031fedf82` |
  | 17:24:05 | EXCAVATOR-3015 | `72773b28-dda4-4470-9e3d-5ca64fc05446` |
  | 17:32:01 | TRAILER-014 | `20292ac3-22a5-4aba-b2f6-c4f403e1de2a` |
  | 18:38:03 | TRAILER-2041 | `f3ff50b9-1b83-4672-bd3b-cd09f77741ca` |
  | 18:38:27 | TRAILER-014 | `2a6a0c4d-c243-4a43-9142-4b8550504e6c` |
  | 18:38:41 | EXCAVATOR-3015 | `d4578403-e948-4be7-9897-4b5b798e753e` |
  | 18:38:55 | EXCAVATOR-017 | `15cddd84-72fa-4e7e-9ab2-1732f777b08e` |
  | 18:39:37 | EXCAVATOR-017 | `315b1a67-c2d5-449a-9361-bea135543ebd` |
  | 18:41:52 | TRAILER-014 | `8a8b92c4-927d-4695-9af8-4b5f518b7167` |
- **Support request** on TRAILER-014: `SUB-2026-502416`, 18:42:35 UTC, no photo.
  - Its notification went to `support@mulemark.io` (item 6).
  - By the reset it was marked resolved, so it had been handled in the dashboard with the presenter login.
- **Not done: the damage report with a photo.** The operator skipped it, judging that it runs on the same systems as the support request. So one of the two approved emails was sent.
- **Acknowledgements and rentals:** none created.
- **Desktop entry:** not clicked here, because each button opens `/t/`, which records a scan. The `/demo` link targets and QR images are unchanged since E0 (Marketing, above), and the page is in the review gallery.
- **Review gallery:** [E2C_REVIEW_GALLERY.md](E2C_REVIEW_GALLERY.md), six phone-width screenshots taken scan-free at 19:15 UTC.

### Presenter reset (2026-11-23 19:10 UTC)

Removes the review's support request, so the curated views stay as authored (item 6 as revised).
- **Manifest** `presenter-production-review-20261123` (kind `presenter`). `--remove` names one row: `form_submissions` `502416be-a69a-481b-b894-941c6c5ef56e`.
- **Dry run (19:09 UTC): ACCEPTED,** with one change, that submission's DELETE. Everything else is KEEP, including:
  - all 1,284 scans: 574 older ones, the 700 of the history and the review's 10;
  - the 73 digest-ledger rows.
- **Apply (19:09:55–19:11:15 UTC):**
  - one transaction, 1 guarded statement;
  - Storage: 224 objects present, 0 uploaded;
  - re-plan after commit **CONVERGED**;
  - outside the 13:00–15:00 UTC digest window.
- **After:**
  - `phase-e:precall:production` **ready**: 0 reports, 0 acknowledgements and 10 scans since the anchor; curated items 3 new and 2 reviewed; the usual Bobcat HEAD note;
  - `phase-e:health:production` 5/5 on both hosts.

| File (outside Git, `%USERPROFILE%\Mulemark-Ops-Archive\e2c\`) | SHA-256 |
|---|---|
| Removal list `presenter-review-20261123.remove.json` | `b6f06581b026c4cec648234da64ddcc20a712f67fe65d23ca99b18d0de918ac1` |
| Manifest `presenter-review-20261123.json` | `7a69f50ab3a50b60325c949dd44aeb3fed64e9c17f68e9cab1750cd0d5bbb7a7` |
| Plan (the `--approved-plan`) | `baf57f3a4a4fb614092f784a11ce75295018099ba134a3aee853d4141bfbe1b1` |
| SQL (101,561 bytes) | `b54e68965aafa98f989e3a84c2bb676bdcd530cf10f24e619e28e4404f4ccb84` |
| Composed in the lock (2,421,446 bytes) | `247081fbf012ac4b014eb77d96bc030e9c7f96285cb52f096b2c2debe82b4eeb` |
| Apply report | `e4a4b875023797a0f904252488000711c81bcdfebf34ad7e708771bcd28d0d65` |

The counts-only summary is `docs/phase-e/archives/presenter-production-review-20261123.plan.json`.

### Close-out (2026-11-23)

- **`.env.production-db.local` deleted** at 19:13 UTC, after the presenter reset, which needed it. No other env file was touched.
- **Production database password:** the operator resets it in Supabase → Project Settings → Database. The app doesn't use it, and the URL passed through files and tools during E2C.
- **Records:**
  - approval packet §13 (as run);
  - this log;
  - [E2C_REVIEW_GALLERY.md](E2C_REVIEW_GALLERY.md) and [PRESENTER_CHEAT_SHEET.md](PRESENTER_CHEAT_SHEET.md);
  - the marketing report's release note;
  - the counts-only summaries in `archives/`.
- **Marketing line endings:** fixed after close-out, at 20:59 UTC: `2c54323` replaced `0a4fcae` (Marketing, above).
- **Open items** (none blocks the showcase):
  1. Reset the Production database password (above).
  2. Optional: try a damage report with a photo on one card, then run a presenter reset.
  3. Separate follow-ups, unchanged:
     - the `winnat` port fix for the local suites;
     - redacting the host echo in `productionDbConfig`;
     - releasing the tap-target (`fix/public-touch-targets`) and focus (`fix/public-focus-not-obscured`) branches on their own.
- **Stop:** E2C is complete. E3 has not started.

## E3 — customer intake package and operator templates (2026-11-23, done)

> **Superseded on 2026-11-24 by kit 2.0** (see "E3 rework" below). This section records kit 1.0 as built and committed at `cf38abc`. Its files were removed from the working tree; Git history keeps them.

The files to send right after a customer agrees to a pilot, and the procedure behind them. Index: [intake/README.md](intake/README.md). No app code, migrations, Production data or tags were touched.

### Approvals and operator decisions

- **2026-11-23:** the operator pasted Prompt E3 after the marketing line-ending fix ("move to the next series once your work is complete").
- **The plan (plan mode) was approved through the approval card.** It covered:
  - public templates and generators in `docs/phase-e/intake/` and `scripts/phase-e/intake/`;
  - filled customer workbooks only in `%USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\`, outside Git;
  - two pinned dev dependencies, `exceljs` 4.4.0 and `docx` 9.15.2;
  - US spelling, to match the app.

### What was built

- **Customer packet** (`intake/customer/`, ZIP-ready, 13 files):
  - the onboarding guide (DOCX and PDF, 4 picture-first pages);
  - the blank intake workbook and a completed fictional EXAMPLE;
  - the scope and assumptions sheet (DRAFT, DOCX and PDF);
  - six CSV templates with a short note.
- **Internal packet** (`intake/internal/`, ZIP-ready, 34 files):
  - the operator README and the onboarding procedure (checklist and responsibility matrix);
  - the tracker workbook (CHECKLIST, RESPONSIBILITIES, EXCEPTIONS, TOUCH TIME);
  - five email templates (MD and DOCX) with `PLACEHOLDERS.md`;
  - the content-approval wording (DRAFT, MD and DOCX);
  - the tag-production handoff (XLSX and CSV);
  - the field mapping 1.0.0 and the intake schema.
- **Tools** (`npm.cmd run phase-e:intake:*`):
  - `build`, with `--check`, rebuilds byte for byte;
  - `check` writes the readiness report, the one missing-information email, the current-import CSV and the contract manifest (schema 1.3.0);
  - `prefill` fills a workbook from a customer's own fleet export;
  - `zip` builds the two packets.
  - `check` and `prefill` refuse to write inside the repository.
- **Example run** (`intake/example-run/`, fictional Northridge Rentals): 47 assets give 42 READY_WITH_WARNINGS, 2 CUSTOMER_INPUT_REQUIRED and 3 MULEMARK_REVIEW. The email holds 2 customer items, and the manifest is valid.
- **Records:**
  - [intake/QA.md](intake/QA.md): every check and its result;
  - [intake/WALKTHROUGH.md](intake/WALKTHROUGH.md): the second-person walkthrough and the independent run.

### Walkthrough

- **The run:** a separate agent played a rental administrator with 60 machines and a messy fleet export, reading only the customer packet.
- **Findings:** 1 blocker, 7 confusing points and 4 minor ones.
- **Fixes:**
  - the fleet-export path is now "skip MODELS and ASSETS";
  - MODELS comes before ASSETS;
  - the three unknown answers are defined, and blank is fine;
  - file permission is split into "Where is it from?" and "Who may see it?", with stated folder defaults that a FILES row can only narrow;
  - each alert hint says what triggers it, and the email links a demo page;
  - one photo per model for identical machines, and shoot from the side;
  - the example leads with the varied machines;
  - the scope sheet answers the batch, billing, template and privacy questions.
- **Left open:** who attaches tags, for the commercial review.
- **Its estimate:** 4–6 hands-on hours for 60 machines with the export sent as is.

### Gates (2026-11-23, final state)

- **Code gates:**
  - `npm run lint` and `npm run typecheck`: clean;
  - `npm test`: 219 files, 2,553 tests (the kit's own: 6 files, 103);
  - `npm run build`: passes.
- **Kit:**
  - `phase-e:intake:build -- --check`: 46 of 46 files match;
  - `phase-e:intake:zip`: 13 and 34 files, extracted with Windows and byte-identical.
- **Real Excel and Word:**
  - no repairs; dropdowns and protection as designed;
  - the EXAMPLE Check results calculate to the stored values;
  - leading-zero, duplicate and paste tests pass;
  - all 8 Word documents open, with no spelling errors beyond placeholders.
- **Sweep:** no local paths, usernames or secrets in any file going into Git, binaries included.

### Key hashes (SHA-256; all 46 in `intake/MANIFEST.json`)

| File | Bytes | SHA-256 |
|---|---|---|
| `customer/mulemark-intake-workbook-v1.0.xlsx` | 80,947 | `5c0b19d01b227c3691e782c52718f5e8c871f912aa646d23e0d10936e2aa41b0` |
| `customer/EXAMPLE-mulemark-intake-workbook-v1.0.xlsx` | 84,352 | `d3b81c411847b98492075d0b6d198aecb05f86b3dd9f709fb03dc041081a8552` |
| `customer/mulemark-onboarding-guide.pdf` | 141,456 | `86c97fa0099eb97824313e28fe1e6a0933ede7807a40a0578769f9cbed2879b3` |
| `customer/mulemark-scope-and-assumptions-DRAFT.pdf` | 53,010 | `d1b3a2126fdfef13a4de92f6b5de6709264a8f7fe6ba0e42de37aa1e53e8b92e` |
| `internal/field-mapping-1.0.0.json` | 33,669 | `5d27187cb00d21993c3f4c8b598a8b8c1b98526de1973ace8b4332f51eb3f959` |
| `example-run/manifest.json` | 43,731 | `8b6e988faebe4519b3f169202da18b1414adbb68fc4a3034e3405d9118b7332c` |

### Environment notes

- **Word's PDF/XPS export hangs in hidden sessions here.** The Acrobat add-in is loaded and the default printer is a network printer. Page images come from Word's own page metafiles (`qa/word-render.ps1`). The kit's PDFs are printed by Chromium.
- **The operator's own Word and Excel windows were never touched.** Nor were their printers, add-ins or settings. Only Word and Excel processes started by the QA scripts were ended.
- **Not available here:** LibreOffice, pandoc and Poppler. Google Sheets and Apple Numbers were not tested.

### Open, operator-pending

1. **Upload channel (setup step, before the first customer):** one upload-only link per customer that accepts whole folders. Never a public folder ([intake/internal/README.md](intake/internal/README.md), step 2).
2. **Commercial and legal reviews of the DRAFT wording:** the scope sheet, the approval wording, and the guide's timing and "who does what" lines. Settle who attaches tags in the same review. Then set `REVIEWED` in `scripts/phase-e/intake/documents.mjs` and rebuild.
3. **Carried from E2C:**
   - reset the Production database password;
   - the `winnat` port fix;
   - redacting the host echo;
   - releasing the tap-target and focus branches on their own.

### Next command

- **Stop:** E3 is complete. E4A starts only when the operator runs it, never automatically.

## E3 rework — onboarding kit 2.0 (2026-11-24, done)

Kit 1.0 asked too much of both sides. Kit 2.0 makes onboarding a 30-minute call plus the customer's own equipment list and a phone check of one page per model; Mulemark does the rest with two commands. Index: [intake/README.md](intake/README.md). No app code, migrations, Production data or tags were touched.

### Decision and approval

- **2026-11-24:** the operator reviewed kit 1.0. The scripts and procedure "seem to be more time consuming for both the customer and I than I would like… the user experience needs to be as painless as possible, as does the onboarding process." He also couldn't tell what the upload-channel step asked for.
- **I recommended a lighter flow:**
  - a call instead of a customer workbook;
  - the customer's export as it is;
  - photos optional;
  - no upload link.
- **The operator replied "yes, rework it in plan mode".** The plan was approved through the approval card.

### What changed

- **The customer gets two files** (`intake/customer/`):
  - the one-page "what to expect" sheet (PDF; picture-first; at most 220 words, tested);
  - an equipment-list template, only for customers without rental software.
- **Removed for the customer:** the 4-page guide, the customer workbook, the folder conventions, the CSV templates and the upload link.
- **Mulemark's setup workbook (2.0):**
  - **CALL SHEET** replaces START HERE and COMPANY & PEOPLE. Its four sections are: from their website, ask on the call, defaults (blank keeps the app's setting), and dates and time (feeding `batch.measurements`).
  - **Unchanged:** MODELS, ASSETS, FILES & NOTES and LISTS. Labels are reworded for Mulemark, and no key changed.
- **Field mapping 1.1.0:**
  - all 67 keys of 1.0.0 are kept, and six `batch.*` keys added;
  - the defaults are documented: blank tag = New tag, photos optional, the manual states, ship-to before tags.
- **Two commands replace check, prefill and zip:**
  - **`onboard:start`:** the batch folder, its inbox folders, the files to send and the welcome email. Your name is remembered.
  - **`onboard:check`:**
    - fills MODELS and ASSETS from the list once, after a backup;
    - writes `to-do.md` (ask the customer, your work, warnings);
    - writes plain-text drafts: the questions email (only while something is left to ask), the preview email with the approval wording, and the go-live email;
    - writes the tag order (once), the import CSV and the manifest.
- **Emails:** four instead of five, and the tools fill nearly everything.
- **The rules ask the customer less:**
  - **Manuals:** Mulemark searches first. Not found means one customer question; Not available means no manual button.
  - **Photos:** never block, and saved ones count automatically.
  - **Your bookkeeping:** the inbox and the workbook are yours.
- **Removed outright:** the tracker workbook, the exception log, the separate approval form, the procedure document and the ZIP packets. The scope sheet is now internal, as the commercial-review reference.

### Walkthrough

- **The run:** a separate agent played the customer, with only the welcome email and the one-pager, and the operator, with only `internal/README.md`. It ran the real commands on a messy 60-row export.
- **It found 34 points:** 5 blockers, 19 confusing points and 10 minor ones.
- **The blockers:**
  - a stale questions email could be sent;
  - a list re-saved in Excel lost its zeros silently;
  - the manual search came after the one email and had no "not found" end state;
  - "about an hour" was too low for 60 machines, and putting the tags on wasn't mentioned;
  - the pre-E4B screen share wasn't in the routine.
- **All were fixed** ([intake/WALKTHROUGH.md](intake/WALKTHROUGH.md)) except two left for the commercial review: who puts the tags on, and the approval wording's length.
- **The customer's stated time is now "about 1–2 hours at your desk"**, with one page per model to check.

### Gates (2026-11-24, final state)

- **Code gates:**
  - `npm run lint` and `npm run typecheck`: clean;
  - `npm test`: 220 files, 2,594 tests (the kit's own: 7 files, 144);
  - `npm run build`: passes.
- **Kit:** `phase-e:intake:build -- --check` reports all 31 files matching.
- **Real Excel** (on copies):
  - no repairs; dropdowns, protection and the CALL SHEET's date cells as designed;
  - the EXAMPLE Check results match the stored ones;
  - the leading-zero, duplicate and paste tests pass;
  - the list template keeps `00412`;
  - a workbook open in Excel stops `onboard:check` with "close it in Excel".
- **Real Word:** the one-pager is one page; no spelling errors beyond placeholders.
- **Commands, end to end in a temporary folder:**
  - the fixture list and a messy 40-machine list (title lines, plain-number codes, spelling variants, class codes, a make-only machine);
  - refusals for an existing batch and for the repository.
- **Sweep:** no local paths, usernames or secrets in any file going into Git, Office files included.

### Key hashes (SHA-256; all 31 in `intake/MANIFEST.json`)

| File | Bytes | SHA-256 |
|---|---|---|
| `customer/mulemark-what-to-expect.pdf` | 83,702 | `95e5b18b6ae9e236927f2d5d179ab0ab56afd57fa66ecd743e234760e583a743` |
| `customer/equipment-list-template.xlsx` | 6,620 | `894921542042982cb8088aa01ed5121b87b7290ac6c1b23b027d7653f909d7de` |
| `internal/mulemark-setup-workbook-v2.0.xlsx` | 67,823 | `c5116fd423408583048b5850b8143b22ffe496dc92c63671484801129f9e9095` |
| `internal/EXAMPLE-setup-workbook-v2.0.xlsx` | 70,983 | `f329a3bc8bcb14475fc190cb76985a46b735b1e89eeeb32442a39cced23faffe` |
| `internal/field-mapping-1.1.0.json` | 37,183 | `b4974ba819657e2e4bc4462463bbfaf0f4ed9afa132990756b6f3772bc87103f` |
| `example-run/manifest.json` | 44,184 | `9ff30cdbcd88c84ddc0c09f319ceb81fcfb3cd9d4f864e92aa6d05ba34f8519b` |

### Open, operator-pending

1. **Commercial and legal review of three short texts:**
   - the one-pager's "good to know" lines, including who puts the tags on;
   - the approval wording in the preview email;
   - the internal scope sheet.

   Then set `REVIEWED` in `scripts/phase-e/intake/documents.mjs` and rebuild. Until then, `onboard:start` warns before the DRAFT one-pager is sent.
2. **No upload channel is needed any more.** Item 1 of kit 1.0's open list is withdrawn.
3. **The first real customer comes after E4B.** Until then, the import and the page review are a screen share with their Administrator.
4. **Carried from E2C:**
   - reset the Production database password;
   - the `winnat` port fix (done 2026-11-26, see "Housekeeping");
   - redacting the host echo (done 2026-11-26, see "Housekeeping");
   - releasing the tap-target and focus branches (done 2026-11-27, together with sharp; see "Release (2026-11-26)").

### Next command

- **Stop:** E3 (kit 2.0) is complete. E4A starts only when the operator runs it, never automatically.

## Housekeeping (2026-11-26, done)

Two follow-ups carried since E2C. The operator approved them on 2026-11-25 ("the two small housekeeping fixes").

### Local Supabase ports (the `winnat` fix)

- **Cause:** Windows' NAT service (`winnat`, used by WSL, Hyper-V and Docker Desktop) reserves random 100-port blocks from the dynamic range (49152 and up) at startup.
  - On 2026-11-20 it held 54318–54417, which covers every local Supabase port.
  - The `db reset` then left the database container stopped.
- **Machine fix (operator, 2026-11-26):** four administered exclusions, so Windows can no longer reserve these ports:
  - 54320–54324, 54327 and 54329;
  - 55432, the standalone restore database.

  `persistent` is netsh's default. To undo, run the same `netsh` lines with `delete`.
  - **The first attempt** (one block, 54320–54329) was refused: another program's outbound connection held 54325 at that moment.
  - The stack doesn't use 54325 or 54326 (SMTP and POP3 are commented out in `supabase/config.toml`), so the exclusions skip them.
- **Repo:**
  - **The check:** `scripts/verify-local-ports.mjs` (`npm run verify:local-ports`) compares the ports in `supabase/config.toml`, plus 55432, with `netsh interface ipv4 show excludedportrange protocol=tcp`:
    - a stack port inside one of Windows' reservations fails and prints the fix;
    - 55432 alone only warns;
    - other platforms skip;
    - a netsh failure only warns.
  - **When it runs:** before every reset (`predb:reset`, `pretest:e2e:reset`), so a reset stops before it can leave the database half-started.
  - **Helpers and tests:** in `scripts/lib/local-stack.mjs` and `.test.mjs`. One test fails if `config.toml` changes and the lines in `docs/E2E_TESTING.md` no longer match.
  - **Docs:** `docs/E2E_TESTING.md` (Troubleshooting) and `docs/SECURITY_TESTING.md`.
- **Proof:**
  - netsh lists the four ranges with `*`, and the check passes.
  - The local stack had been half-started since 2026-11-20: the database container only "Created", the other containers without host ports. `supabase stop` (volumes kept), then `supabase start`, published every port inside the exclusions.
  - `phase-e:restore -- standalone-up`, then `standalone-down`: 55432 listened on 127.0.0.1 only, then nothing listened.

### Database-address guard (the host echo)

- **The fix:** `databaseConfig` in `scripts/lib/showcase-target.mjs`, behind both the staging and Production guards, no longer prints the parsed host, which a malformed password filled on 2026-11-20. The message names the variable and gives the fix: percent-encode @ / ? #.
- **The test:** a fake password with an unencoded "@" then "/" makes the parser read `pw-fragment` as the host, and neither guard prints it. The test fails against the old message.
- **Commit:** `29068f2`.

### Gates and local suites (2026-11-26)

| Check | Result |
|---|---|
| Lint, typecheck | Pass |
| `npm test` | 220 files, 2,600 tests (2,594 + 6 new) |
| Build (CI's placeholder env), `check:scan-bundle` | Pass; ok |
| `test:security` (local stack, 0001–0041) | 11 files, 132 tests |
| `test:phase-e-local` | 34/34 |
| `test:phase-e-showcase-local` | 13/13 |
| `test:phase-e-showcase-walkthrough` | 7/7 (1.9 min), as in E2C; the operator's Demo-plan step was added on 2026-11-03 |

- **First local runs since 2026-11-04.** Each suite ran after `npm run db:reset` (the new check printed PASS) and the Kong health check. `/auth/v1/health` returned 200 every time, so no restart was needed.
- **Afterwards:** the local stack was stopped (`supabase stop`, volumes kept).

### Open, operator-pending

1. **Reset the Production database password** (from E2C).
2. **Release the tap-target, focus and sharp branches as one release** (recommended, 2026-11-25; done 2026-11-27, see "Release (2026-11-26)").
   - Each promotion replaces all of Production, so promoting one branch alone drops the others' changes.
   - The plan: merge `fix/deps-sharp-audit-triage` into `fix/public-focus-not-obscured` (which contains the tap fix), run every gate, test the one Preview (including the photo damage report for sharp), promote once, then merge it into phase-e.
   - The focus fix's known gap: screens under about 780 px of visible height need a design decision.
3. **The commercial and legal review of the kit 2.0 texts:** unchanged; see "E3 rework" above.

### Next command

- **Stop:** E4A starts only when the operator runs it, never automatically.

## Release (2026-11-26, done)

One combined release of the three finished branches: sharp 0.35.5 with the `npm audit` triage, the 44 px tap targets, and the WCAG 2.2 SC 2.4.11 focus fix. The operator said "go" on 2026-11-26 and approved the plan in plan mode.

### Why one release

- Each promotion replaces all of Production, so promoting one fix branch alone would have dropped the others' changes.
- Every branch already contained Production's `e4e7e01`, and phase-e adds no app code over Production.

### Branch and gates

- **Branch:** `release/2026-11-26`, cut from the focus branch (`0877538`, which contains the tap fix `28a1212` and Next 16.4.5), in the worktree `mulemark-worktrees\release-2026-11-26`.
- **Merge:** `fix/deps-sharp-audit-triage` (`4bc7b8f`), as `09496a5`, pushed. The tree equals the `git merge-tree` prediction (`bb7e4107`), and the package files are the sharp branch's, byte for byte.

| Check | Result |
|---|---|
| `npm ci`, then `npm install` | Both package files byte-identical; `npm ls --all` clean; next 16.4.5, sharp 0.35.5 |
| Lint, typecheck | Pass |
| `npm test` | 213 files, 2,454 tests, the focus branch's count |
| Build (CI's placeholder env), `check:scan-bundle` | Pass; ok |
| Route table and static media | Identical to the focus branch: 76 route lines, 17 files |
| `npm audit` | 7 moderate, as on the sharp branch |
| `test:phase-e-showcase-walkthrough` | 7/7 (2.6 min), with the focus and 44 px checks on every view |

### Preview (2026-11-26)

- **Deployment:** GitHub deployment `8091823788` (Preview, success, 17:19 UTC), host `qr-asset-tags-3fx56hc3s-jdapaetz2-s-projects.vercel.app`, Vercel deployment `dpl_5SDDN2e53VcZoUSTRZsjb75thW5K`.
- **Staging smoke** against that host, with the release's own `scripts/smoke/staging.mjs` and `QA_BASE_URL` set to the deployment rather than the branch alias: 29 checks, 28 pass, 0 fail, 1 skipped. The skip is the `dry_run` log line, read by hand below.
- **The sharp runtime check:** at 21:25 UTC the operator sent one damage report with a 1.79 MB photo on `/t/stg-qa-public` (SUB-2026-B0CF57, in staging). Its notification line, read in the built-in browser (read only), came from that deployment:
  - `previewRequestedCount` 1, `previewAttachedCount` 1, `previewFailureClass` null, `previewTransformMs` 1371, `previewBytesBucket` `lt_250kb`;
  - outcome `dry_run`, reason `preview_environment`: no email.

  So sharp 0.35.5 loads and transforms on Vercel's Linux.
- **Expected in the same log:** two red `[storage]` lines on `/t/stg-qa-public` (`public-documents`, 1 requested, 1 failed). The staging QA seed creates the public manual's row but uploads no file (`scripts/staging/seed-staging-qa.mjs`), so signing fails and the page leaves that manual out, as designed.
- **The optional operator checks** (button size on a phone, Tab focus with the acknowledgement prompt open) were not reported.

### Promotion and Production (2026-11-27)

- **Promotion (operator):** Vercel built **Production rebuild of 5SDDN2e53** (Ready in 51 s) and reported it to GitHub as deployment `8098905539`: Production, success, 00:44:07 UTC, host `qr-asset-tags-qd0bt41ns-jdapaetz2-s-projects.vercel.app`.
- **`/api/version`** on `mulemark.io` and `qr-asset-tags.vercel.app`: `09496a5`, environment `production` (00:45 UTC).
- **`npm run smoke:production`** (00:45 UTC): 14 checks, 13 pass, 0 fail, 1 skipped (the scan-page render). It ran from the release worktree, which holds no `.env.production-smoke.local`, as on 2026-11-24.
- **`phase-e:health:production`:** 5/5 on both hosts (scan-free `/nojs/t/`). On the alias host, the conditional `7gzt4aqc` still shows the unavailable notice, unchanged.
- **Rollback, if ever needed:** promote the previous Production deployment again (`e4e7e01`, **Production rebuild of FTkvSamdB**), then rerun `smoke:production`.

### Carried into phase-e

- **Merge:** `release/2026-11-26` into `phase-e/showcase-onboarding` in the main checkout (`--no-ff`, `core.autocrlf=false`), as `2cbcd47` (parents `707047a`, `09496a5`), pushed at 01:10 UTC. The tree equals the prediction (`4ce50b31`); the 14 changed files are LF and no CR was staged. The phase-e Preview built as GitHub deployment `8099250258` (Preview, success, 01:11 UTC).

| Check | Result |
|---|---|
| `npm ci`, then `npm install` | Both package files byte-identical; `npm ls --all` clean; next 16.4.5, sharp 0.35.5, docx 9.15.2, exceljs 4.4.0 |
| `verify:production-config` | 0 fail, 3 warn (shell env unset), 5 pass |
| Lint, typecheck | Pass |
| `npm test` | 220 files, 2,604 tests (2,600 plus the release's 4) |
| Build (CI's placeholder env), `check:scan-bundle` | Pass; ok. Route manifest and static media identical to the release build |
| `phase-e:intake:build -- --check` | 31 files match |
| `test:security` | 11 files, 132 tests |
| `test:phase-e-local` | 34/34, on the second run (below) |
| `test:phase-e-showcase-local` | 13/13 |
| `test:phase-e-showcase-walkthrough` | 7/7 (1.7 min) |

- **Kong also goes stale on Storage.** The first `test:phase-e-local` run failed 24 of 34. Its first test's fixture upload got Kong's "An invalid response was received from the upstream server", and the other 23 depend on that export.
  - **Cause:** the reset restarted Storage on a new container address, and Kong kept the old one (`connect() failed (113: Host is unreachable)`), while `/auth/v1/health` returned 200. It is the same quirk as E1's stale auth route.
  - **Fix:** `docker restart supabase_kong_QR_Asset_Tags`; the suite then passed on a fresh reset.
  - Kong needed the restart after two of the four resets. The check after each reset now probes `/storage/v1/status` as well as `/auth/v1/health`.
- **Line endings:** the main checkout holds 237 older `i/lf w/crlf` working copies. Git treats them as unchanged, and every gate passed with them.
- **Afterwards:** the local stack was stopped (`supabase stop`, volumes kept).

### Branches

- **Retired:** `fix/deps-sharp-audit-triage`, `fix/public-touch-targets` and `fix/public-focus-not-obscured`. Never promote them: each lacks the others' changes. Deleting them, their worktrees and `release/2026-11-26` waits for the operator's OK.
- **Production** runs `release/2026-11-26` (`09496a5`), and `phase-e/showcase-onboarding` contains it.

### Open, operator-pending

1. **Reset the Production database password** (from E2C).
2. **The focus fix's known gap:** on screens under about 780 px of visible height, focus can still land behind the open acknowledgement card. It needs a design decision.
3. **The commercial and legal review of the kit 2.0 texts:** unchanged; see "E3 rework" above.
4. **`typescript-eslint` 8.73.0 from 2026-11-30:** the in-range, lockfile-only update that clears the last 7 `npm audit` entries (`docs/DEPENDENCY_ADVISORIES.md`).

### Next command

- **Stop:** E4A starts only when the operator runs it, never automatically.
