# Canonical showcase fleet (Engineering Phase E0)

**Status:** written 2026-10-14; **approved 2026-10-16** (grouped approval items 1–3 in [DECISIONS.md](DECISIONS.md)). The OMM purchase still needs an explicit cost confirmation.

Inputs:
- [PROTECTED_DEMO_ROUTES.md](PROTECTED_DEMO_ROUTES.md) — routes are immutable;
- the read-only Production inventory `showcase-audit-production-northridge-20261014T203533Z.json` (sha256 `62e19f56…960f7d`, gitignored);
- bounded OEM and licence research, at most about two authoritative sources per question.

Machine-readable boundary: [`manifests/northridge-archive-boundary.json`](manifests/northridge-archive-boundary.json).

Nothing here has been applied. E2A authors content, E2B builds the dataset, and E2C performs the approved cutover.

## 1. What Northridge actually holds today (Production)

Northridge (`11111111-1111-4111-8111-111111111111`) is **not** a four-asset demo. It is the accumulated test org of Waves 1–D5.

| | Count | Notes |
|---|---|---|
| Assets | 11 | The 4 showcase codes, plus COMPACTOR-003, GEN-008, TEST-001, METER-204, WSHR-001 and the archived GENERATOR 12/13 |
| QR rows | 12 | All active primaries except `demo-comp003`, which is disabled and superseded by `demo-comp004` on 2026-07-12 |
| Scan events | 3,182 | Mostly June–July test traffic: 740 on `demo-ex017` in June, 751 on `ezzs9ueg` in July, 365 on `demo-gen008` in July. 124 in the last 30 days across the four printed codes |
| Pages | 11 | 10 published. TEST-001 is published with test copy |
| Documents | 6 | 5 hosted files (15.9 MB) of unknown provenance and rights; 1 private external link |
| Rental sessions | 18 | 5 still open (COMPACTOR-003, EXCAVATOR-3015, GEN-008, TEST-001, TRAILER-014). One returned session ran 0 h, another 455 h |
| Submissions | 49 | 40 public, 9 staff. 29 with photos (54 media references, **7 pointing at objects that no longer exist**). Submitter addresses: 38 outside the test domains, 2 mulemark, 9 none |
| Acknowledgements | 10 | Names and addresses present (personal data) |
| Profiles | 1 | One active `customer_admin`: Josh's Northridge demo login |
| Tag requests | 4 | QA records at `in_production`, `ready` and `in_review` (×2) |
| Summary ledger | 33 | All `skipped_quiet`, daily from 2026-09-12. These rows are the digest **watermark** |
| activity_log | 0 | Never written by the app |
| Storage under `org/<id>/` | 53 objects / 23.1 MB | submissions 47 (7.1 MB); documents 5 (15.9 MB); public-assets 1 cover (0.07 MB) |

### Organization settings that affect the showcase

- **Logo:** hotlinked from `www.wesgroupequipment.com`. That is a **real equipment dealer's logo** shown as the brand of the fictional "Northridge Rentals". Replace it with owned fictional artwork before anything else is polished.
- **Support phone:** `+1-555-1122` has only 8 digits, so it cannot be dialled.
- **Support and notification email:** `support@mulemark.io`.
- **"Powered by" label:** still the pre-rename "Powered by AssetTag QR".
- **Return mode:** `instant_renter`. Every real visitor's damage or support report emails the support inbox.

## 2. Mismatch register

| Code (route) | Production record | Marketing site | Seed / migration history | Photo in use | Manual in use | Conflict |
|---|---|---|---|---|---|---|
| EXCAVATOR-017 (`demo-ex017`) | "Excavator 017", category "Excavator", Kubota U17, 2022, serial `KBU17-2022-0417` | Bobcat E20 photo on `/equipment-tags` (CC BY-SA 4.0, TaurusEmerald); label EXCAVATOR-017 on `/demo` | Seed row …101; 0004 renamed it | Hotlinked dealer image (`cdn.dealerspike.com`), rights unknown | Hosted PDF "Kubota U17-3 Manual", 2.08 MB, provenance and rights unknown | **Brand and model** (Kubota vs Bobcat). The page cites an unsourced "10 degrees or 18% grade" |
| EXCAVATOR-3015 (`ezzs9ueg`) | "Mini Excavator 301.5", Cat 301.5, 2022, no serial | QR and label only | Created 2026-06-23 by hand | Hotlinked Cat marketing image (`s7d2.scene7.com`), rights unknown | Hosted PDF "Manual", 8.0 MB, provenance and rights unknown | **Model unproven**: "3015" is a label, and no document establishes the configuration |
| TRAILER-014 (`demo-tr014`) | "Trailer 014", Utility Trailer, Big Tex 35SA, 2021, serial `BTX35SA-2021-0014` | Twister **enclosed cargo** trailer photo (CC BY 4.0, Gorillaphotog; no model stated) | Began as the seed scissor lift; 0004 repurposed it | Hotlinked Big Tex product image (S3), rights unknown | None | **Category**: open utility trailer vs enclosed cargo trailer |
| TRAILER-2041 (`67uqc3q7`) | "Utility Trailer 204" (name ≠ code), make "Snake River Trailers", model "2041" (the asset number) | QR and label only | Created 2026-06-23 by hand | Hotlinked image of an **8-wide 20K dump trailer** (`snakerivertrailers.com`), rights unknown | None | **Name, model and category** (utility vs dump) |

