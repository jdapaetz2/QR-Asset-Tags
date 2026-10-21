# Demo refresh policy (Engineering Phase E2B)

The showcase history ([SHOWCASE_STORIES.md](SHOWCASE_STORIES.md)) is a fixed snapshot as of one **anchor**: 06:00 Vancouver time on a chosen date. Nothing moves its dates on startup, on deploy or on a timer. A refresh is an explicit, owner-run operation that produces a **new snapshot** and applies it with a reviewed plan.

## When to refresh

- When the history looks stale in a demo (the 7-day analytics are empty, the queue says "Waiting 400h"); roughly monthly if demos are frequent.
- At E2C, which builds the history for the cutover date.
- Never automatically, and never on Production before E2C.

## How

1. **Choose the anchor date D.** It must be in the past, and on the target the 6 AM digest of D must have run successfully. Apply at or after 07:00 Pacific on D; the planner refuses earlier, because that morning's run may still be in progress.
2. **Build the new snapshot:**
   ```
   npm run phase-e:showcase:build -- --anchor=D
   ```
   This rewrites `docs/phase-e/showcase/dataset.json`:
   - rentals and records keep their ids, and their dates move with the anchor;
   - rows only the old version had are listed under `retired_ids`, and the refresh deletes them.
   Review the diff. `npm test` must pass (the dataset test rebuilds it and checks every invariant). Commit it as its own change.
3. **Apply it** to the target that holds the previous version:
   ```
   npm.cmd run phase-e:reset:<target> -- manifest --kind=refresh --org=11111111-1111-4111-8111-111111111111 --out=<folder>\refresh.json
   npm.cmd run phase-e:reset:<target> -- plan --manifest=<folder>\refresh.json
   npm.cmd run phase-e:reset:<target> -- apply --manifest=<folder>\refresh.json --approved-plan=<folder>\refresh.plan.json
   ```
   The manifest is composed from the live rows when you dry-run it, and again inside the apply's locked transaction. A visitor's report filed in between is kept.

## Time rules (enforced by the planner and the builder)

| Rule | Why |
|---|---|
| Every synthetic timestamp is at or before the anchor, never in the future | Nothing claims to have happened after "now" |
| Events fall between 06:00 and 21:00 local | Avoids the repeated hour when clocks fall back |
| No rental starts before its asset and QR tag existed | Production creation dates are respected |
| Every return checklist is at or before the digest watermark | The next 6 AM digest would otherwise summarize it as a new return |
| Apply only at or after 07:00 Pacific on the anchor date | The anchor's own digest run must have finished |
| One rental at a time per asset; a display reference (`RNT-` / `SUB-`) is never shared | Coherent rentals; references that open exactly one record |

## What never moves

- **Real visitor rows:**
  - scans, reports and acknowledgements that are not the dataset's;
  - the refresh changes or deletes only dataset rows, by id, and the four rental pointers.
- **The rest of Northridge:**
  - QR rows and the four protected routes;
  - profiles;
  - the digest ledger;
  - organization settings;
  - the E2A content: pages, documents and covers.
- **The previous snapshot:** it stays in Git history. To go back, rebuild with its anchor (or check out its `dataset.json`) and refresh to it.

## Presenter reset is not a refresh

A presenter reset ([PRESENTER_RUNBOOK.md](PRESENTER_RUNBOOK.md)) restores the **same** snapshot after a demo. A refresh moves to a **new** one. Both touch only dataset rows, the four pointers and exact ids you name.
