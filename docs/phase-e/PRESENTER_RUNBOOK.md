# Presenter runbook (Engineering Phase E2B)

How to run a Northridge demo on the synthetic showcase history ([SHOWCASE_STORIES.md](SHOWCASE_STORIES.md)), what not to do live, and how to put the demo state back afterwards. It uses the existing organization and role model: there is no demo platform, no public admin login and no reset button in the app.

## Before a demo

- **Check the starting state.** The dashboard should show the four queue items listed in SHOWCASE_STORIES.md. If an earlier demo changed them, run the presenter reset (below).
- **Your phone is a real renter.** The acknowledgement prompt appears once per phone per rental. If you have already acknowledged on that phone during this rental, use another phone or a private browser window.
- **Live actions are real app actions.** They write rows and send the notifications Northridge's settings ask for, to the owner-controlled addresses on the organization. Never type a fictional customer's email or phone into a form, and never call a number from the history. The 555-01XX numbers are fictional.

## During: what you can do live

On the four showcase assets:
- scan a tag; open the guide, manual and safety sections;
- acknowledge;
- send a support request, a damage report or a return checklist from the scan page;
- in the dashboard: open records and evidence, mark items reviewed or resolved, and use **Mark returned & resolve**.

Staff outbound and staff return:
- **On a showcase asset:** 3015 and 014 are available at the anchor, and 017 and 2041 are on rent. These create a real rental and records, which the presenter reset refuses until you name them in `--remove`. Fit the story first: resolve 014's missing-pins item before sending it out again, and don't rent out 3015 while its leak report is open.
- **On a disposable asset:** no reset is needed for the curated history.

## Never during a demo

- Delete a document, replace a cover, or archive, delete or rename a showcase asset.
- Make a showcase asset private, or change its code or QR tag.
- Change Northridge's notification or plan settings.
- Change the return template assigned to a showcase asset.

## After: the bounded presenter reset

The reset puts every **dataset** row (rentals, submissions, acknowledgements and scans of the synthetic history) back to its authored values, and the four rental pointers back to the dataset's. Every other row stays exactly as it is, including a real visitor's report or scan. It deletes only the exact ids you name.

Commands. Put the files in a folder outside the repository and outside OneDrive. Use `local` or `staging` as the target; Production comes after E2C.

1. Write the reset:
   ```
   npm.cmd run phase-e:reset:staging -- manifest --kind=presenter --org=11111111-1111-4111-8111-111111111111 --out=<folder>\presenter.json
   ```
2. Dry run:
   ```
   npm.cmd run phase-e:reset:staging -- plan --manifest=<folder>\presenter.json
   ```
3. If the dry run is **REFUSED [conflict]**, the message names a live return you made on a synthetic rental. List each id you want removed in a JSON file, then write the reset again with `--remove=<folder>\remove.json` and dry-run it:
   ```json
   { "form_submissions": ["<id>"], "asset_acknowledgements": ["<id>"] }
   ```
   A rental you started live on a showcase asset is refused the same way (an `integrity` refusal); name its id under `asset_rental_sessions`.
4. Apply, with the plan you reviewed:
   ```
   npm.cmd run phase-e:reset:staging -- apply --manifest=<folder>\presenter.json --approved-plan=<folder>\presenter.plan.json
   ```
   If anything changed since the dry run, the apply stops without writing ("differs from --approved-plan"). Dry-run again.
5. The tool re-checks after the commit and prints **CONVERGED (all KEEP)**.

What the reset never does:
- touch QR rows, profiles, the digest ledger or organization settings;
- delete a row you did not name;
- run without the reviewed plan on staging.

Files that live actions uploaded stay in storage until the retention decision. The reset never deletes files.

## Known app behaviour (say it plainly)

| You see | Why |
|---|---|
| Analytics lists every showcase machine under "repeated reports" | The rule counts 5 or more submissions in the range, and routine inspections count. A separate fix is planned |
| "Came with photos" on the dashboard equals all records | A query quirk: records without photos are counted too |
| Session comparison shows engine hours and fuel as "Difference recorded" | Hours and fuel always change during a rental; the app flags any change |
| Most inspections say recommended photos were not provided | The optional "Additional photos" slot is listed as missing when empty |
| "Waiting Nh without a response" grows after the anchor | Open items older than 24 hours age in the queue in real time |
| 3015 shows available while its leak report is open | The app has no hold for returned equipment; the queue is what keeps it visible |
| A July record shows template version 2026-08-1 | The history uses the current templates throughout |
| The 7-day analytics are empty weeks later | Ranges count back from today; refresh the history ([DEMO_REFRESH_POLICY.md](DEMO_REFRESH_POLICY.md)) |
| Staff names (Dana Whitfield, Luis Ferreira) have no accounts | Fictional staff are recorded by name only |
| Acknowledgement names end in "(demo)" | They are labelled demo records, not proof of training or consent |

## Notifications

- **The synthetic history sent no email and never will.** It was written directly to the database (email only comes from app actions), and every return is dated at or before the anchor's 6 AM digest cutoff, so no digest summarizes it. The dataset rows themselves prove it: `npm run test:phase-e-showcase-local` runs the real digest worker against them.
- **Live demo actions follow Northridge's settings.** Under `instant_renter`, a renter return sends an instant email. Staff returns go into the next 6 AM digest. Damage and support reports notify when those switches are on.
