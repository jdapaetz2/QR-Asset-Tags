# E2C approval packet: release the Northridge showcase on Production

**Status: approved 2026-11-20 (items 1–6, as revised) and run on 2026-11-21 and 2026-11-23. As run: §13.** Prepared 2026-11-03 (Vancouver) from the E2C plan approved the same day. Staging has 0040 and 0041 and passed its checks against `8f6c514` on 2026-11-04 (§2). Sections 1–12 are the packet as approved; the history anchor and the counts changed before the run, as §13 records.

**What the release does:** the four printed QR codes keep their exact routes. Behind them go:
- the four curated machines: Bobcat E20, Cat 301.5, Big Tex 35SA and Big Tex 14LP;
- a rental history ending 2026-11-03;
- a demo notice on the public pages;
- the owner-only guard on printed codes.

The website's demo cards and the trailer scene follow straight after.

## 1. Identity

| | |
|---|---|
| Production Supabase | `apeiswnkheiwrpvumder` |
| Staging Supabase | `kwserenxwjxozztyigmw` |
| Production app today | `93fe39b` (deployment `4cu3ewBh`, promoted 2026-09-14) |
| **Commit to promote** | **`8f6c514`** (`8f6c5147704c8fbd7bfb6a157821faaedd8d54a0`) on `phase-e/showcase-onboarding`. App changes since `93fe39b`: the demo notice, the QR guard's message, `/api/version`, the Demo plan preset and owner-analytics label, and the meter rounding fix. No runtime dependency change; `vercel.json` (crons) unchanged |
| Organization | Northridge Rentals `11111111-1111-4111-8111-111111111111` |
| Alias host | `qr-asset-tags.vercel.app` is kept (the July 20 test sheet resolves there) |

| Card back (title) | Route | QR link | Asset |
|---|---|---|---|
| EXCAVATOR 017 | `/t/demo-ex017` | `41111111-1111-4111-8111-111111111101` | `21111111-1111-4111-8111-111111111101` |
| MINI EXCAVATOR 301.5 | `/t/ezzs9ueg` | `07c8ca60-0102-48c6-ac96-a8cb4b27ca90` | `7f7753d2-37f9-4e74-bbb2-90f048523f21` |
| TRAILER 014 | `/t/demo-tr014` | `41111111-1111-4111-8111-111111111102` | `21111111-1111-4111-8111-111111111102` |
| UTILITY TRAILER 204 | `/t/67uqc3q7` | `97c20650-4c09-4828-ac02-3cd6b4d083cb` | `3313ed1c-f738-4817-b4fa-6f2163dc2e14` |

All four routes are on `mulemark.io`. The printer's proof, the website artwork and the live rows are identical ([PROTECTED_DEMO_ROUTES.md](PROTECTED_DEMO_ROUTES.md)). The 12 QR rows of Northridge are KEEP in the plan, and the apply checks them byte for byte.

## 2. Gate A: completeness

| Machine (page) | Make and model | Photo and rights | Manual | Return checklist |
|---|---|---|---|---|
| Excavator 017 | Bobcat E20 (canopy), `DEMO-E20-0017` | TaurusEmerald, CC BY-SA 4.0, retouched and credited | Bobcat's store link plus Bobcat's "Rent It Safely" sheet (linked, not hosted) | mini excavator |
| Mini Excavator 301.5 | Caterpillar 301.5, `DEMO-301.5-3015` | CC0, credit as a courtesy | Cat Publications link, M0088895 | mini excavator |
| Trailer 014 | Big Tex Trailers 35SA-12, `DEMO-35SA-0014` | Big Tex, written permission 2026-11-03, credited in the image | Big Tex owner's manual (Big Tex's site) | utility trailer |
| Dump Trailer 2041 | Big Tex Trailers 14LP-14, `DEMO-14LP-2041` | Big Tex, as above | Big Tex dump-trailer owner's manual | utility trailer |