Other rules the content must follow:
- Every serial above is fictional but lacks the brief's mandatory `DEMO-` prefix.
- Asset codes are labels, not evidence of make, model or year.

## 3. Recommended identities (one per code)

**Priority order:**
1. exact photo, model, manual and control-configuration consistency;
2. lawful, durable manual source;
3. four distinct stories;
4. limited production effort.

**Manual rights default:** link to the OEM's official copy. Host a copy only with written OEM permission. Public availability is not a redistribution licence. A purchased manual may be read for private source preparation, never redistributed.

### EXCAVATOR-017 → **Bobcat E20** compact excavator

| | |
|---|---|
| Why | The only candidate with an **exact-model, licensed photo already published next to this code**. Choosing it makes the marketing site truthful without touching its artwork |
| Authoritative model source | Bobcat model literature (OEM); the exact configuration is confirmed from the OMM |
| Operator manual | Operation & Maintenance Manual **P/N 7255004** (ENUS; a French-Canada edition 7255004FRCA exists), for serial **B3BL11001 and above**. Sold through Bobcat dealers and resellers, about US$35–66; **no free official copy found** |
| Link or host | Link to Bobcat's official channel. **No hosting** without Bobcat permission |
| Photo | Wikimedia Commons, TaurusEmerald, 2024-08-22, **CC BY-SA 4.0**. On-page attribution is required, and the public page has no attribution field (additive need). Edits and crops are themselves CC BY-SA |
| Open configuration | Canopy or cab; whether a control-pattern selector is fitted; arm length; buckets and thumb; which serial range the yard "owns" |
| Approval needed | **Cost decision**: buy one OMM for private source preparation (E2A) |
| Alternative | Kubota U17-3, only if the purchase is declined. No licensed exact-model photo exists (none on Commons; dealer images are copyrighted) and no free official manual was found, so it is weaker on priorities 1 and 2 and would also force a marketing-photo change |

### EXCAVATOR-3015 → **Caterpillar 301.5** mini excavator (current generation, C1.1 engine)

| | |
|---|---|
| Why | Matches the current Production record and page. A public-domain exact-model photo exists |
| Authoritative model source | cat.com 301.5 product page (OEM). Identified in E0; the fetch timed out, so the C1.1 engine and 21 hp come from search summaries and **E2A reads the page itself** |
| Operator manual | Cat Operation and Maintenance Manual (SEBU number **not established in E0**). Cat publications are sold or dealer-supplied; no free official copy found. The hosted 8.0 MB "Manual" has unknown provenance and must not stay public on that basis |
| Link or host | Link to the official Cat channel. No hosting without Caterpillar permission |
| Photo | Commons "A small Cat vehicle in Bay Shore, NY - July 2024.jpg", 4032×3024, **CC0** (LostplanetKD73). **Generation must be checked visually in E2A.** The 2007 and 2013 Commons photos show earlier generations and must not be used |
| Open configuration | Canopy or cab; blade; auxiliary hydraulics; serial range for the OMM |
| Approval needed | **Cost decision**: buy one OMM, same as above |
| Alternative | None needed. If the CC0 photo turns out to be an older generation, use an owned photo |

### TRAILER-014 → **Big Tex 35SA** single-axle utility trailer (35SA-12 proposed)

