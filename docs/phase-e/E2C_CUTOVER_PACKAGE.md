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
   - the business-card evidence and the printed-sheet answer are in;
   - the owner-only QR-disable guard is migrated ([PHASE_E_PLAN.md](PHASE_E_PLAN.md));
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
   npm.cmd run phase-e:reset:production -- manifest --kind=showcase --org=11111111-1111-4111-8111-111111111111 --out=<archive folder>\showcase-production-<D>.json --scans=remove-showcase
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

## Decisions for E2C

Answers from the operator on 2026-11-02 and 2026-11-03 are marked **decided**. The counts above come from the 2026-10-20 dry run, before these answers. The next dry run should show about 2,628 scan deletes, 5 new documents instead of 8, and 4 covers with no guide PDFs.

1. **Pre-cutover test scans on the four assets: remove (decided).**
   - Use `--scans=remove-showcase`, which deletes them by exact id after the archive. The latest audit counts 2,628: 017 948, 3015 792, 014 60, 2041 828. Most date from June and July testing. The rollback restores them.
   - The option has only a unit test so far, so E2C rehearses it on staging first.
2. **Redrawn imagery: parked as an open item (decided).** The panels, signs and three Start-Up Guide PDFs stay off Production until the operator comes back to them. They can be added later without touching the history.
   - **E2C changes for this:**
     - drop the 3 guide documents and uploads from the overlay;
     - take "The Start-Up Guide shows each step." out of both trailer quick starts;
     - reword the E20 headline;
     - rewrite story 1 and the `017-current-support` record, which both rely on the guide;
     - update SHOWCASE_STORIES, PRESENTER_RUNBOOK and the walkthrough's guide checks, then re-rehearse on staging.
   - **Page text: approved as worded (decided 2026-11-03)** in [E2C_PAGE_TEXT_REVIEW.md](E2C_PAGE_TEXT_REVIEW.md). The operator may tweak it later. E2C marks those fields READY in the packs.
   - **Bobcat's E20 manual: not bought (decided 2026-11-03).** The E20 page uses the Cat page's handover wording. The E20 steps, fuel lines and panels wait until the manual is in hand.
   - The nine evidence drawings from E2B are separate and stay unless replaced ([showcase/MEDIA_NOTICE.md](showcase/MEDIA_NOTICE.md)).
3. **Big Tex: photos and materials from its website may be used, credited to "Big Tex Trailer Manufacturing, LLC" where practical (decided).**
   - The reply's text is in the vault: `%USERPROFILE%\Mulemark-Sources\e2a\oem\bigtex\big-tex-permission-reply.txt`. Higher-resolution versions are available on request.
   - **Uses:**
     - both trailer covers;
     - the four routine trailer evidence drawings, where Big Tex has a suitable shot, tagged "Illustrative photo";
     - the marketing trailer scene.
   - **Credit:** each Big Tex image carries it in its corner tag, as the E20 photo carries its photographer's, and the media notices and pack sources record it.
   - The owner's manuals stay linked to Big Tex's own copies. Hosting them is now allowed if it is ever needed.
   - **Not answered, so still BLOCKED:** whether the Hoist Manual covers the 14LP, and the lug-nut torque values. No approved page text depends on them.
4. **Apply mode for Production: a database URL with a Production guard (decided 2026-11-03).**
   - E2C adds the guard, modelled on the staging guard (`scripts/lib/showcase-target.mjs`), under its own approval.
   - It is the path rehearsed on staging, including the forced-failure rollback and the `--approved-plan` check. The alternative was the emitted SQL, about 2 MB, run in the SQL editor; it was never rehearsed.
   - The operator removes the URL from the env file after the cutover.
5. **The anchor date D: 2026-11-03, a Tuesday (decided 2026-11-03).** The history ends at 06:00 Vancouver time that day (13:00 UTC).
   - **Test build** for that date, written to a scratch file (the tracked dataset was not touched). It passed the time rules:
     - history from 2026-07-21;
     - nothing after the anchor;
     - events between 07:00 and 20:59 local;
     - 017 on rent since Monday 2026-11-02, 2041 since Sunday 2026-11-01.
   - Apply from 08:00 Vancouver time on D or any later day (the runbook keeps clear of 13:00–15:00 UTC), once the plan shows D's digest run in the ledger. A later apply only makes the history read older.
   - In time-zone data 2026b, `America/Vancouver` stays on UTC-7 all year, so 06:00 is 13:00 UTC. E2C first reads the ledger's latest `window_end`. A value of 14:00 UTC would mean Vercel's runtime has older time-zone data. That doesn't endanger the cutover, because the history still ends before the window, but the digest would be arriving at 7 AM.
6. **Known app behaviour** ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md)). "Repeated reports" on every showcase machine: note it, fix separately (decided 2026-10-20). The rest of the runbook's list is treated the same unless the operator asks for a fix first.
7. **Organization settings (missing from this package until 2026-11-02).** The cutover never changes them, but three need fixing ([CANONICAL_SHOWCASE_FLEET.md](CANONICAL_SHOWCASE_FLEET.md)). E2C decides how they are changed and records it.
   - **Logo: cleared at the cutover (decided 2026-11-03).** It is a real dealer's logo, hotlinked from that dealer's site. Until the operator has owned artwork, the scan page shows its built-in placeholder: Northridge's first letter on the brand colour.
   - **Support phone (open):** `+1-555-1122` cannot be dialled. Recommended: clear it, which leaves `support@mulemark.io` as the contact.
   - **"Powered by" label (open):** still the old product name. Recommended: change it to Mulemark.
   - The E2C plan carries the two open recommendations for the operator to approve or strike.