| Check | Result |
|---|---|
| Content review | The operator is the reviewer with final approval (E2A 2026-10-17). Page text approved as worded on 2026-11-03. Every field READY (19 / 18 / 18 / 18 operations); E20 fuel and Cat safety are approved blanks |
| Deferred (decisions) | The Start-Up Guides and panels are parked. The E20 manual wasn't bought; its page uses Northridge's handover wording. No placeholder is published |
| Evidence images | 226 files; trailer hitch and deck shots are Big Tex photos tagged "Illustrative photo"; the rest are our own drawings ([MEDIA_NOTICE.md](showcase/MEDIA_NOTICE.md)) |
| Accessibility | axe (WCAG 2.1 A/AA): **no violations** on the four scan pages and three forms. Keyboard: on all seven, Tab reaches every control in page order and each focused control visibly changes. **Touch targets: known shortfall, not fixed in this release** (§11) |
| Demo labels | The demo notice on scan pages and forms (once the plan is Demo); `DEMO-` serials; 55 "(demo)" acknowledgement names; owner analytics labels Northridge as demo |
| Support contact | `support@mulemark.io`; the kept phone `+1-555-1122` is shown as stored (§11) |
| Archive and boundary | Drift since E2B: visitor scans and digest runs only. Fresh archive verified, restored and copied (§3) |
| History | Anchor 2026-11-03 13:00 UTC, equal to Production's last digest window. Staging pre-call storyline passed; Production's runs after the apply |
| Private data | Public pages get only public-safe fields: no session history, submitter details or admin controls (walkthrough) |

**Staging, against `8f6c514`, after 0040 and 0041 (2026-11-04):**

