# Showcase stories (Engineering Phase E2B)

Northridge Rentals is the fictional showcase tenant. E2B gives its four canonical assets a coherent, synthetic rental history, so the real app is worth exploring in a demo. Everything in it is fictional: people, companies, phone numbers (555-01XX), emails (`.example`), serials and rental references (`DEMO-`).

- **Source:** `docs/phase-e/showcase/scenario.json` (authored) → `docs/phase-e/showcase/dataset.json` (built by `npm run phase-e:showcase:build`, using the app's own inspection, triage and scan code).
- **As of:** 06:00 Vancouver time on the anchor date. That is a daily-digest cutoff, and nothing in the history is later than it.
- **This rehearsal:** the tracked dataset is anchored at **2026-10-20 06:00 PDT**. E2C rebuilds it for the cutover date ([DEMO_REFRESH_POLICY.md](DEMO_REFRESH_POLICY.md)). Rental and submission ids stay the same; dates, and the year in a reference, follow the new anchor.
- **References below** are the ones the app shows: `RNT-…` for a rental, `SUB-…` for a submission. Paste an `RNT-` reference into the search on **Rentals**, or either kind into the search on an asset's **Timeline**.

## At the anchor

| | EXCAVATOR-017 | EXCAVATOR-3015 | TRAILER-014 | TRAILER-2041 |
|---|---|---|---|---|
| Machine | Bobcat E20 (canopy) | Cat 301.5 (canopy) | Big Tex 35SA-12 utility | Big Tex 14LP-14 dump |
| Rentals | 24 done, **on rent** | 20 done, available | 30 done (14 same-day), available | 16 done, **on rent** |
| Open items | 1 reviewed | 1 reviewed, 1 new | 1 new | 1 new |

The dashboard queue at the anchor, in the app's own order:
1. **EXCAVATOR-3015**: Unresolved damage on an available asset (red).
2. **TRAILER-014**: Return reports damage or missing items.
3. **EXCAVATOR-017**: 1 open submission.
4. **TRAILER-2041**: 1 open submission.

After 24 hours the last two read "Waiting Nh without a response". That is real app behaviour, not a data problem ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md)).

**Totals:**
- 92 rentals: 64 outbound inspections, 77 staff returns, 18 renter returns;
- 55 acknowledgements;
- 12 damage reports and 8 support requests;
- 700 scans.

At the anchor, 3 items are `new` and 2 `reviewed`; everything else is resolved or archived.

---

## 1. EXCAVATOR-017: the pictographic handoff, the manual, a live acknowledgement

**The point:** the renter has the right guide and manual on their phone, and support is one tap away.

**90 seconds:**
1. Scan the tag (`demo-ex017`). The page shows the E20, the **Start-Up Guide**, the **Manual** link and the acknowledgement prompt for the active rental.
2. Acknowledge on your phone, live.
3. Open the dashboard. 017 is on rent, with one open question.

**5 minutes:**
1. On the scan page, open the Start-Up Guide (pictures, one line per step).
2. Acknowledge live.
3. Send a support request from the page.
4. In the dashboard, open the active rental `RNT-2026-7234CF`:
   - the outbound inspection with its photos;
   - the renter's acknowledgement (`Priya Natarajan (demo)`);
   - your own acknowledgement.
5. Open the reviewed question `SUB-2026-462E2D`. The crew asked for the start-up steps on a phone, and the answer is the guide link on the page.
6. Close with the previous clean rental `RNT-2026-F447B4`: outbound and staff return, both clean, with photos.

| Record | Opens |
|---|---|
| `RNT-2026-7234CF` | Active rental (Harlow Excavating, `DEMO-41297`, out Mon 07:32): outbound `SUB-2026-1B0F0A` with photos, renter acknowledgement |
| `SUB-2026-462E2D` | Current follow-up: operating question, **reviewed** |
| `RNT-2026-F447B4` | Current clean result: outbound `SUB-2026-F26D09`, staff return `SUB-2026-ACFB70` |
| `SUB-2026-60F519` | Older resolved case: a track off on soft ground, help needed now |

**Depends on E2A:** the E20 Start-Up Guide is still `REVIEW_REQUIRED`, and its quick-start text waits for Bobcat's manual. Rehearsal targets show the draft; Production shows it only after approval.

## 2. EXCAVATOR-3015: connected condition evidence, a minor and a consequential issue

**The point:** outbound, renter and staff evidence line up per rental, so an issue is traceable to the rental where it started.

**90 seconds:**
1. On the dashboard, the top (red) item: unresolved damage on an available 3015.
2. Open the leak rental `RNT-2026-39076F`. Hydraulics were Pass at outbound and Fail at return, with the weeping-fitting illustration.

**5 minutes:**
1. Open the renter's report `SUB-2026-05342A` (reviewed): "Oil dripping under the boom…". It is a valid report without a photo.
2. Open the staff return `SUB-2026-D9B79F` (new): a weeping fitting at the boom cylinder.
3. On the rental's evidence page, compare the columns.
4. The minor issue, earlier: `SUB-2026-BC1490`, a worn bucket tooth with a photo, resolved.
5. The clean counterpart: `RNT-2026-779060` with all three sources. The renter's own return (`SUB-2026-F2B3EC`, with a photo) sits beside the outbound and the staff return.

