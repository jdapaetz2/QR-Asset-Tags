# Walkthrough: can a rental administrator fill this in? (E3, 2026-11-23)

Two passes over the customer packet, kit 1.0:
1. **A second-person walkthrough** of the kit as it now stands.
2. **An independent run.** A separate agent played a rental administrator with 60 machines and a messy fleet export. It knew nothing of Mulemark's schema and read only the customer packet. Its findings, and what changed, follow the walkthrough.

**Verdict: yes.** Nothing asks for a Mulemark key, a database name or a schema decision. Every column is a plain question with a hint and an example. The two calls an administrator can't make, whether a manual changes by year or serial and copyright, are now either factual questions or "Not sure is fine". What still takes real effort is the equipment itself: reading worn plates, taking photos and finding manuals. The kit can't remove that work, but it keeps it to one model row and one photo per model where machines are identical.

## 1. The walkthrough

You get the welcome email. It has three numbered steps and a link to a finished equipment page (getmulemark.com/demo). You read the four-page guide; it is mostly pictures. Then you open the workbook at START HERE.

**Have a fleet list from your rental software?** START HERE, the guide and the email all say the same thing:
- Send it as it is, and skip MODELS and ASSETS.
- Mulemark fills those tabs from your list and sends the workbook back for you to check.
- The returned workbook's banner reminds you that the Asset name is what renters see. Your export's "Description" may need tidying.
- Columns Mulemark doesn't use, such as rates or yard locations, are listed as not mapped and are never published.

**Or type it yourself:**
1. **COMPANY & PEOPLE.** Fill in:
   - support contacts (phone, email or both: at least one);
   - who approves your pages;
   - the email alerts. Each hint says what triggers that alert.
   - your team, as Administrator or Staff. The hint says what each role can do, and any email address works.
2. **MODELS.** One row per model. Forty identical trailers share one row, one manual link and one photo. Fill these in for each model:
   - **Manual:** a file (a phone scan of a paper manual is fine), a web link, or one of the three answers.
   - **May renters see the manual?** The hint says what each choice does.
   - **Manual changes by year or serial?** "Not sure is fine: we check the manual."
3. **ASSETS.** One row per machine:
   - Pick "Model name (from MODELS)" from the dropdown.
   - Fill Category only if it differs from the model's.
   - The Check column answers as you type: OK, Duplicate code, Code stored as a number, Model to confirm, or Add this model on MODELS.
4. **FILES & NOTES.** Only exceptions: a file outside the standard folders, from the maker, or for staff only. Each gets two questions: "Where is it from?" and "Who may see it?".

**Don't know something?** Leave it blank, or say why:
- **Not available:** it doesn't exist.
- **Not sure:** you'll check.
- **Please review:** Mulemark takes a short look.

Anything needed before go-live comes back once, in one list.

**Photos:**
- One folder per asset code.
- Or one model photo for identical machines, in the model's folder.
- Shoot from the side, which keeps people and license plates out.
- Upload the folders as they are, through the link in the welcome email.

**Then:** you get one list of anything missing, a preview of every page, and your approval of that exact version.

## 2. The independent run

**Persona and inputs:**
- A rental-yard administrator with 60 machines.
- The fleet export `scripts/phase-e/intake/fixtures/fleet-export.csv`, with codes with leading zeros, quotes and commas in names, and a missing make.
- The customer packet only.

**Method:** a read-only pass. The agent wrote nothing.

**Its time estimate for 60 machines:**
- **Export sent as is, one photo per model for identical trailers:** 4–6 hours of hands-on work. That is reading 45 minutes, company tab 30 minutes, about 8 models 2 hours, photos 1–2 hours, and answering the gaps and uploading 1 hour.
- **Typing ASSETS by hand, one photo per machine:** 9–12 hours.
- **Either way:** 1–2 weeks from start to finish, because machines are out on rent and the owner signs off.

The first estimate is the case the kit is built for, and the fixes below aim at it.

### Findings and what changed

