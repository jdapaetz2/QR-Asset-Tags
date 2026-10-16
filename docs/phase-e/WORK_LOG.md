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

### Next command

**Prompt E1** (recoverable archive, QA isolation and reset rehearsal), started in plan mode **only when the operator runs it**. The grouped approval is in place (2026-10-16); E1 is never started automatically.

Drift check first:

```
npm.cmd run phase-e:audit:production -- --org=11111111-1111-4111-8111-111111111111
```

Compare the new artifact's counts with [the boundary manifest](manifests/northridge-archive-boundary.json).
