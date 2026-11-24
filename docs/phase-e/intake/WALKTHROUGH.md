# Walkthrough (kit 2.0, 2026-11-24)

Kit 2.0 replaced the 1.0 intake kit at the operator's request: onboarding had to be painless for the customer and for him, without being rushed. The 1.0 walkthrough found that the customer would spend 4–6 hours for 60 machines. That record is in Git history at `cf38abc`.

This file has two parts:
- a second-person walkthrough of both sides, as the kit now stands;
- the independent run by a separate agent playing the customer and the operator, with what was fixed.

## 1. You, onboarding Ridgeway Equipment Rental (60 machines)

**Monday, 5 minutes.** Ridgeway agrees to a pilot.
1. You run `npm.cmd run onboard:start -- "Ridgeway Equipment Rental"`. Your name is remembered from the first time.
2. You open `email-1-welcome.txt`, add Pat's first name and two call times, and paste it into an email with the two files from `to-send\`.

Pat gets one email and one page: a call, their equipment list, a phone check, then approve.

**Tuesday, about 45 minutes.**
1. **From their website,** you fill in "Before the call" on the CALL SHEET:
   - name, website, brand color;
   - the logo, saved in `inbox\Company\`;
   - the phone and email renters see;
   - the rules they publish.
2. **Pat emails the export.** You save it in `inbox\` and run `onboard:check`.
   - MODELS and ASSETS fill from the list: 60 machines on 7 models.
   - The report's title line is skipped, "30SA12" is merged into "30SA-12", and the "TRL-UTIL" class codes are left out.
   - The unit numbers 401–440 came as plain numbers, so a note asks Pat whether the plates show leading zeros.
3. **You spend 20 minutes on the filled list:** the names renters see, and plain categories on MODELS.
4. **You start the manual search** for each model in "Your work":
   - six official manuals are found and linked;
   - one model's isn't, so you set it to "Not sure", which turns it into a question for the call.

**Wednesday, the 30–45-minute call.**
- **You go down the CALL SHEET in order,** typing as Pat answers:
  - the phone renters see;
  - who approves (Pat), and where reports go;
  - where tags ship, and who signs for them;
  - one rule that isn't on their website;
  - one Administrator for now.
- **You ask the to-do's questions.**
  - Pat confirms the plates say 00401, so you fix the codes and delete the note.
  - Pat has the missing manual on paper and will send phone photos.
  - Pat will check the worn compactor plate in the yard.
- **Right after the call,** you invite Pat as Administrator.
- **You run the check again.** One question is left, so `questions-email.txt` holds one item, and you send it. When the answer comes back, the check deletes the email, so it can't be sent twice.

**The build: your work, not Pat's.**
- You prepare the pages from approved templates and Pat's rules. A model with an approved reusable pack needs none written; `prepared.json` marks it.
- You run the check after each change until "Your work" is empty.

**The preview.**
- **You fill the preview link and the content version** into `email-3-preview-ready.txt` and send it. It lists the machines with nothing outstanding, and names the compactor still waiting on its plate.
- **Pat checks one page per model** on a phone (about 20 minutes) and replies "Approved". The reply quotes the approval wording, the version and the machines, and you save it in the batch folder.

**Tags and live.**
1. You paste the owner production CSV into `tag-order.xlsx`. Ship-to and tag style are already filled in.
2. When the tags are on, you publish, send each person's sign-in link, and send `email-4-live.txt`. It names the compactor as not live yet.

Pat can add photos from a phone at any time; the ones you saved in `inbox\Photos\<unit number>\` were picked up without typing anything.

**Pat's total, at the desk:** about 1½ hours.

| What | Minutes |
|---|---|
| Reading the email and the page | 5 |
| Exporting and sending the list | 10 |
| The call | 30–45 |
| One questions email | 10 |
| Checking the pages on a phone | 20 |
| Approving | 5 |

**Putting 60 tags on** is extra, and who does it is still a commercial decision. **Yours:** about 3–4 hours, plus up to 45 minutes per model finding manuals.

**Not in the routine yet (E4B, E5A):**
- the import you can run yourself, and pages written into the customer's account;
- the in-app preview and the Approve button.

Until then, the import and the page review are a short screen share with their Administrator.

## 2. Independent run (2026-11-24)

**Setup:** a separate agent, with no part in the kit's design, played two roles.
- **As the customer:** an office administrator with 60 machines. They had only the welcome email, the one-pager, the list template, and the later example emails.
- **As the operator:** working only from `internal/README.md`. They ran the real commands, in a temporary folder, on a messy 60-row export of their own making:
  - a report title line;
  - codes re-saved without zeros;
  - spelling variants;
  - category codes;
  - a compactor with only a make;
  - an `.xls` file.

**Verdict, before the fixes:**
- **The customer:** desk work light and clearly worded, but "about an hour" wrong for 60 machines (about 2–2.5 h), and putting the tags on mentioned nowhere.
- **The operator:** commands fast (1.3 s), safe and mostly well messaged, but far from "doing the paperwork". A messy list needed about 30 minutes of clean-up the README never mentioned, and there were traps.

It found 34 points: 5 blockers, 19 confusing points and 10 minor ones. All were fixed, except the two in "Left open" below.

| Finding | Fix |
|---|---|
| **Blocker:** the check wrote a questions email before the call and never removed it, so "send it if it exists" could send a stale one | The check deletes the questions email as soon as nothing is left to ask, and writes no drafts before there are machines |
| **Blocker:** a list re-saved in Excel (00401 → 401) went through silently | Plain-number unit numbers get a FILES & NOTES note, so the customer is asked once whether the plates show zeros. Deleting the note clears it |
| **Blocker:** the manual search came after the one email, and "not found" had no end state | The README moves the search to before the call. Manual states: blank means search; Not sure means not found, ask once; Not available means no manual button (a warning only) |
| **Blocker:** "about an hour" was wrong, and putting the tags on was never mentioned | Everywhere now says "about 1–2 hours at your desk" and "who puts the tags on is set in your agreement". The preview asks for one page per model, not every page |
| **Blocker:** the import screen share wasn't in any customer step, and the Administrator was invited only at go-live | The README invites the Administrator right after the call. It also says the import and the page review are a screen share until E4B and E5A, and to plan the first real customer after E4B |
| A make with no model became a phantom model ("Wacker Neuson") with its own research and page work | No model is created from a make alone. The machine gets a question naming it and its make ("PC-4 (Plate compactor): which Wacker Neuson model is it?") |
| Spelling variants (30SA12, 30SA-12) became separate models | The fill merges them (case, spaces and punctuation ignored) and reports the merge |
| Rental-software class codes (TRL-UTIL) became categories, and every model got the generic return checklist | Code-like categories are left out and reported. The category moves to MODELS, and the warning says to set a plain category |
| The README didn't say to check the filled list; its "15 minutes" before the call was 50–65 | The README has a step to check names, models and categories (20–30 min), and honest times for each step |
| Photos and manuals saved in the inbox folders weren't picked up | Photos in `inbox\Photos\<code>\` count with a blank Photo answer. Files in a model's folder that MODELS doesn't name become a to-do item. `onboard:start` creates the folders |
| A title line above the headers gave 0 machines | The header row is found in the first 10 lines. A list with no unit-number column, or no machines, stops with a plain message |
| An `.xls` export got "ask for a JPG, PNG, HEIC or PDF" | "Open it in Excel, Save As .xlsx into inbox\, then run the check again". A Word file of rules gets "copy what renters need onto the CALL SHEET" |
| No item asked whether a manual changes by year or serial | New models from the list start as Not sure, so checking it is on your list |
| "Not available is a fine answer" was ambiguous | "Don't know an answer for a machine? Say so: if you'd like, we'll launch the others first and add it later." |
| "Not included yet" gave no reasons, and the live email ignored those machines | Each one is named with its reason ("waiting on your answers" or "we're still finishing them"). The live email says which machines aren't live yet |
| The approval email didn't allow for someone else approving | "If someone else approves, please forward this email to them." |
| The one-pager in `to-send\` carries the DRAFT badge, and the research line read like a billing term | `onboard:start` warns before a real send. The line reads "We spend up to 45 minutes finding each manual." |
| The welcome email didn't say what to include or which format | "The list of machines you want tags on (skip sold units and small tools) … CSV or Excel is fine. If you open it to look, close it without saving." |
| The tag order was rewritten on every check; the ship-to was never asked | The tag order is written once. "Where should we ship the tags, and who will sign for them?" is asked when the ship-to is blank |
| "Waiting on the customer: 60. Waiting on you: 0." sat above 20 items of your own work | The to-do summary counts items: "To ask the customer: 7 items. Your work: 6 items." |
| A check output open in Excel gave a raw EBUSY and a half-rewritten folder | The check stops first: "readiness.xlsx is open in another program. Close it in Excel." The README says to save before each check |
| Where the preview link comes from wasn't said | The README says there's no preview link until E5A, so the pages are reviewed together on the screen share |
| Checking before the list arrived said "0 machines" and wrote an empty preview draft | It says "No equipment list in inbox\ yet" and writes no drafts |
| `--list`, `--batch` and `--root` weren't documented | An "Options and files" section, which also covers a corrected list and what each file in `check\` is for |
| "…, LLC" silently made a second customer folder | `onboard:start` warns about a similar folder |
| The sender's name was left in every draft, and the Markdown pasted as asterisks | `--sender` is remembered and fills every draft. The drafts are plain text, ready to paste |
| The console said "82 warnings", the to-do "Warnings (4)" | "Warnings: 82 (4 kinds)" |
| The batch number was cut off the manifest id | The company isn't repeated, so the id keeps it (`intake-ridgeway-equipment-rental-batch-1`) |
| `prepared.json` names never matched the fill's names | The README says to rename the model to the pack's `model_name` and copy its manual link, with `manual_cleared` only after review |
| A QA render was older than the shipped PDF | Re-rendered and re-checked after the fixes |

**Left open, for the commercial review:**
- who puts the tags on;
- the approval wording's length (it's the legal draft).

**What worked well:**
- **The commands:** fast and non-destructive.
- **Messages:** clear for running out of order, two lists in the inbox, and a workbook open in Excel.
- **The CSV reader:** handled BOM, CRLF, quotes and leading zeros, and left unused columns out.
- **Nothing goes public early.**
- **The welcome email:** short, with two actions.
- **The don't-send pictures:** clear.
- **The privacy line:** "Serial numbers and unused columns are never shown to renters."

**Its estimates before the fixes:**
- **The customer:** about 2–2.5 h at the desk, plus putting tags on.
- **The operator:** about 4–4.5 h, plus 2.5–5 h of manual research for 7 models.

The fixes take the clean-up and the second email out of the operator's time. The customer's estimate is now stated as 1–2 hours, with the page check cut to one page per model.