| | |
|---|---|
| Why | Matches the Production record and the app's own history. The OEM publishes free owner documentation. It is the simplest unit for accessory accountability |
| Authoritative model source | bigtextrailers.com/trailer/35sa: 35SA-10/12/14; 2,995 lb GVWR; 3,500 lb axle; 4′ 3-way ramp gate standard; electric brakes and breakaway optional; ST205/75R15 LRC |
| Operator manual | Big Tex **Owners Manual (2020)**, `…/2023/11/Big-Tex-Trailers_Owners-Manual_2020.pdf`, 4,298,192 bytes, Last-Modified 2025-03-20. Plus the wiring diagram (1,506,020 bytes) and plug contacts (1,009,430 bytes). Headers only were read; content is read in E2A |
| Link or host | **Link.** The page states no redistribution terms (© Big Tex Trailer Manufacturing, LLC); hosting needs written permission |
| Photo | **None licensed found.** The marketing site's Twister photo shows a different trailer category and **must be replaced on the marketing site** (operator's marketing tool) with an owned or permitted 35SA photo |
| Open configuration | Length (10/12/14); brakes fitted or not; gate type; which straps, pins or spare the yard issues (customer policy, not OEM) |
| Approval needed | Operator supplies an owned photo or obtains Big Tex permission |
| Alternative | None. An enclosed cargo trailer fails priority 1 because the photo states no model |

### TRAILER-2041 → **Big Tex 14LP** ultra-low-profile dump trailer (14LP-14 proposed)

| | |
|---|---|
| Why | The record's own photo and history point to a dump trailer. Big Tex publishes **dump-trailer and hoist manuals**, which give a real support story. One OEM document family serves both trailers, so the same verified revision is reused (an E4A deduplication case) |
| Authoritative model source | bigtextrailers.com/trailer/14lp: 14,000 lb GVWR; 2 × 7,000 lb axles; electric brakes both axles; breakaway; 12 V deep-cycle battery; 5 A 110 V onboard charger; power up/down hydraulic pump; tarp |
| Operator manual | Big Tex **Owners Manual (Dump Trailers)**, `…/Big-Tex-Trailers_Owners-Manual_2020-Dump-Trailers-2.pdf`, 5,721,256 bytes. **Hoist Manual**, `…/2023/07/hoist-manual.pdf`, 27,312,771 bytes. Both Last-Modified 2025-03 |
| Link or host | **Link**, as above |
| Photo | None licensed found: owned photo or OEM permission |
| Content changes in E2C | Name "Utility Trailer 204" → "Dump Trailer 2041"; make and model → Big Tex 14LP; category → Dump Trailer; return template `utility_trailer` (it already lists dump trailers) |
| Open configuration | Length; whether the wireless or solar remote is standard or optional (the OEM page is ambiguous); ramp package fitted; drop axles |
| Approval needed | Operator photo or permission, plus approval of the identity change |
| Alternative | A Big Tex equipment trailer (for example 14ET), only if a dump trailer is unwanted. Not researched in E0 |

Two mini excavators and two trailers, as targeted. The protected routes, row ids and codes are unchanged.

## 4. One primary story per asset

| Asset | Story | Beats (each uses an existing feature) |
|---|---|---|
| EXCAVATOR-017 · Bobcat E20 | **Guidance and handoff** | Renter scans, sees a source-cited quick start with original pictographic artwork (E2A, reviewed against the OMM), and acknowledges. Staff record an outbound baseline. Renter support question answered by pointing to the guide. Clean returns dominate |
| EXCAVATOR-3015 · Cat 301.5 | **Condition evidence** | Outbound baseline photos, then a return checklist flags new damage with photos, then staff review and resolve. One renter damage report **with no photo**. The evidence shows *when* something was recorded, never *who* caused it |
| TRAILER-014 · Big Tex 35SA | **Accessories and returns** | Outbound issues straps, chains, pins and the spare; the return checklist marks straps *missing* (`lib/inspections/accessories.ts`). Follow-up, then resolved. Repeat renters, short turnarounds |
| TRAILER-2041 · Big Tex 14LP | **Operational support on simpler equipment** | Renter support requests ("box won't raise" → charge battery or check the remote per the OEM dump and hoist manuals; "lights out" → plug contacts). Most are resolved; one is **pending** at the anchor |

## 5. History design (E2B builds it, deterministic, in isolation first)

**Window:** 105 days ending at the cutover anchor `A`, in America/Vancouver local time.
- There is no org timezone column; the digest already pins `America/Vancouver` in `lib/notifications/digest-window.ts:11`.
- Rentals start 07:00–10:00 and return 15:00–18:00, with lighter weekends (trailers rent on Saturdays).
- Per asset, sessions are strictly sequential with at least 2 h turnaround, so there is no overlap and no impossible movement.

