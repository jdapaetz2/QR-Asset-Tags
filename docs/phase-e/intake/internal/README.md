# Running a customer onboarding (internal)

How to use the intake kit for one customer batch. The rules and the full checklist are in [onboarding-procedure.md](onboarding-procedure.md); keep a copy of the [tracker](mulemark-onboarding-tracker-v1.0.xlsx) per batch.

## 1. Before the welcome email

1. **Private folder.** Create `%USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\` with `upload\` and `check\` inside, and copy the tracker there. Nothing from this folder ever goes into Git.
2. **Upload channel (setup step).** No channel is configured yet. Before the first customer, choose one approved, upload-only link per customer (for example a file-request link from the business cloud storage you already use). It must accept whole folders, because the guide asks customers to upload their `Photos/`, `Model documents/` and `Company/` folders as they are. Never a public folder, never large email attachments. Paste the link into the welcome email as `{{upload_link}}`.
3. **Organization.** Create it in the owner UI. Plan fields stay owner-only.

## 2. Welcome

Send [01-welcome](emails/01-welcome.md) with the customer packet (`npm.cmd run phase-e:intake:zip` writes `packets/mulemark-customer-packet-v1.0.zip`). Fill every `{{placeholder}}` ([list](emails/PLACEHOLDERS.md)).

## 3. Receive and check

- **They sent only their fleet list:** turn it into a pre-filled workbook and send that back to finish:
  `npm.cmd run phase-e:intake:prefill -- --fleet-export <their file> --out <batch>\check --company "<name>"`
  Read `fleet-mapping.json`: columns it couldn't map are listed, never guessed.
- **They sent the workbook and files:** download the upload into `<batch>\upload\` (keep their folder names), then:
  `npm.cmd run phase-e:intake:check -- --workbook <batch>\upload\<workbook>.xlsx --files <batch>\upload --prepared <prepared.json> --batch <id> --out <batch>\check`
  - `--prepared` (optional) lists models that already have an approved reusable pack: `[{ "model_name": "<their model name>", "model_key": "bigtex.35sa.12" }]`. Add `"manual_cleared": true` only when that pack's manual and its rights were reviewed. The example run shows the format.
  - The tool refuses macro workbooks, never runs formulas or opens links, and holds back anything that looks like a formula, a card number or a password.
- **Read** `check\readiness.md`. Log each item on the tracker's EXCEPTIONS tab.
- **Send the one request:** `check\missing-information-email.md` is the drafted email (customer items only, grouped by model). Fill the upload link and your name. One per batch.

## 4. Prepare and import

- **Pages per model**, from approved reusable packs where they exist, the maker's manuals and the customer's own rules. Research is bounded (about 45 minutes per model, no purchases, no logins, no invented links); anything unresolved goes back in the one request.
- **Import as private drafts.** `check\current-import.csv` has publish and QR flags off and no category page text. Today the CSV import runs only as the customer's administrator (Dashboard › Assets › Import), so they upload it, or do it with you on a call; the owner-led import arrives with E4B. `check\manifest.json` is the same batch in the content contract (schema 1.3.0) for E4.

## 5. Review, approval and tags

- Send [03-review-request](emails/03-review-request.md) with the preview link and content version.
- **Approval** uses the [approval wording](content-approval-form-DRAFT.md) (DRAFT, legal review pending). The authenticated in-app approval record is E5A's. Until it exists, a pilot needs the approver's own written approval quoting that wording, the content version and the included and excluded asset codes, kept in the batch folder and logged on the tracker. Silence is never approval.
- Send [04-approval-acknowledgement](emails/04-approval-acknowledgement.md).
- **Tags:** export Owner › Production › CSV for the included assets only, paste it into the [tag-production handoff](tag-production-handoff-v1.0.xlsx) TAGS tab and fill HANDOFF (ship-to and delivery contact come from the customer's workbook).

## 6. Go live and close

- Publish the approved pages. Invite the team: each person gets their own sign-in link, sent separately. Send [05-go-live](emails/05-go-live.md).
- Record the batch on the tracker's TOUCH TIME tab: hands-on minutes, customer wait and tag manufacturing separately, and the business days from complete batch to review-ready preview (target about 3, internal only).

## QA tools (Windows with Microsoft Office)

| Script | Does |
|---|---|
| `scripts/phase-e/intake/qa/excel-checks.ps1` | Opens the workbooks in Excel (copies): repair check, dropdowns, Check formulas, typed edge cases, the paste test, PDF pages |
| `scripts/phase-e/intake/qa/excel-open.ps1` | Quick open-and-repair check for any workbook |
| `scripts/phase-e/intake/qa/word-checks.ps1` | Opens documents in Word (copies): page and word counts, US English spelling |
| `scripts/phase-e/intake/qa/word-render.ps1` | Renders each Word page to PNG with Word's own layout |
| `scripts/phase-e/intake/qa/spell-corpus.mjs` | Collects the workbook's text for the spelling check |
