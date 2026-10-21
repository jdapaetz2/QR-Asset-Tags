# E2C cutover package (prepared in E2B)

What E2C applies to Production Northridge, how, and what its approval must name. E2B built and rehearsed everything here on the local stack and on staging. On Production it only read and dry-ran ([E2B_REHEARSAL_REPORT.md](E2B_REHEARSAL_REPORT.md)). Nothing in this package has been applied to Production.

## What the cutover does

E2C applies one `showcase` reset manifest, composed from a fresh Production snapshot at cutover time. The table shows the counts from the 2026-10-20 dry run.

| Part | Effect (dry run) |
|---|---|
| draft-e2c shape (the approved archive boundary) | Open rentals on other assets cancelled (**3**) and their pointers cleared. The access-restricted submissions (**49**) and acknowledgements (**10**) removed, by exact id, after the archive. Hosted documents of unknown rights made private |
| The four showcase assets | Their old test rentals removed by exact id (**14**) |
| E2A content | Asset fields on the 4 (name, category, make, model, `DEMO-` serial, year cleared, cover, return template). The 4 pages, and the documents: **8** new, the older ones on the 4 made private. **5** files uploaded: 2 covers and 3 guide PDFs |
| E2B dataset | **92** rentals, **179** submissions, **55** acknowledgements, **700** scans, **226** evidence files. Pointers set for 017 and 2041 |
| Never | QR rows, profiles, the digest ledger, organization settings, any other tenant |

**Dry run:** `showcase-production-e2b-dryrun-20261020`, **ACCEPTED** with no refusals. The counts-only summary is `docs/phase-e/archives/showcase-production-e2b-dryrun-20261020.plan.json`; the manifest, full plan and SQL are in `%USERPROFILE%\Mulemark-Ops-Archive\e2b\`.

| Table | KEEP | UPDATE | INSERT | DELETE |
|---|---|---|---|---|
| assets | 4 | 7 | 0 | 0 |
| asset_rental_sessions | 1 | 3 | 92 | 14 |
| documents | 1 | 5 | 8 | 0 |
| equipment_pages | 7 | 4 | 0 | 0 |
| asset_acknowledgements | 0 | 0 | 55 | 10 |
| form_submissions | 0 | 0 | 179 | 49 |
| scan_events | 3202 | 0 | 700 | 0 |
| qr_links, profiles, notification_digest_runs, organizations | all KEEP | 0 | 0 | 0 |

**Watermark:** Production's last digest window ended **2026-10-20 13:00 UTC**, exactly at the dataset's anchor. Every synthetic return is at or before it, so no digest summarizes them.

## Exact order (E2C)

1. **Preconditions**, from runbook §8 plus these:
   - each asset's E2A content is approved;
   - the imagery decision is made (decision 2 below);
   - a second verified archive copy exists;
   - the apply mode is approved (decision 4).
2. **Rebuild the dataset for the cutover date D:**
   - run `npm run phase-e:showcase:build -- --anchor=D` and commit it;
   - `npm test` must pass;
   - D's 6 AM digest run must be recorded on Production before the apply, and the apply happens at or after 07:00 Pacific on D.
3. **Suspend Northridge** in the owner UI.
4. **Take a fresh archive** and verify it:
   - `npm.cmd run phase-e:archive:production -- --org=11111111-1111-4111-8111-111111111111`;
   - `npm.cmd run phase-e:archive:verify -- --path=<package>`;
   - make a copy on separate media.
5. **Compose and dry-run** the cutover:
   ```
   npm.cmd run phase-e:reset:production -- manifest --kind=showcase --org=11111111-1111-4111-8111-111111111111 --out=<archive folder>\showcase-production-<D>.json [--scans=remove-showcase]
   npm.cmd run phase-e:reset:production -- plan --manifest=<archive folder>\showcase-production-<D>.json
   ```
   It must be **ACCEPTED**, and its counts must match the approved ones. Review the emitted SQL.
6. **The approval names**, from that manifest:
   - the exact `remove` lists (the rentals, submissions and acknowledgements, plus scans if decision 1 says so);
   - `allow_insert` and `allow_update` (rows and columns);
   - the dataset's SHA-256 and anchor;
   - the manifest's SHA-256 and the plan's counts.
7. **Stage the 231 files** (only missing ones are uploaded, never overwritten).
8. **Apply in the approved mode**, as one transaction with triggers on and the emitted guards and post-checks. This tool refuses Production applies: E2C adds that path under its own approval (decision 4).
9. **Verify:**
   - a fresh `noop` plan is all KEEP;
   - the 12 QR rows are byte-equal to the archive;
   - `npm.cmd run phase-e:health:production` shows 5/5;
   - run the audit.
10. **Reactivate Northridge.** Record in WORK_LOG: archive id, both SHA-256s, the plan summary, the apply report and the health output.

**Rollback:**
```
npm.cmd run phase-e:reset:production -- manifest --kind=restore --org=11111111-1111-4111-8111-111111111111 --archive=<pre-cutover package> --cutover=<the applied showcase manifest> --dataset=<the applied dataset file> --out=<file>
```
It restores the archived rows and removes every dataset row and scan. It keeps every later visitor row. Rehearsed locally in E2B.

## Decisions left for E2C

1. **Pre-cutover test scans on the four assets.** The latest audit counts 2,628: 017 948, 3015 792, 014 60, 2041 828. Most date from June and July testing. Kept, they swamp the 90-day analytics next to the 700 synthetic scans. Remove them by exact id (`--scans=remove-showcase`, after the archive), or keep them (the default).
2. **E2A content and imagery:**
   - the E20 start-up steps wait for Bobcat's manual;
   - the guide panels wait for your redraw and review;
   - the evidence images can be replaced the same way ([showcase/MEDIA_NOTICE.md](showcase/MEDIA_NOTICE.md)).
   Apply the approved fields only, or wait.
3. **Trailer photos:** no licensed 35SA or 14LP photo exists yet (Big Tex's reply is pending), so the trailer covers stay empty.
4. **Apply mode for Production:** either the emitted SQL as one transaction in the SQL editor, or a database URL with a Production guard (like the staging guard, `scripts/lib/showcase-target.mjs`). Either is added and approved in E2C.
5. **The anchor time:** D at 06:00 Pacific. Apply after 07:00, once the plan shows `last_success_window_end` equal to D 06:00.
6. **Known app behaviour** to accept or fix first ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md)), notably "repeated reports" on every showcase machine.