**Provisional volume** (synthetic targets, not benchmarks): 90 completed rentals.

| Asset | Completed | Mix (count × duration) | Days on rent | Utilization over 105 d |
|---|---|---|---|---|
| EXCAVATOR-017 | 24 | 10×1 d, 8×2–3 d (avg 2.5), 4×5 d, 2×7 d | 10+20+20+14 = 64 | 61% |
| EXCAVATOR-3015 | 20 | 6×1 d, 8×2–3 d (avg 2.5), 4×5 d, 2×10 d | 6+20+20+20 = 66 | 63% |
| TRAILER-014 | 30 | 14×same-day (about 8 h), 10×1 d, 4×2–3 d (avg 2.5), 2×7 d | 4.7+10+10+14 ≈ 39 | 37% |
| TRAILER-2041 | 16 | 6×1 d, 6×2–3 d (avg 2.5), 4×5 d | 6+15+20 = 41 | 39% |

**At the anchor:**
- **EXCAVATOR-017 is on rent** (started A−1, a 3-day job). This is the live renter-acknowledgement and staff-return demo.
- **TRAILER-2041 is on rent** with one pending support request.
- **EXCAVATOR-3015 and TRAILER-014 are available.** These are the live staff-outbound demo.
- Live demos then create real rows (the "demo interaction" class below). E1/E2 tooling must be able to restore the anchor state from the archive and manifest.

**Per completed rental** (rates chosen to show honest edges, not perfection):

| Record | Rate |
|---|---|
| Staff outbound baseline | about 70% |
| Renter acknowledgement | about 60% |
| Staff return checklist | about 85% (some returns are never checked) |
| Public renter return | about 20% |

**Exceptions:**
- about 12 damage reports, 3 of them without photos;
- about 8 support requests;
- missing-accessory returns on TRAILER-014.

At the anchor, about 3 items are `new` and 2 `reviewed`; the rest are resolved or archived. Repeat renters come from a small fictional renter pool (labelled demo names; `example`-domain or no addresses).

**Scans:** about 6–10 per rental (staff and renter), plus occasional browsing. That gives roughly 700 synthetic scans, attached to the protected QR rows.

**Media:**
- owned photos of the actual models, or clearly labelled illustrations;
- never generated "incident photographs" or fabricated control close-ups.

**Serials:** `DEMO-` prefixed.

### How backdated rows get inserted

App RPCs cannot backdate:
- `start_outbound_rental` and `complete_staff_return` stamp `now()` (`0028_staff_return.sql:285`).
- The `set_return_submission_session` insert trigger (`0028:57-95`) forces service-role inserts to `submission_origin='public'`. It binds return and outbound rows to the asset's *current* session and nulls `rental_session_id` on damage and support rows.

No UPDATE trigger exists. So the E2B loader runs **per asset, chronologically**, as the service role:
1. insert the session (explicit `started_at`);
2. point `assets.active_rental_session_id` at it;
3. insert the outbound and return rows (the trigger binds the session);
4. `UPDATE` origin, actor (a demo staff profile) and `created_at` on those synthetic rows only;
5. close the session with an explicit `returned_at`;
6. clear the pointer.

Further rules:
- **IDs** are random v4 values generated once and **pinned in a tracked synthetic manifest**, never patterned. Patterned ids duplicate `SUB-`/`RNT-` references, which use the first 6 hex characters.
- The manifest **is** the marker. No marker column exists, so nothing is displayed or exported.
- **Notification safety:**
  - Direct inserts send nothing; email lives in server actions.
  - The loader refuses to run if any synthetic `created_at` is later than the org's digest watermark (latest `sent`/`skipped_quiet` `window_end`), so no summary ever picks them up.
  - **Never delete `notification_digest_runs` rows.** That would move the watermark back.
- If a cleaner path is preferred, the alternative is an additive, org-allowlisted `SECURITY DEFINER` loader function. That is a migration and needs separate approval.

## 6. Data classes

| Class | What it is | How it is identified | Retention | Claims |
|---|---|---|---|---|
| **Authored synthetic baseline** | E2B rows: sessions, submissions, acknowledgements, scans, media | Membership in the tracked synthetic manifest (pinned ids and hashes) | Rebuildable from the manifest; never mixed into archives of real data | Never used as evidence of anything; labelled demo |
| **Real public demo interactions** | Rows created by real people through the protected routes after cutover (card recipients, prospects, live demos) | Not in the synthetic manifest, created after the cutover anchor in Northridge, outside the QA list | Kept; personal data treated like customer data (private, never in Git); reviewed before any later reset | Not adoption metrics. Scan totals include crawlers |
| **Technical QA** | Test traffic and records | Before cutover: all existing Northridge activity (archived). After cutover: rows in the QA orgs only | Archive outside Git; QA orgs are disposable | Never shown as demo or customer evidence |