| Check | Result |
|---|---|
| Migrations | 0001–0041 on both sides; the dry run listed only 0040 and 0041 |
| Preview `/api/version` | `8f6c5147…`, environment `preview` |
| `phase-e:precall:staging` | Ready: 42 PASS, 0 FAIL. The demo notice shows on all four `/nojs/t/` pages. 2 notes: Bobcat's link (§11); 0 visitor rows since the anchor |
| `smoke:staging` | 28 pass, 0 fail, 1 skipped (email logging can't be seen from a browser) |

## 3. Backup (the rollback point)

| | |
|---|---|
| Archive | `northridge-production-20261104T010914Z`, manifest `46c68b3a67bafb3ece4a9525346632a1f8c8fed143876be91fcb8d7019670b72` |
| Contents | 17 tables (3,248 scans, 49 submissions, 53 digest-ledger rows), 53 objects (23,107,566 bytes), 7 missing references (the known E0 seven) |
| Proof | Verified; restored into the standalone container: **VERIFIED** (80 checks, 17 tables hash-identical, 12 routes under anon RLS with 0 mismatches, 53 objects); USB copy on `D:` verified |

At the cutover a new archive is taken after Northridge is suspended (§10, step 4). That one becomes the rollback point.

## 4. What changes in the data

Dry run `showcase-production-20261104T011054Z`: **ACCEPTED**, 0 refusals.

| File (outside Git) | SHA-256 |
|---|---|
| Manifest | `aacca37a505fdb613075e35d3a65d55d3ecce1b793e9d30d3c0b6c9385720936` |
| Plan | `8a825c48bdd863f04b54d413c66598069aa177672ce620de7c99fac4937c78c9` |
| SQL (2.26 MB) | `619ab7d4bd51be394290198615f44bb23c9cb56be0f265862521e7a6f17dd739` |

| Table | KEEP | UPDATE | INSERT | DELETE |
|---|---|---|---|---|
| organizations | 0 | 1 | 0 | 0 |
| assets | 4 | 7 | 0 | 0 |
| equipment_pages | 7 | 4 | 0 | 0 |
| documents | 1 | 5 | 5 | 0 |
| asset_rental_sessions | 1 | 3 | 92 | 14 |
| form_submissions | 0 | 0 | 179 | 49 |
| asset_acknowledgements | 0 | 0 | 55 | 10 |
| scan_events | 574 | 0 | 700 | 2,674 |
| qr_links 12, profiles 1, tag requests 4 + 6, page template 1, digest ledger 53 | all KEEP | 0 | 0 | 0 |

- **Removed by exact id** (`remove`, listed in the manifest): rentals **14**, submissions **49**, acknowledgements **10**, scans **2,674** (017: 974, 3015: 797, 014: 66, 2041: 837).
- **New rows:** 5 documents (`allow_insert`), plus the dataset: 92 rentals, 179 submissions, 55 acknowledgements, 700 scans.
- **Updated, by exact row and column** (`allow_update`):
  - assets, 7 rows: name, category, make, model, serial, year, cover, return template, current-rental pointer;
  - pages, 4 rows: headline, quick start, safety, fuel and power, troubleshooting, return, emergency, published;
  - documents, 5 rows: visibility only;
  - rentals, 3 rows: status only (the open rentals on other machines are cancelled);
  - **the organization, 1 row: `logo_url` cleared and `powered_by_label` set to "Powered by Mulemark".**
- **Never written:** QR rows, profiles, the digest ledger, tag requests, any other organization, Northridge's status or plan.
- **SQL review:**
  - one transaction, with triggers on and the organization row locked;
  - bulk deletes and inserts: one statement per table;
  - updates: the 20 rows above plus 167 exact submission corrections;
  - 315 guard and post-check exceptions;
  - no DDL except 3 temporary snapshot tables dropped at commit.

## 5. Versions

| What | Version |
|---|---|
| Dataset | `a624a682c8ccb37a0889db43ddea9f62cd5e0cdd35ee0a9d39078a6385890cc1` (scenario `e2b-1`, anchor 2026-11-03 13:00 UTC) |
| Content (approved 2026-11-03) | EXCAVATOR-017 `e2a-153ef9c948a4`, EXCAVATOR-3015 `e2a-cb4f1858eba8`, TRAILER-014 `e2a-03f71027105c`, TRAILER-2041 `e2a-69e05038816d` |
| Migration 0040 | `0040_qr_primary_disable_guard.sql`, 2,098 bytes, `4641d9e7846df424b4ca7d60373415bed22efe2f5b4ecb6c4394fa63eb45277d` |
| Migration 0041 | `0041_demo_organization_flag.sql`, 1,256 bytes, `929e6878c6d0f0df54f0c53f9176cffe06d6b1673ac05a29c5e2651278f1fd4e` |
| Marketing patch | `e2c-showcase-marketing.patch`, 1,147,871 bytes, `1145a51150438cff1f4c75bcfef4f314f56beaf14df1c7eb991da0b473b9419e`, on marketing `57747c3` |

## 6. Files (Storage)

**230 files are uploaded before the data change:**
- 4 covers, to `public-assets`;
- 226 evidence images, to `submissions`.

**Rules:**
- A file is uploaded only if it is missing; nothing is overwritten.
- Nothing is deleted, and retention is unchanged.
- The old covers stay stored but are no longer referenced.

## 7. Write coordination and timing

- **Suspension:** Northridge is suspended for about 30–45 minutes.
  - Its pages and forms show "This page isn't available", and its users lose access.
  - Nothing is deleted, and no other organization is affected.
- **Final delta:** after the suspension, the manifest is composed again from the suspended snapshot and planned.
  - **More scans on the four machines** (visitors since the dry run): I report the new numbers and you re-confirm item 3 with them.
  - **Any other difference:** the run stops; you reactivate, and it comes back for approval.
- **Timing:** not between 06:00 and 08:00 Vancouver time (the digest window, 13:00–15:00 UTC).

## 8. Email and digest

- **The cutover itself sends no email.**
  - The rows are written in SQL, not through the app's forms.
  - The trigger catalog has no mail path (checked 2026-10-19).
  - Every synthetic return is before the digest watermark, so no summary includes them.
- **After the release:** real visitors' submissions notify `support@mulemark.io`, as Northridge's do today.
- **The live review (item 6):** sends one support request and one damage report, so two notifications go to `support@mulemark.io` only.

## 9. Rollback

**Data:** suspend Northridge, then build and apply the `restore` manifest from the pre-cutover archive, the applied cutover manifest and the dataset:

```
npm.cmd run phase-e:reset:production -- manifest --kind=restore --org=11111111-1111-4111-8111-111111111111 --archive=<pre-cutover package> --cutover=<applied manifest> --dataset=<applied dataset> --out=<file>
```

- **What it does:** puts back every removed row, including the 2,674 scans (`reinstate`), and the organization's two settings. It removes the dataset rows and keeps every later visitor row.
- **Rehearsed** on staging on 2026-11-04: ACCEPTED, applied, CONVERGED.

**App:** promote `93fe39b`'s deployment again in Vercel. Migrations 0040 and 0041 work with the old app.

## 10. Operations, in order (stage 3)

| # | Who | Step | Check |
|---|---|---|---|
| 1 | You | **Migrations** (item 1): relink the CLI to Production, check the link, dry run (only 0040 and 0041), push, `migration list`, relink to staging. No manual dump: both are function-only, and the old function body is in 0023 | I read the pasted `migration list` |
| 2 | You | **Promote** (item 2): Vercel → Deployments → the Preview of `8f6c514` → ⋯ → Promote to Production | I check `mulemark.io/api/version` (that commit, `production`), `smoke:production` and `phase-e:health:production` 5/5 |
| 3 | You | **Suspend:** `mulemark.io/owner/organizations/11111111-1111-4111-8111-111111111111` → Suspend organization | |
| 4 | Me | **Fresh archive,** verified; copied to `D:` and the copy verified | Manifest hash recorded |
| 5 | Me | **Final delta:** compose and plan again from the suspended snapshot | ACCEPTED; counts equal §4 (or only more scans: re-confirm item 3) |
| 6 | You | **Database URL:** one line in `.env.production-db.local`. Click-by-click steps come at that point; I never see the value | The tool's Production identity checks |
| 7 | Me | **Stage the files, then apply** with `--approved-plan`: one transaction | CONVERGED |
| 8 | You | **Demo plan:** the organization's Settings → Preset "Demo (not billed)" → Save plan settings. Then **Reactivate organization** | |
| 9 | Me | **Verify:** a no-op plan is all KEEP; 12 QR rows byte-equal; health 5/5 on both hosts; `phase-e:precall:production`; scan-free `/nojs/t/` checks of the four pages (identity, cover, credit, manuals, demo notice); audit | Recorded in WORK_LOG |
| 10 | You | **Marketing** (item 5): apply the patch in your clone, `npm run check` and `npm run build`, push `main` | I check `/`, `/equipment-tags`, `/demo`, `/credits` (never `/t/`) |
| 11 | You | **Delete** `.env.production-db.local` | |
| 12 | You and me | **Live review** with your phone and the cards (item 6); then a presenter reset removes the review's submissions by exact id | WORK_LOG and the review gallery |

## 11. Known limitations that ship (not blockers)

- **Touch targets under 44 px** on every tenant's public pages, from before Phase E. Measured by the walkthrough:
  - scan pages: the documents' "Open" links (35 × 20), "Call" and "Email" (24 px tall), "Staff member? Sign in" (16 px tall);
  - support and damage forms: the fields (38 px) and the submit button (36 px).

  A CSS-only follow-up is offered as a separate task. It is not part of this release, because it changes every customer's pages.
- **The support phone** `+1-555-1122` can't be dialled (kept by decision).
- **"Repeated reports"** shows on every showcase machine (decided 2026-10-20: fix separately).
- **Bobcat's store link** refuses automated checks; it opens in a browser (re-checked 2026-11-04).
- **Card 4** prints "UTILITY TRAILER 204", and the page says "Dump Trailer 2041" (decided; the code line matches; no reprint).
- **Taking a printed code dark:** making an asset private, archiving it or unpublishing its page would still do it. These remain presenter-runbook rules.

## 12. Approval items

Answer each one. Anything not approved isn't run. If 3 or 4 is refused, nothing in the cutover runs.

1. **Production migrations** `0040_qr_primary_disable_guard.sql` (`4641d9e7…`) and `0041_demo_organization_flag.sql` (`929e6878…`), pushed by you (step 1).
2. **Promotion** of commit `8f6c514` to Production (step 2).
3. **Production deletions:** the exact `remove` lists in manifest `aacca37a…`:
   - rentals 14, submissions 49, acknowledgements 10, scans 2,674;
   - re-confirmed with new numbers if the final delta only adds scans.
4. **Publication:**
   - the four pages and content versions in §5;
   - the inserts and updates in §4, including the organization's two settings;
   - the 230 files in §6.
5. **Marketing:** apply patch `1145a511…` to getmulemark.com and deploy straight after step 9. This includes the new trailer caption "On the tongue rail".
6. **Live-review email:** the review's support request and damage report notify `support@mulemark.io`.

## 13. As run

Approved on 2026-11-20 at 22:28 UTC: "Approve 1–6 as revised, include later scans, caption OK". The revisions moved the pushes and deletions from the operator to me; the operator kept the promotion and the owner switches ([WORK_LOG.md](WORK_LOG.md), "Approval" to "Close-out").

| UTC | Step (§10) | Who | Result |
|---|---|---|---|
| 11-20 | 6. Database URL | Operator | Added before the dry run, because item 1 now used it. Read-only identity checks pass |
| 11-20 22:36 | Dry run | Me | ACCEPTED. §4 plus the visitor scans since 11-04 (2,710 to remove); 228 files; 70 ledger rows |
| 11-21 06:34 | 1. Migrations (item 1) | Me | Only 0040 and 0041, through `--db-url`, with no relink. `migration list` shows 0001–0041 |
| 11-21 ~07:07 | 2. Promotion (item 2) | Operator | `8f6c514` serves Production on both hosts; smoke and health pass |
| 11-23 16:26 | 3. Suspend | Operator | |
| 16:28–16:44 | 4. Archive | Me | `northridge-production-20261123T162851Z`, verified; the USB copy verified |
| 16:30 | 5. Final delta | Me | ACCEPTED. Only 5 more scans (2,715 in all), covered by "include later scans" |
| 16:45–16:48 | 7. Stage and apply (items 3 and 4) | Me | 228 files uploaded; one transaction; CONVERGED |
| 16:53 | 8. Demo plan, then reactivate | Operator | Northridge offline 27 minutes |
| 16:54–16:56 | 9. Verify | Me | Everything passes (WORK_LOG, "Verification") |
| 16:56–19:08 | 10. Marketing (item 5) | Me | First deployment blocked (author email). Re-authored as `0a4fcae`, live at 19:08; 24/24 live checks pass |
| 17:02–18:42 | 12. Live review (item 6) | Operator | 4 cards, 10 scans; one support request, so one email |
| 19:10 | 12. Presenter reset | Me | The review's request removed by id; CONVERGED |
| 19:13 | 11. Delete the env file | Me | Deleted |
| 20:59 | 10. Marketing line endings | Me | On the operator's "replace it", `2c54323` (the same commit, LF) replaced `0a4fcae`; live at 21:00; 24/24 pass |

**Differences from sections 1–12:**
- **History anchor:** 2026-11-20 13:00 UTC instead of 2026-11-03, following the operator's "apply from today's date". The dataset is `b8c7c60b…`, committed in `eec17a3`, with the same 92 / 179 / 55 / 700 rows.
- **Counts:**
  - scans removed: 2,715, not 2,674;
  - files staged: 228, not 230 (the re-anchored history has 224 evidence images);
  - digest ledger: 73 rows, all kept.
- **A fix before the apply:** the Production apply would not have staged the files. Fixed in `1b394fb` and checked before the apply.
- **Order:** the env file was deleted after the live review, because the presenter reset needs it.
- **Live review:** the support request only. The operator skipped the damage report with a photo, so one email went out, not two.
- **Marketing:** the site trailed the app by 2 h 15 min (16:53 → 19:08), not minutes. That commit, `0a4fcae`, carried CRLF line endings in 13 text files; `2c54323`, the approved patch's exact tree, replaced it at 20:59.

**Results:**
- The four printed routes are unchanged (all 12 QR rows identical to the archive). They open the four showcase machines, each with its cover and credit, its manual links and the demo notice.
- Northridge is active on the Demo plan. The history is anchored 2026-11-20, the curated rentals are on rent and the curated items are as authored.
- getmulemark.com names and shows the same four machines.
- **Rollback point:** that archive, with the applied manifest and dataset (§9).

**Open** (none blocks the showcase):
- Reset the Production database password (Supabase → Project Settings → Database).
- A damage report with a photo hasn't been tried on Production since the release.
