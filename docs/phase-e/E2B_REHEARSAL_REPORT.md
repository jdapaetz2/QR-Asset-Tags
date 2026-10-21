# E2B rehearsal report (2026-10-20/21)

The synthetic showcase history ([SHOWCASE_STORIES.md](SHOWCASE_STORIES.md)) was built, applied and exercised on the local stack and on staging. Against Production it only ran reads and a dry run. This report carries counts and results only: no personal data, no storage paths, no signed URLs.

- **Dataset:** scenario `e2b-1`, anchor **2026-10-20 06:00 America/Vancouver** (13:00 UTC).
- **Tracked files:** `docs/phase-e/showcase/scenario.json`, `dataset.json`, `media.json` and 11 images; the SHA-256 values are in [WORK_LOG.md](WORK_LOG.md).

## Local stack (synthetic data only)

`npm run test:phase-e-showcase-local` resets the local database, then runs the real tools in one ordered file. It passes **13/13**.

| Step | What it proved |
|---|---|
| Bootstrap ×2 | The first run added EXCAVATOR-3015 and TRAILER-2041 (Production ids, codes and creation times), their QR rows and pages, and aligned 017 and 014. The second run changed nothing |
| Plan | `showcase` manifest **ACCEPTED**. Inserts: every dataset row (92 rentals, 179 submissions, 55 acknowledgements, 700 scans). Writes to QR rows, profiles, the digest ledger or the organization: none |
| Interrupted apply | `--fail-at=writes` and `--fail-at=postchecks` each rolled back completely: every table's fingerprint was unchanged. The retry then applied |
| Apply | One transaction, triggers on. The re-plan after commit converged (all KEEP). Applying again ran **0** statements |
| Duplicate seed | A second `showcase` build was refused ("already on this target") |
| SQL invariants | Every live row equals the dataset row (`to_jsonb` hashes). There are no overlapping rentals, and the four pointers equal the dataset's and point at active rentals. Outbound stamps come seconds before the rental opened, and staff returns seconds before it closed. Reports carry no rental or template. No staff profile id. Open items: 3 new, 2 reviewed. All 226 evidence files are stored. QR rows and profiles are byte-identical to before |
| Dashboard and analytics (as the local admin) | The queue, computed with the app's own `buildAttentionItems`: 3015 (priority 2), 014 (5), 017 (7), 2041 (7). 7/30/90-day scans equal an independent count. A photo signs under the admin's own session |
| Presenter reset | A live demo added an acknowledgement and a staff return (the app's RPC), and resolved the open request. The reset was **refused [conflict]**, naming the live return. With `--remove` it was **ACCEPTED**. A visitor's damage report filed after the review and before the apply was **kept**. The apply converged, and the request, rental and pointer were back to the authored values |
| Reviewed plan | An apply was refused when a dataset row changed after the review ("differs from --approved-plan"), and when given another manifest's plan |
| Refresh | Re-anchored 3 days back: same rental and acknowledgement ids, new dates, rows only the old version had deleted. It converged, the visitor's report was kept, and the 7-day analytics showed scans |
| Digest | The real worker with a fake sender, over the applied dataset, with a ledger row at its anchor. None of the 95 dataset return checklists was listed. The later staff control was listed under `instant_renter` (the public one was not); both were listed under `daily_exceptions` |
| Rollback | A restore to the pre-showcase archive (`--cutover`, `--dataset`) removed every row and scan of both dataset versions and the E2A documents. It kept the visitor's report, and QR rows and profiles were unchanged |

**E1 suite:** `npm run test:phase-e-local` stays green, **34/34**.

## Local walkthrough (the real app)

`npm run test:phase-e-showcase-walkthrough` runs the four stories in a browser. It uses a production build on loopback with the email and cron variables empty, proven by `assert-safe-env`, and checks first that the server reads the local stack (a seed-only code resolves).

**Result: 6/6 passed** (the four stories, staff outbound and return on a disposable seed asset, analytics and the owner report).

- Screenshots are in `qa-artifacts/phase-e-showcase/` (gitignored).
- Every route below was visited in the real app.
- The rental and submission ids are the synthetic dataset's.

| Story | Route | What it showed |
|---|---|---|
| Story 1 · EXCAVATOR-017 | `/t/demo-ex017` | public scan page: identity, Start-Up Guide, Manual, the active-rental acknowledgement prompt |
| Story 1 · EXCAVATOR-017 | `/forms/demo-ex017/support/thanks?ref=SUB-2026-0FADE6` | support request sent: the renter sees the SUB reference |
| Story 1 · EXCAVATOR-017 | `/dashboard` | admin dashboard: the attention queue at the anchor |
| Story 1 · EXCAVATOR-017 | `/dashboard/rentals/7234cf3f-9d81-4351-8d57-ec78bd5d23c1` | rental evidence of the active rental: outbound photos, the renter's acknowledgement |
| Story 1 · EXCAVATOR-017 | `/dashboard/submissions?asset_id=21111111-1111-4111-8111-111111111101&status=unresolved` | the open items on 017: the reviewed operating question and the live support request |
| Story 2 · EXCAVATOR-3015 | `/dashboard/rentals/39076f5a-f940-48f1-8b26-211455dd939c` | the leak rental: outbound baseline vs staff return (hydraulics pass to fail), the weeping-fitting illustration |
| Story 2 · EXCAVATOR-3015 | `/dashboard/rentals/77906050-ea65-489f-aecf-a09df95d1dc4` | the connected clean rental: outbound, the renter's own return and the staff return |
| Story 2 · EXCAVATOR-3015 | `/dashboard/submissions/d9b79fe4-1f39-42e6-8f4f-3741253cf473` | the consequential issue: the staff return with damage observed, status New |
| Story 2 · EXCAVATOR-3015 | `/dashboard/submissions/bc1490ee-a46c-477d-b128-f2dd2bd85065` | the minor issue: a worn bucket tooth reported with a photo, resolved |
| Story 2 · EXCAVATOR-3015 | `/dashboard/submissions?asset_id=7f7753d2-37f9-4e74-bbb2-90f048523f21&status=unresolved` | the two open items on 3015: the renter's oil-drip report (reviewed) and the staff return (new) |
| Story 3 · TRAILER-014 | `/t/demo-tr014` | public scan page: 35SA-12 identity, the Start-Up Guide and the owner's manual |
| Story 3 · TRAILER-014 | `/dashboard/rentals/ac3506f5-4272-4727-8d07-1c93b8b0b17c` | the current actionable item: safety-chain pins issued at outbound, missing at return |
| Story 3 · TRAILER-014 | `/dashboard/rentals/b3f1b8ee-f572-418d-a8d3-89ecb740ad8b` | the current clean result: every accessory issued and returned, lights, coupler and gate checked |
| Story 3 · TRAILER-014 | `/dashboard/submissions?asset_id=21111111-1111-4111-8111-111111111102` | the 014 history, including the resolved missing-straps return |
| Story 4 · TRAILER-2041 | `/t/67uqc3q7` | public scan page: the 14LP-14 troubleshooting steps the renter followed |
| Story 4 · TRAILER-2041 | `/forms/67uqc3q7/return/thanks?ref=SUB-2026-441954` | the renter's return checklist at drop-off |
| Story 4 · TRAILER-2041 | `/dashboard` | the queue now asks to mark 2041 returned (the support request stays open) |
| Story 4 · TRAILER-2041 | `/dashboard/submissions/441954c1-3f49-4c34-a806-bbb10d08cd26` | the renter's return opened from the queue and marked returned & resolved: the rental closes |
| Story 4 · TRAILER-2041 | `/dashboard/submissions?asset_id=3313ed1c-f738-4817-b4fa-6f2163dc2e14&status=unresolved` | after the return: the hoist support request is still open for follow-up |
| Staff flows · disposable GEN-008 | `/staff/t/demo-gen008?started=SUB-2026-4AE039` | staff outbound on the disposable GEN-008: rental started |
| Staff flows · disposable GEN-008 | `/staff/t/demo-gen008/return/complete?sub=ed915d4a-eaf3-420a-ba4c-655e2a354edf` | staff return on GEN-008: rental closed, asset available |
| Analytics and the owner report | `/dashboard/analytics?range=30` | the admin analytics over 30 days (relative to today) |
| Analytics and the owner report | `/owner/analytics` | the platform owner report: Northridge labelled demo data, exact counts |

**Also confirmed:**
- The curated history of the four assets was unchanged by the staff flows.
- After the renter's return, Mark returned & resolve closed the 2041 rental.
- The owner report showed "Demo data · synthetic history" next to Northridge, with exact counts.

**Seen in the screenshots, and fixed:** the session comparison printed an hours difference as "+10.700000000000045 hours", a floating-point artefact. The difference is now shown at the readings' own precision ("+10.7 hours"; `lib/inspections/session-comparison.ts`, with a unit test). The walkthrough screenshot predates the fix.

## Staging

Run on 2026-10-21 through the guarded staging database URL (`scripts/lib/showcase-target.mjs`).

Before every database step the guard checked:
- the session pooler on port 5432, with TLS verified against the project's CA certificate;
- that the API URL is staging and its schema matches the graph;
- the staging-only probe row;
- the reviewed trigger and job catalog.

No form was filled on staging and no Production `/t/` URL was requested.

| Step | Result |
|---|---|
| Bootstrap (`phase-e:showcase:bootstrap:staging`) | Dry run, then `--apply`: EXCAVATOR-3015 and TRAILER-2041 added with their QR rows and pages, the creation times of 017 and 014 aligned, 2 old test scans deleted (10 row changes). A second run: 0 changes |
| Plan (`showcase-staging-e2b-20261021`) | **ACCEPTED**. Inserted: 92 rentals, 179 submissions, 55 acknowledgements, 700 scans and 8 documents. Updated: the 4 assets and 4 pages (E2A). Deleted by exact id: staging's one old submission. QR rows, profiles and the ledger untouched. Counts-only summary in `docs/phase-e/archives/` |
| Interrupted apply (`--fail-at=writes`, with `--approved-plan`) | Rolled back. A re-plan showed the identical change set. The 231 files were uploaded first (only missing ones) |
| Apply (`--approved-plan`) | One transaction, **183** guarded statements. Files already present 231, uploaded 0. The re-plan after commit **CONVERGED (all KEEP)** |
| Fresh `noop` plan and a `presenter` dry run | Both ACCEPTED, all KEEP |
| Read-only checks (`phase-e:showcase:check:staging`) | All dataset rows present (92 / 55 / 179 / 700). One rental at a time per asset. The 4 pointers agree. Open items 3 new, 2 reviewed. Outbound and staff-return stamps are seconds before their rental opened or closed. No staff profile id. The 4 QR rows are active and production-primary |
| Scan-free `/nojs/t/` checks of the four codes | The branch Preview was first proven to read staging (the isolation probe, with the protection bypass). Then `demo-ex017`, `ezzs9ueg`, `demo-tr014` and `67uqc3q7` each resolved to their asset. No scan row was written |

## Production (reads only)

- **Drift audit** (2026-10-20 15:50 UTC): unchanged since E1 except the append-only tables:
  - scans 3,190 → 3,202;
  - digest runs 35 → 39, the daily runs, last window ending 2026-10-20 13:00 UTC.
- **Dry run** of the composed cutover manifest (`showcase-production-e2b-dryrun-20261020`): **ACCEPTED**, no refusals. The counts are in [E2C_CUTOVER_PACKAGE.md](E2C_CUTOVER_PACKAGE.md), and the counts-only summary is in `docs/phase-e/archives/`.
- **Watermark:** the last success equals the anchor, so no dataset return can reach a digest.
- **Nothing was written** to Production, and no Production `/t/` URL was requested.

## Gates

| Check | Result |
|---|---|
| `npm.cmd run lint` | Pass |
| `npm.cmd run typecheck` | Pass |
| `npm.cmd test` | 211 files, 2,430 tests passed |
| `npm.cmd run build` | Compiled successfully |
