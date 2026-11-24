# Intake kit QA (E3, 2026-11-23)

Kit 1.0, field mapping 1.0.0. Every result below was produced on this machine with:
- Microsoft 365 Word and Excel (16.0.20527);
- Chromium, through Playwright 1.62, for the PDFs;
- the Windows PDF renderer for page images.

Page images stay in the gitignored `qa-artifacts/intake/`. Everything was re-run on the final build, after the walkthrough fixes ([WALKTHROUGH.md](WALKTHROUGH.md)).

## Gates

| Check | Result |
|---|---|
| `npm run lint` | Clean |
| `npm run typecheck` | Clean |
| `npm test` | 219 files, 2,553 tests pass. The kit's own: 6 files, 103 tests |
| `npm run build` | Passes |
| `npm.cmd run phase-e:intake:build -- --check` | A fresh rebuild matches all 46 committed files byte for byte |
| `npm.cmd run phase-e:intake:zip` | Customer packet 13 files, internal packet 34. Both extract with Windows, and every file is byte-identical to the kit's |

## Visual review

Every page was rendered and looked at.

| Document | Rendered by | Found and fixed |
|---|---|---|
| Onboarding guide, PDF (4 pages, 554 visible words of 600) | Windows PDF renderer | **First pass:** the folder tree lost its indentation; the "hitch" drawing read as a cap; pages were half empty. Fixed with kept indentation, a coupler-on-hitch-ball drawing, larger photo frames (3 + 2) and a row of crossed-out pictures for "please don't send". **After the walkthrough fixes:** page 3 ran one line onto a fifth page, so "Who sees what" moved to page 4 under its own heading |
| Onboarding guide, Word | Word's own page layout | 4 pages, same text and pictures as the PDF |
| Scope and assumptions (DRAFT), PDF and Word | Both | 2 pages with the new lines (batch, templates, tracked time, serials, unused export columns); DRAFT banner on top |
| Content-approval wording (DRAFT), Word | Word | DRAFT banner, no signature line |
| Five email templates, Word | Word | Placeholders visible as `{{…}}`; nothing to fix |
| Intake workbook, blank and EXAMPLE | Excel's own PDF export | **First pass:** the COMPANY & PEOPLE banner lost its bold amber style (column styles applied after the merge); the Year and Serial hints were cut off; MODELS Check values sat at the cell bottom. **After the walkthrough fixes:** START HERE ran onto a second printed page, so it now fits one portrait page. Hint rows are sized to their longest hint (37 points) and every hint shows in full |
| Onboarding tracker, tag handoff, readiness workbook | Excel | Nothing to fix |

**Two artifacts of the Word page render, not document defects:**
- text is drawn slightly heavy;
- page 1 of the guide showed "1 / 2", because Word had not finished paginating when that page was drawn. Page 3 shows "3 / 4".

## Real Excel (always on copies)