Exception found: real-visitor data may already sit in the existing history.
- One public EXCAVATOR-017 submission (2026-10-08) post-dates the marketing launch.
- 38 submissions and most acknowledgements carry addresses outside the test domains. Telling the operator's own test addresses from visitors' would mean reading personal data, which E0 did not do.

All of it is **archived with restricted access, never casually deleted**, and the post-launch rows are flagged for operator review.

## 7. What the demo does not prove

It does not prove any of the following:
- return on investment or labour saved;
- accidents or injuries avoided;
- who caused damage (evidence timestamps are not fault);
- real customer adoption, scan or submission rates, or staff response times;
- that renters read or understood guidance (an acknowledgement is not an e-signature or comprehension test);
- compliance or legal enforceability.

It shows no unsupported features: work orders, operational holds, payments, manual-open analytics, assignments or verified safety releases.

## 8. Archive and reset boundary

**Recommendation:** preserve the Northridge organization and every protected id **in place**. Archive all existing activity, with Storage bytes and hashes, outside Git. Rebuild only the approved demo content and history.

| Entity | Rows now | Decision |
|---|---|---|
| Organization `11111111…` | 1 | **KEEP** row and id. REBUILD settings: owned fictional logo; dialable or clearly fictional (555-01XX) support number (operator choice); "Powered by" label; keep `support@mulemark.io` and `instant_renter` unless changed by decision |
| 4 showcase assets | 4 | **KEEP** rows, ids and codes. REBUILD content per §3 (name, make, model, `DEMO-` serial, year, category, cover, template) |
| 7 other assets | 7 | **KEEP** rows. App-level archive (`archived_at`, reversible) in E2C *only if* the operator confirms none of their codes were printed (July sheet, tag requests). Otherwise keep them resolving and tidy them |
| QR rows (including disabled `demo-comp003`) | 12 | **KEEP all unchanged.** No rotation, no status change |
| Equipment pages | 11 | ARCHIVE content. REBUILD the 4 showcase pages (E2A). Others follow their asset's decision |
| Documents (rows) | 6 | ARCHIVE. Make the 5 unknown-rights hosted files non-public at cutover. REBUILD showcase manual references as official links |
| Custom page template `excavator_large` | 1 | KEEP (org configuration) |
| Rental sessions | 18 (5 open) | ARCHIVE. Open sessions closed or removed in the cutover; REBUILD synthetic |
| Submissions | 49 | ARCHIVE, restricted. Post-launch rows flagged for review. REBUILD synthetic |
| Acknowledgements | 10 | ARCHIVE, restricted (personal data) |
| Scan events | 3,182 | ARCHIVE (exact export). Removal from the live org only with an exact-id deletion approval, otherwise kept |
| Tag requests (+6 asset links) | 4 | ARCHIVE. A demo tag request may be rebuilt in E2B |
| Summary ledger | 33 | **KEEP, never delete** (watermark) |
| Profile (`customer_admin`) and auth user | 1 | **KEEP.** Josh's demo login. One address belongs to one org, so it cannot also join the QA orgs. No public or shared credentials |
| activity_log | 0 | — |
| Storage (`org/<id>/`) | 53 objects / 23.1 MB | ARCHIVE every object with SHA-256. Deleting any Production object needs separate approval. 7 dangling submission references are recorded as found |

**Recovery rule** (brief): a database dump is not a Storage backup, and there are no database backups on the Free plan. **No recovery rehearsal means no destructive cutover.** E1 builds and rehearses the archive and restore in isolation.

**QA separation:**
- Future **destructive** QA runs in staging QA org A (`5ac00000-…57a610`: 3 assets, 89 submissions) and B (`5ac00000-…57a620`: 1 asset). Both already exist, so no new infrastructure.
- The Production QA org (`c0000000-…c0a1`: 1 asset, 104 submissions, 129 MB of photos) stays limited to allowlisted, non-destructive Production checks.
- Northridge stops being used for QA at cutover.

**Credential exposure check (2026-10-14):** a pattern sweep of `docs/` and the marketing repository found no keys, tokens or passwords. The docs reference env-var names and ignored files only, and the Production QA login is a reserved `.invalid` address.
