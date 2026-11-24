# Onboarding a customer (internal)

The customer's part:
- one 30-minute call;
- their equipment list, exactly as their rental software exports it;
- checking one page per model on a phone;
- an "Approved" reply.

That's about 1–2 hours at their desk. Putting the tags on isn't in that time, and who does it is still a commercial decision.

Your part is about 3–4 hours for 60 machines, plus up to 45 minutes per model finding manuals. Two commands do the paperwork.

Customer files live in `%USERPROFILE%\Mulemark-Customer-Intake\<company>\batch-<n>\`, never in Git. Both commands refuse to write inside this repository. Run them from the project folder.

## The routine

### 1. Start (5 minutes)

```powershell
npm.cmd run onboard:start -- "Northridge Rentals" --sender "Your Name"
```

It creates the batch folder:
- `setup-workbook.xlsx`;
- `inbox\`, with `Company\`, `Photos\` and `Model documents\` inside;
- `to-send\`, holding the one-pager and the list template;
- `email-1-welcome.txt`.

Your name is remembered after the first time, so drop `--sender` from then on.

Open the email, fill in their first name and your call times, paste it into a new email, attach the two files from `to-send\`, and send it.

> Until its commercial review is done, the one-pager carries a DRAFT badge. Don't send it to a real customer before then; the command reminds you.

### 2. Before the call (about 45 minutes)

- **From their website (about 15 minutes):** fill in "Before the call" on the CALL SHEET:
  - name, website, brand color;
  - the logo (save it in `inbox\Company\`);
  - the phone and email renters see;
  - any rules they publish.
- **When their list arrives:**
  1. Save it in `inbox\` exactly as it came. CSV or Excel are read directly; an old `.xls` needs saving as `.xlsx` first.
  2. Save the workbook (Ctrl+S): the check reads the last saved copy.
  3. Run:

     ```powershell
     npm.cmd run onboard:check -- "Northridge Rentals"
     ```

     - It fills MODELS and ASSETS from the list, once. Your workbook from before the fill is kept as `setup-workbook.before-fill.xlsx`.
     - It reads a list that has a title line above its headers.
     - It merges spelling variants of a model (30SA12 and 30SA-12), leaves out rental-software category codes (TRL-UTIL), and says so.
- **Check the filled MODELS and ASSETS (20–30 minutes):**
  - the names renters see;
  - model spellings;
  - plain categories on MODELS (e.g. Utility trailer).
- **Start the manual search now** ("Your work" in `check\to-do.md`):
  - up to about 45 minutes per model, official sources only, no purchases, no sign-ins;
  - put each official link under Manual on MODELS;
  - not found? Set Manual to **Not sure**, and it joins the questions for the call.
- **Run the check again.** Its "Ask the customer" list is what to cover on the call.

### 3. The call (30–45 minutes)

- **Go down the CALL SHEET in order** and type the answers:
  - confirm the website facts;
  - then ask for support hours, the approver, where renter reports go, the tag ship-to and contact, their rules, and who needs a sign-in. One Administrator is enough; they can add the rest.
- **Ask the to-do's "Ask the customer" questions too.** These include any manual you couldn't find, and whether plain-number unit numbers (401) really have no leading zeros.
- **Leave the defaults blank** unless they want something different.

Right after the call, invite their Administrator (Owner › Organizations › the customer › Users). They'll need the sign-in for the preview.

### 4. After the call

- **Save anything they email in `inbox\`:**
  - **Photos** go in `inbox\Photos\<unit number>\`. They count automatically; there's nothing to type.
  - **Manuals and handouts** go in `inbox\Model documents\<model name>\`, with the folder named exactly as on MODELS. Then type the file's name under Manual (a manual) or Customer's instructions (a handout). The check lists any file there that MODELS doesn't name yet.
- **Unit numbers:** once they've confirmed them, fix the codes if needed, then delete the "Unit numbers" note on FILES & NOTES.
- **Save, run the check again,** and if `check\questions-email.txt` exists, paste it into an email and send it.
  - It's the one and only email of questions.
  - The check deletes it once nothing is left to ask, so an old one is never sent by mistake.
- **When the answers come back,** type them in and run the check again.

### 5. Build

Work through "Your work" in `check\to-do.md` until it's empty:
- **Pages:** from approved templates and their rules.
- **Import:** import the machines as private drafts.

**A model with an approved reusable pack:**
- Put a `prepared.json` in the batch folder (the format is in `../example-run/inputs/prepared.json`).
- Rename the model on MODELS to the pack's `model_name`, and copy its manual link.
- Add `"manual_cleared": true` only when that pack's manual and its rights were reviewed.
- Its page work then drops off your list.

### 6. Preview

- **Send `check\email-3-preview-ready.txt`** with the preview link and the content version filled in.
  - It lists only machines with nothing outstanding, and names the rest with the reason.
  - It asks them to check one page per model, and to forward it if someone else approves.
- **It quotes the approval wording, so their "Approved" reply is the record.** Save the reply in the batch folder.
- **Don't send the approval wording** to a real customer until its legal review is done (the DRAFT line on top).

### 7. Tags and go-live

- **Tags:**
  1. Export Owner › Production › CSV for the approved machines.
  2. Paste it into `check\tag-order.xlsx`. Ship-to and tag style are already filled in. The check writes this file once and never overwrites it.
  3. Send it to the tag maker.
- **Go live:**
  - Publish the approved pages.
  - Send each person their own sign-in link.
  - Then send `check\email-4-live.txt`. It names any machines that aren't live yet.

Fill in "Dates and time" on the CALL SHEET as you go: everything in, preview sent, approved, live, and your hands-on minutes. They become the batch's record.

## Rules that always apply

- **No guessed values.** Anything you copy from their website is confirmed on the call.
- **One list of questions:** the call, then at most one email.
- **Bounded research:** about 45 minutes per model, official sources, no purchases, no invented links.
- **Customer files** stay in the private folder, never in Git or a shared folder.
- **Nothing goes public before an explicit "Approved".** Silence is never approval.
- **A partial launch only if the customer asks for one.** The preview email then lists what's in and what's left out.

## Until E4B and E5A exist

- **The import:** their Administrator has to click Import (Dashboard › Assets › Import). Do it on a short screen share, with `check\current-import.csv`.
- **Model pages:** you can't write them into their account yet; that's E4B.
- **Preview and publishing:** there's no preview link or in-app approval until E5A. Review the pages together on the same screen share, and publish from their account.

So plan the first real customer after E4B.

## Options and files

| You want to | Do |
|---|---|
| Start a second batch for the same customer | `onboard:start -- "Name" --batch 2`. `onboard:check` uses the newest batch; add `--batch 1` for an older one |
| Pick the list when `inbox\` holds two spreadsheets | `onboard:check -- "Name" --list "their file.csv"` |
| Use a corrected list, or one list per branch | The fill runs only while ASSETS is empty. Paste the new rows into ASSETS yourself, or start a new batch |
| Use a test folder instead of the private one | Add `--root <folder>` |

**What `check\` holds:**
- `to-do.md`: your list;
- `questions-email.txt`, `email-3-preview-ready.txt`, `email-4-live.txt`: the drafts;
- `tag-order.xlsx`: the tag order;
- `current-import.csv`: what today's importer takes;
- `manifest.json`: the batch for E4;
- `readiness.xlsx`: the same items, sortable;
- `run.json`: the record of the run;
- `fleet-mapping.json`: what the fill did with their columns.

## What's here

| File | For |
|---|---|
| `../customer/` | The only files a customer gets: the one-pager (PDF) and the list template. `onboard:start` copies them into `to-send\` |
| `emails/` | The four email templates. The commands fill them in; `PLACEHOLDERS.md` lists what's left for you |
| `mulemark-setup-workbook-v2.0.xlsx` | The blank setup workbook (`onboard:start` makes each customer's copy) |
| `EXAMPLE-setup-workbook-v2.0.xlsx` | A finished one for a fictional company. `../example-run/` is what `onboard:check` writes for it |
| `scope-and-assumptions-DRAFT.pdf` / `.docx` | The reference for the commercial review and the pilot agreement; not sent as it is |
| `mulemark-what-to-expect.docx` | The one-pager in Word, for reviewers' markup |
| `tag-production-handoff-v2.0.xlsx` / `.csv` | The blank tag order |
| `field-mapping-1.1.0.json`, `intake.schema.json` | The workbook's fields and the reader's output, for E4 |

## QA tools (Windows with Microsoft Office)

| Script | Does |
|---|---|
| `scripts/phase-e/intake/qa/excel-checks.ps1` | Opens the workbooks and the list template in Excel (copies). Checks for repair, dropdowns, Check formulas, the CALL SHEET's dates, typed edge cases, the paste test, and PDF pages |
| `scripts/phase-e/intake/qa/excel-open.ps1` | A quick open-and-repair check for any workbook |
| `scripts/phase-e/intake/qa/word-checks.ps1` | Opens documents in Word (copies): page and word counts, US English spelling |
| `scripts/phase-e/intake/qa/word-render.ps1` | Renders each Word page to PNG with Word's own layout |
| `scripts/phase-e/intake/qa/spell-corpus.mjs` | Collects a workbook's text for the spelling check |