| # | Finding | Severity | Change |
|---|---|---|---|
| 1 | "Send your export as it is" never says whether to skip ASSETS, or when you'll see the gaps | Blocker | START HERE, guide p. 2 and the welcome email: "Send it as it is and skip MODELS and ASSETS. We'll fill them from your list and send the workbook back for you to check." The pre-filled workbook's banner says the Asset name is what renters see |
| 2 | "Leave blank what you don't know" contradicts "Pick Not available, Not sure or Please review"; none of the three is defined | Confusing | Each answer defined in one line on START HERE and guide p. 2. Blank is fine; a blank answer needed before go-live is asked for once |
| 3 | "Fill the tabs in order" clashes with ASSETS picking from MODELS (then tab 3); "Model" also means the maker's number | Confusing | MODELS is tab 2, ASSETS tab 3. The ASSETS column is "Model name (from MODELS)"; its Check says "Pick a model name" |
| 4 | "One clear photo per asset" never mentions "Use model photo"; the folder chart has no place for a model photo | Confusing | The guide's folder chart and photo bullet both say one photo per model for identical machines, in the model's folder. The MODELS hint says the same |
| 5 | What's the default for files in the standard folders? The permission list mixed who owns a file with who may see it, and the example's "counter handout" was Staff only while MODELS listed it for renters | Confusing | FILES & NOTES asks "Where is it from?" and "Who may see it?" separately. The guide states the folder defaults ("Who sees what"). A FILES row can only narrow a default, never widen it: enforced in the manifest and tested. The example lists two true exceptions: a staff-only checklist, and a maker's card meant for renters |
| 6 | The EXAMPLE ASSETS printout stops at 00129, and no E20 row shows a year and serial | Confusing (QA print area) | The varied machines lead the example, so the first screen shows every model, the E20 years and serials, the "Not sure" compactor and the punctuated name. The QA export now prints 45 rows |
| 7 | Email alerts unexplained: what can renters do on a page? | Confusing | Each alert's hint says what triggers it. The welcome email links getmulemark.com/demo to see a finished page |
| 8 | "No license plates", but trailers carry them | Confusing | "Shoot from the side: it keeps people and license plates out." The crossed-out frame now reads "No paperwork or ID" |
| 9 | Support phone and email both marked go-live, but only one is needed | Minor | Both hints: "Phone, email or both: at least one" |
| 10 | Category on both ASSETS and MODELS; MODELS return rules overlap the company-wide rules | Minor | ASSETS › Category: "Only if different from its model's category" (the example now leaves it blank). MODELS › return rules: "Only what's special for this model; general rules go on COMPANY & PEOPLE" |
| 11 | "May renters see the manual?" hint explained nothing | Minor | The hint now says what each choice does |
| 12 | LISTS and MODELS print too small; both "Mini excavator" and "Compact excavator" offered | Minor, not changed | The workbook is filled in on screen, not printed. Both are common names, and both map to the same return checklist. START HERE now prints on one portrait page |

### Things the administrator couldn't know, and how the kit handles them now

- **Whether a manual changes by year or serial:** "Not sure is fine: we check the manual." It becomes a bounded Mulemark item, not a guess.
- **Copyright calls** (the old "Maker allows public use" and "Link only"): gone. Two factual questions replace them.
- **Smaller gaps:**
  - Hex colors: "Match our logo" is a choice.
  - "Vector file" now reads "a design file (.ai, .eps)".
  - "Field mapping 1.0.0" is no longer on START HERE.
  - Administrator vs Staff is explained in the Role hint.
  - Excel's import wizard isn't needed: send the export as it is.

### Commitment and privacy questions

| Question | Answer in the kit |
|---|---|
| The guide and scope sheet carry DRAFT badges: what can I rely on? | Intentional until the commercial and legal reviews. They come off when `REVIEWED` is set in `documents.mjs`, which is an operator step before the first customer |
| What's a batch? Does one missing serial stop the clock? | Scope sheet: a batch is the equipment sent together, named once everything has arrived. Complete machines can launch first, only with the customer's say-so |
| Is anything billed by the hour? | Scope sheet: time is tracked to plan the work; what you pay is set by your agreement |
| The workbook asks for tag size and material, but the agreement sets tag details | Hints: "A preference only; your agreement sets the options" |
| Could our handover text become another company's template? | Scope sheet: reusable templates come from makers' manuals and never include your files, photos or rules. Every file stays on your own pages |
| The export carries our rates and yard locations. Will serials or plate photos be public? | Scope sheet: unused export columns are left out and never published, and serials and years aren't shown on public pages (checked: no public route renders either). The photo guidance keeps plates out |
| Who attaches the tags? Does stainless cost more? | **Open, commercial.** The kit doesn't answer; the agreement does. Raised for the commercial review |

### The administrator's first questions, answered

1. **Skip ASSETS when sending the export? Will "Description" become the name renters see?** Yes, skip MODELS and ASSETS. The pre-filled workbook asks you to check each Asset name.
2. **Is blank the same as Not sure?** Blank is fine; START HERE and the guide define the three answers.
3. **Does the upload link take whole folders?** The guide says to upload your folders as they are, and the operator's upload-channel step requires a channel that accepts folders.
4. **Can I see a sample renter page?** getmulemark.com/demo, linked in the welcome email.
5. **What's the default for files in the standard folders?** Guide, "Who sees what".
6. **Only paper manuals?** MODELS › Manual: a phone scan is fine.
7. **Yard staff without a company email?** People › Email: any address they read works. The app's invite accepts any valid email.
8. **Daily summaries in our time zone?** Not today: the scope sheet says they use Pacific Time. This is a product limit, unchanged by E3.

## 3. Re-checked after the fixes

Every check in [QA.md](QA.md) was re-run on the final build: the gates, the reproducible rebuild, the visual review, real Excel, real Word and the command-line tools.
