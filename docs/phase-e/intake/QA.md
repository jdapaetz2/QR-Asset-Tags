# Onboarding kit QA (kit 2.0, 2026-11-24)

Kit 2.0, field mapping 1.1.0. It replaced the 1.0 intake kit on 2026-11-24; the 1.0 QA record is in Git history at `cf38abc`.

Every result below was produced on this machine with:
- Microsoft 365 Word and Excel (16.0);
- Chromium, through Playwright, for the PDFs;
- the Windows PDF renderer for page images.

Page images stay in the gitignored `qa-artifacts/intake/v2/`. The operator's own Excel and Word windows were never touched; the QA scripts start and quit their own instances.

## Gates

| Check | Result |
|---|---|
| `npm run lint` | Clean |
| `npm run typecheck` | Clean |
| `npm test` | 220 files, 2,594 tests pass. The kit's own: 7 files, 144 tests |
| `npm run build` | Passes |
| `npm.cmd run phase-e:intake:build -- --check` | A fresh rebuild matches all 31 committed files byte for byte |

Every result here comes from the final build, after the walkthrough fixes.

## Visual review

Every page was rendered and looked at.

| Document | Rendered by | Found and fixed |
|---|---|---|
| What to expect, PDF (the customer's one page) | Windows PDF renderer | **First render:** 2 pages, because the two "Optional" drawings rendered half a page wide. **Fix:** small icons beside their captions, and a compact layout. **After the walkthrough:** "About 1–2 hours at your desk", "One page per model, on a phone", and "Who puts the tags on is set in your agreement". Still one Letter page: the five-step strip, what's needed, what Mulemark does, the optional items, the five "please don't send" pictures and the DRAFT "good to know" lines |
| What to expect, Word copy (for reviewers) | Word's own page layout | **First render:** 2 pages (about 1.5 in over). **Fix:** Word's compact spacing now matches the PDF. Now one page with the same text and pictures |
| Scope and assumptions (DRAFT), PDF | Windows PDF renderer | 2 pages, DRAFT callout on top; nothing to fix |
| Setup workbook, EXAMPLE | Excel's own PDF export | **CALL SHEET:** prints on one landscape page, the form plus the people table. The print is small (about 55%); the sheet is meant to be filled on screen during the call, so that's accepted. **ASSETS:** bands, hints and the PC-07 flag print cleanly |

## Real Excel (always on copies)

| Check | Result |
|---|---|
| Opens without repair | Setup workbook, EXAMPLE and list template: no repair logs |
| Tab order | CALL SHEET, MODELS, ASSETS, FILES & NOTES, LISTS |
| Dropdowns | **ASSETS:** model, photo, tag, category and year. **MODELS:** manual, sharing, "changes by year or serial" and fuel. **FILES & NOTES:** what it is, where it's from and who may see it. All as designed, fed from LISTS. The CALL SHEET's date cells carry a date rule with a warning |
| CALL SHEET dates and time | **Typed into the protected sheet:** a date is stored as a real date and shows `2026-11-26`; minutes show `95`. **The EXAMPLE:** shows its stored date and minutes the same way |
| Print setup | CALL SHEET print area `$A$1:$I$45`, 1 page wide by 1 tall, landscape |
| EXAMPLE Check results | 46 OK and 1 "Model to confirm" (PC-07), as stored. MODELS shows "40 machines \| 1 machine \| 3 machines \| 2 machines". Zeros kept (`00101`, `00140`) |
| Typed edge cases | **Kept:** `00412` stays `00412`. **Duplicates:** `ab-1` and `AB-1` both show "Duplicate code". **Numbers:** a code stored as the number 412 is flagged. **No wildcards:** `A*1` / `AB1` and `X?2` / `XY2` aren't treated as duplicates. Unprotect works with no password |
| Paste from a fleet export | Opened the usual way, `00412` becomes `412`; imported as text, it survives. Pasted cells stay unlocked |
| List template | **Layout:** one unprotected sheet with the six headers. **Prompt** on the unit number: "Exactly as on the machine, e.g. 00412. Leading zeros are kept." **Typed:** `00412` stays `00412`, and the year shows `2022` |
| Workbook open in Excel | With a batch's workbook open in a separate Excel instance, `onboard:check` stops before changing anything: "setup-workbook.xlsx is open in another program. Close it in Excel, then run this again." No backup and no write. After closing Excel, it fills normally |

## Real Word

| Check | Result |
|---|---|
| Opens, pages | What to expect: 1 page. Scope: 2. Each email and each example draft: 1 |
| Spelling (US English) | **Clean:** the one-pager, the scope sheet, the four emails, the example's to-do list and three drafts, and the list template's text. **Flagged, by design:** only the `{{placeholder}}` tokens, and in the workbook's 368 strings three data tokens (`ext` in a phone extension, `svg`, and a logo file name) |

Word's PDF/XPS export still hangs in hidden sessions on this machine (Acrobat add-in, network printer), so Word pages come from `qa/word-render.ps1`. The kit's PDFs are printed by Chromium.

## Unit tests (7 files, 144 tests)

| Test file | Proves |
|---|---|
| `mapping.test.mjs` | **Every field** maps once to a real import column, contract path (the batch's measurements included) or app column, or a stated reason. **1.1.0 keeps all 67 keys of 1.0.0** and adds only the six `batch.*` keys. The defaults are documented. **App mirrors** still match the app: import columns, production CSV headers, tag options, the dialable-phone rule, category aliases, the CSV parser and the formula guard |
| `workbook.test.mjs` | **CALL SHEET:** in the order of the work, with date and number cells, printing on one landscape page. **Structure:** no START HERE; labels equal to the mapping; no "your" in any label; frozen panes, widths, dropdowns, password-free protection; no data in the blank; no macros, links, comments or hidden sheets. **Banners:** a list-filled workbook carries its banner on MODELS and ASSETS only. **Example and template:** the EXAMPLE stamp and its Check results ("40 machines"); the list template's six headers, text unit numbers and prompts. Reproducible bytes |
| `reader.test.mjs` | **The example:** 47 machines, zeros kept, the CALL SHEET's date read as `2026-11-26` with no issue, blank tags read as blank. **Dates:** a date typed into a date cell is read; a date pasted anywhere else is flagged. **What gets typed or pasted:** unknown answers, a number code, a formula (never run), formula-like text and a card number (held back). **Encodings:** BOM, LF and Windows-1252 lists. **The list fill:** maps known headers and keeps everything already typed (CALL SHEET, people, files, notes, existing MODELS rows). The list template reads like any export |
| `readiness.test.mjs` | **Customer:** asked only what only they know, including the ship-to and the plain-number unit numbers (while the fill's note is there). **Manuals:** never asked about until Mulemark's search found none (Not sure); Not available is a warning, not a blocker. **Mulemark:** the workbook's bookkeeping and the inbox, including unnamed model files, old Excel exports and Word files. **Defaults:** a blank tag means New tag; photos never block, and saved ones count with no typing; a manual file with no sharing answer is linked from the maker's copy. **Wording:** questions name the machine (and its make) and carry no workbook references. **Dates and time:** bad values only warn. **Statuses:** precedence, inheritance, READY only with nothing at all, and no count ever clears a blocker |
| `outputs.test.mjs` | **Importer:** the derived CSV goes through the app's own importer with zero errors. **Manifest:** valid against schema 1.3.0; one model for the 40 trailers; blank tags become new tags; the call sheet's dates become `batch.measurements`; rights are conservative, and a manual file is hosted only when chosen; the batch number stays in the manifest id. **No names:** none in the manifest. **To-do list:** asking, own work and warnings, one line per kind of warning. **Emails:** plain text with no Markdown; the questions email carries customer items only, without references; the preview email includes only machines with nothing outstanding and names the rest with the reason; the live email names what isn't live yet. **Unit numbers:** shortened to ranges |
| `documents.test.mjs` | **Emails:** exactly four; every placeholder documented and used; no upload link and no invented links; the approval wording inside the preview email. **Customer folder:** exactly the two sendable files. **One-pager:** one page, at most 220 visible words, and no upload, workbook or folder mentioned to the customer. **DRAFT and Word:** DRAFT marks, including the bracketed line on top of the preview draft; no signature lines; Word text equal to the PDF source. **Kit:** MANIFEST hashes, no secrets, the ZIP utilities and the private-storage guard |
| `onboard.test.mjs` | **onboard:start:** the batch layout with the inbox folders; your name remembered and filled into every draft; no overwrite (a new batch needs `--batch`); a warning for a similar customer folder and for the DRAFT one-pager; refusal of the repository and of empty names. **Before the list arrives:** "No equipment list in inbox\ yet", the questions, and no drafts. **The list fill:** once, after a byte-identical backup, keeping the call sheet. It reads a list under a title line, refuses one with no unit-number column, says what to do with an `.xls`, flags plain-number unit numbers, merges model spellings and leaves out category codes. **Drafts:** the questions email is removed once nothing is left to ask, and the tag order is never overwritten. **Lists and batches:** several spreadsheets need `--list`; the latest batch by default; `prepared.json` picked up. **Files open in Excel:** the workbook, or a check output, stops the run with "close it in Excel", nothing changed |

## Commands end to end (outside the repository)

In a temporary private root:
- **`onboard:start -- "Example Rentals"`:** created the batch (setup workbook, `inbox\`, the two files in `to-send\`, the welcome email). Run again, it refuses: "already exists. To continue it, run onboard:check. For a new batch, add --batch 2."
- **`onboard:check` with the fleet fixture in `inbox\`:**
  - filled 5 machines on 3 models from the list, keeping a backup, and named the columns left out ("Daily Rate, Location");
  - wrote the to-do list, the questions email, the drafts, the tag order, the import CSV and a valid manifest.
  - Run again, it doesn't fill a second time.
- **Pointed at a folder inside the repository**, it refuses and writes nothing.
- **After the walkthrough fixes, a messy 40-machine list:**
  - **the list:** two title lines, codes 401–442 without zeros, "BIG TEX 30SA12" beside "Big Tex 30SA-12", class codes and a compactor with only a make;
  - **the console:**
    - "Skipped 2 lines above the header row";
    - "Merged spellings into "Big Tex 30SA-12": BIG TEX 30SA12";
    - the codes left out ("TRL-UTIL, EXC-MINI");
    - the plain-number codes ("401–436, 441, 442") with the note to confirm them;
    - "Ask the customer: 7 · Your work: 6 · Warnings: 47 (4 kinds)";
  - **the plain-text questions email:**
    - asks about the zeros once;
    - asks "PC-4 (Plate compactor): which Wacker Neuson model is it?";
    - ends with the remembered sender's name.

## Walkthrough

See [WALKTHROUGH.md](WALKTHROUGH.md): a second-person walkthrough of both sides, and the independent run by a separate agent.

- **The run:** a separate agent played the customer, from the welcome email and the one-pager only, and the operator, from `internal/README.md` only, running the real commands on a messy 60-row export.
- **Findings:** 34 points (5 blockers, 19 confusing, 10 minor). All are fixed except two left for the commercial review: who puts the tags on, and the approval wording's length.
  - **The blockers:**
    - a stale questions email could be sent;
    - a re-saved list lost its zeros silently;
    - the manual search came after the one email and had no "not found" end state;
    - "about an hour" left out the tags and was too low for 60 machines;
    - the pre-E4B screen share and Administrator invite weren't in the routine.
- **QA after the fixes:** everything above was re-run on the final build.

## Not tested (stated, not papered over)

- **Other spreadsheet apps:** Google Sheets, Apple Numbers and LibreOffice aren't available here. The list template is a plain sheet any of them can fill; the setup workbook is Mulemark's own and is used in Excel.
- **Excel's warning dialogs:** automation can't click "Yes, keep my answer". The rule settings were verified instead.
- **Word's PDF export:** not used (above).
- **No database import:** E3 changes nothing in the app or Production. The derived CSV was parsed by the app's own importer code, and the manifest was validated against the contract. The owner-led import is E4B's.
- **No real customer data:** the example and the fixtures are fictional.
