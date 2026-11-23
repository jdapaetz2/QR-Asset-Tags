# Presenter cheat sheet (E2C)

One page for a call. The procedures are in [PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md), and every record below is described in [SHOWCASE_STORIES.md](SHOWCASE_STORIES.md). No credentials here: use your own private Northridge demo login.

## Before the call (2 minutes)

1. Run `npm.cmd run phase-e:precall:production`. It should say **ready**.
2. Sign in at mulemark.io with your demo login. Keep **Users** and **Settings** closed while presenting.
3. Have the four cards and your phone.

## The four entry points

| Card | Code | Machine | Story | One line |
|---|---|---|---|---|
| EXCAVATOR-017 | `demo-ex017` | Bobcat E20 compact excavator, **on rent** | The handoff: manual, safety rules, a live acknowledgement | The renter has the right machine's manual and rules on their phone |
| EXCAVATOR-3015 | `ezzs9ueg` | Cat 301.5 mini excavator, available | Connected evidence: a leak traced to the rental where it started | Outbound, renter and staff evidence line up per rental |
| TRAILER-014 | `demo-tr014` | Big Tex 35SA utility trailer, available | Accessories: what went out has to come back | The pins were issued at outbound and missing at return |
| TRAILER-2041 | `67uqc3q7` | Big Tex 14LP dump trailer, **on rent** | Support: the renter tried the page's step, then asked for help | The yard sees exactly what was tried |

Other ways in:
- **Laptop:** the website's demo page (getmulemark.com/demo) opens the same four pages.
- **Dashboard:** signed in, the queue starts from the four open items.

## Three lengths

**90 seconds (one machine):**
1. Scan TRAILER-2041.
2. Troubleshooting: "Hoist won't lift: unload some by hand, then use Request Support."
3. Dashboard: open `SUB-2026-411EEB`.

**5 minutes (two machines):**
1. **EXCAVATOR-3015:** the red queue item → `RNT-2026-39076F` → hydraulics Pass at outbound, Fail at return → `SUB-2026-D9B79F`.
2. **TRAILER-014:** scan → cover and quick start → `RNT-2026-AC3506` (pins missing) → the clean `RNT-2026-B3F1B8`.

**15 minutes (all four, in this order):**
1. **017:** scan, acknowledge live, `RNT-2026-7234CF`, the reviewed question `SUB-2026-462E2D`.
2. **3015:** the leak rental `RNT-2026-39076F`, the renter's report `SUB-2026-05342A`, the clean `RNT-2026-779060`.
3. **014:** `RNT-2026-AC3506`, the straps case `SUB-2026-66A6B7`, the tail lamp `SUB-2026-1B8D14`.
4. **2041:** `SUB-2026-411EEB`. Optional, live: a return checklist from the scan page, then **Mark returned & resolve**.

Close on Analytics with the 30- or 90-day range.

## Say it plainly

- Every page ends with a demo notice: real models and reference documents; a fictional company, equipment and history.
- No page offers a Start-Up Guide (parked). The E20's Manual link opens Bobcat's store, and the Cat page has no Safety section.
- The support phone can't be dialled. Email and Request Support work.
- Analytics lists every machine under "repeated reports", and "Came with photos" counts all records.
- 3015 shows available while its leak is open. There's no hold; the queue keeps it visible.
- "Waiting Nh" grows after the anchor, and the 7-day analytics empty out weeks later. Refresh the history then ([DEMO_REFRESH_POLICY.md](DEMO_REFRESH_POLICY.md)).
- Some touch targets on public pages are under 44 px, on every tenant's pages. A separate fix.
- Card 4's title says "Utility Trailer 204"; the page names the real model.

## After the call

A live form is a real record, and it emails `support@mulemark.io`. To take it out of the curated views, run the presenter reset with its id ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md#after-the-bounded-presenter-reset)). The pre-call check lists visitor rows since the anchor.