| Check | Result |
|---|---|
| Opens without repair | Blank, EXAMPLE, tracker, handoff and readiness workbooks: no repair logs |
| Tab order | START HERE, COMPANY & PEOPLE, MODELS, ASSETS, FILES & NOTES, LISTS |
| Dropdowns | List, whole-number and length rules sit on the expected cells, all fed from LISTS through named ranges. FILES & NOTES offers "Where is it from?" and "Who may see it?" as separate lists. Free-text answers (model, photo, category, manual, fuel) accept any text. Strict choices warn and let you keep your own |
| Protection | Protected without a password; Review › Unprotect Sheet works with none. Inserting and deleting rows and sorting are allowed |
| Frozen headings | MODELS and ASSETS freeze 5 rows and the first column; COMPANY & PEOPLE and FILES & NOTES freeze the headings |
| EXAMPLE Check results | Excel calculates 46 OK and 1 "Model to confirm" (PC-07), exactly the values stored in the file. MODELS shows 40 / 1 / 3 / 2 assets. The trailers keep their zeros (`00101` to `00140`) |
| Typed edge cases | `00412` stays `00412`; `ab-1` and `AB-1` both show "Duplicate code"; a code stored as the number 412 shows "Code stored as a number: check leading zeros"; `A*1` vs `AB1` and `X?2` vs `XY2` are not duplicates (no wildcard matching) |
| Paste from a fleet export | The CSV opened the usual way turns `00412` into `412`, which is why the guide says to send the export as it is. Imported as text, `00412` survives. Pasted cells stay unlocked and editable: input is never trapped |
| Tracker formulas | A sample batch gives: 75 hands-on minutes (the other batch's 10 excluded); 30 hours of customer wait; 7 tag-manufacturing days; 3 business days (target 3, "Yes"); first exception ID EX-001 |

## Real Word

| Check | Result |
|---|---|
| Opens | All 8 Word documents open: guide 4 pages, scope 2, approval wording 1, each email 1 |
| Spelling (US English) | No errors in the guide, scope sheet, approval wording, emails, procedure, CSV note, readiness report or the workbook's 259 strings. Word flags only the `{{placeholder}}` tokens, the possessive "Mulemark's" and the two npm command names |

**Word's PDF and XPS export hangs here.** It stalls in hidden sessions on this machine: Adobe Acrobat's add-in is loaded in Word, and the default printer is a network printer. Page images therefore come from `qa/word-render.ps1`, which uses Word's own page metafiles. The kit's PDFs are printed by Chromium and don't depend on Word.

## Data and import parity (unit tests)

| Test file | Proves |
|---|---|
| `mapping.test.mjs` | **Every field** maps once, to a real import column, contract path or app column, or with a stated reason. **The kit's copies of the app's rules match the app:** import columns, production CSV headers, tag options, the dialable-phone rule, the category aliases, the CSV parser and the formula guard |
| `workbook.test.mjs` | **Structure:** tabs in order (MODELS before ASSETS), labels equal to the mapping, frozen panes, widths, dropdown sources. **START HERE:** what to skip with a fleet list, the three answers and the version, on one printed portrait page. **Layout and safety:** hint rows tall enough for their hints; password-free protection with unlocked input; **no data in the blank**; no macros, links, comments or hidden sheets. **Example:** the EXAMPLE stamp, stored Check results, reproducible bytes |
| `reader.test.mjs` | **The example reads back:** 47 assets, the varied machines first, 40 trailers on one model, zeros kept, two file exceptions. **What customers type:** unknown answers in any case; a number code; a formula (never run); formula-like text and a card number (held back); accents and spaces in file names. **Files and formats:** BOM, CRLF and Windows-1252 CSVs; the CSV round trip; the messy fleet export (zeros, quotes, unmapped columns listed); prefill; refusal of a macro workbook |
| `readiness.test.mjs` | **Each rule:** its status, field and owner. **Ordering:** precedence; inheritance from model and company. **File answers:** "where is it from?" is asked only when renters are to see a file; a maker's file for renters is Mulemark's item. **Thresholds:** READY only with nothing at all; 99 complete assets don't clear one duplicate |
| `outputs.test.mjs` | **Current importer:** the derived CSV goes through the app's own importer with zero errors, the same 47 codes in order, all flags off and no template. **Manifest:** validates against schema 1.3.0; the 40 trailers share one model. **Rights:** conservative and never shareable across organizations; folder defaults apply, and a FILES & NOTES row can only narrow them, never widen them. **Privacy and safety:** no names or personal addresses; the readiness workbook guards formula-like text; the one email holds customer items only |
| `documents.test.mjs` | **Wording:** only documented placeholders, none in the customer packet; the guide's word budget (554 of 600); DRAFT marks; no signature lines; Word text equal to the PDF source. **Packaging:** MANIFEST hashes; no secrets; the ZIP utilities; the private-storage guard |

## Command-line tools (outside the repository)

- `phase-e:intake:check` on the EXAMPLE with a deliberately sparse upload lists 16 customer items in one email, grouped by model, with cell references, and the manifest stays valid. The upload held only the logo, one E20 photo folder and the maker's card.
- `phase-e:intake:prefill` on the fleet export writes a 5-asset, 3-model workbook and lists "Daily Rate" and "Location" as not mapped.
- Asked to write inside the repository, `phase-e:intake:check` refuses and writes nothing.

## Walkthrough

[WALKTHROUGH.md](WALKTHROUGH.md) has two parts:
- a second-person walkthrough of the kit as it now stands;
- the independent run by a separate agent playing a rental administrator.

The independent run found one blocker, seven confusing points and four minor ones. All were fixed, except the print size of LISTS and MODELS, which is accepted. It also raised commitment and privacy questions; all are answered in the kit except who attaches tags, which is left to the commercial review.

## Not tested (stated, not papered over)

- **Other spreadsheet apps:** Google Sheets, Apple Numbers and LibreOffice are not available here. Dropdowns, protection and formulas were proven in Microsoft Excel only.
- **Excel's warning dialogs:** automation can't click "Yes, keep my answer". The rule settings were verified instead.
- **Word's PDF export:** not used (above).
- **No database import:** no import into a database was run. E3 changes nothing in the app or Production. The derived CSV was parsed by the app's own importer code, and the manifest was validated against the contract. The owner-led import is E4B's.
- **No real customer data** was used; the example is fictional.
- **Still to do before the first customer:**
  - choose an upload channel that accepts whole folders (a setup step);
  - complete the commercial and legal reviews of the DRAFT wording, including who attaches tags.