| Record | Opens |
|---|---|
| `RNT-2026-39076F` | The consequential issue: Summit Drainage, `DEMO-41294`, Thu 07:39 → Sun 16:42 |
| `SUB-2026-D9B79F` | Current follow-up: staff return, damage observed, **new** |
| `SUB-2026-05342A` | The renter's first report, **reviewed** (no photo) |
| `SUB-2026-BC1490` | The minor issue: worn tooth, photo, resolved |
| `RNT-2026-779060` | Current clean result: outbound `SUB-2026-34A1B3`, renter return `SUB-2026-F2B3EC`, staff return `SUB-2026-319F9A` |

**Honest limit:** the app has no "hold" for returned equipment. 3015 shows as available, and the queue keeps the issue in front of the yard until someone resolves it.

## 3. TRAILER-014: accessory accountability

**The point:** what went out is what has to come back. Lights, coupler, gate and chains are checked at every handoff.

**90 seconds:**
1. On the dashboard: "Return reports damage or missing items" for 014.
2. Open `RNT-2026-AC3506`. The safety-chain pins were issued at outbound and are missing at return.

**5 minutes:**
1. Show the scan page: the 35SA-12 guide, and the 2-inch ball and towing facts from Big Tex's page.
2. Open the clean rental `RNT-2026-B3F1B8`: every accessory issued and returned, with the hitch and deck pictures.
3. Open the resolved missing-item case `SUB-2026-357550` (straps), resolved after the renter brought them back.
4. Show `SUB-2026-1B8D14`: a cracked tail-lamp lens the staff found at return, with an illustration, resolved.
5. Show a late report, `SUB-2026-2D2ED3`: a fender dent mentioned the morning after the return.

| Record | Opens |
|---|---|
| `RNT-2026-AC3506` | Current follow-up: Rob Sinclair, `DEMO-41298`, same day Mon. Staff return `SUB-2026-64979D` (**new**): pins missing |
| `RNT-2026-B3F1B8` | Current clean result: outbound `SUB-2026-E2671D`, staff return `SUB-2026-FE1B2C` |
| `SUB-2026-357550` | The resolved missing-item example (straps) |
| `SUB-2026-1B8D14` | Tail-lamp lens, illustration, resolved |
| `SUB-2026-2D2ED3` | A late report, resolved |

## 4. TRAILER-2041: support, troubleshooting and the return workflow

**The point:** the renter followed the page's own troubleshooting step, then asked for help. The yard sees exactly what was tried.

**90 seconds:**
1. Scan `67uqc3q7`. Troubleshooting says "Hoist won't lift: unload some by hand, then use Request Support."
2. On the dashboard, open the new request `SUB-2026-411EEB`: "Hoist stops partway up with a full load of wet soil…".

**5 minutes:**
1. Show the active rental `RNT-2026-22E520` (Grace Liu, out Sun 08:01) with its outbound photos.
2. Open the support request (new).
3. Optional, live: file a return checklist from the scan page. The queue then shows "Return checklist received while still rented"; use **Mark returned & resolve**.
4. The clean previous rental: `RNT-2026-167D13`.
5. An older case: `SUB-2026-4243E1`, a breakaway test that failed before towing, resolved.

| Record | Opens |
|---|---|
| `SUB-2026-411EEB` | Current follow-up: support request, **new** |
| `RNT-2026-22E520` | Active rental (`DEMO-41296`): outbound `SUB-2026-05EA59` |
| `RNT-2026-167D13` | Current clean result: outbound `SUB-2026-D67B3F`, staff return `SUB-2026-7A4FBA` |
| `SUB-2026-4243E1` | Breakaway test, resolved |

**Nothing invented:**
- The 14LP-14's battery-powered hoist, breakaway, 7-way plug and rear doors come from Big Tex's pages, and so do the troubleshooting lines.
- The utility-trailer checklist is the one the app assigns to this asset.

---

## Evidence images

Each image carries one small corner tag, and only that tag:
- **Illustrative photo:** the licensed E20 photo (CC BY-SA 4.0, its credit included) and the Cat 301.5 photo (CC0). They show the model, not the unit.
- **Illustration:** original drawings. One bucket for each excavator, the hitch and deck of each trailer, and three incident close-ups (tail-lamp crack, worn tooth, weeping fitting).

Every damage drawing is used for one incident only. Every other report is a valid report without photos. Rights and hashes are in `docs/phase-e/showcase/media.json`.

## What the stories do not prove

- **Acknowledgements:** they are labelled `(demo)`. They are not proof that anyone was trained or consented.
- **Returns:** a return that ends a rental does not mean the machine is mechanically safe, and the app has no operational hold.
- **The history is synthetic:** the owner report labels Northridge "Demo data · synthetic history", and none of it is customer adoption or ROI.
