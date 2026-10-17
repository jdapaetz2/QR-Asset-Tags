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
