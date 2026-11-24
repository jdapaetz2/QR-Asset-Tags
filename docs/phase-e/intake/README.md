# Mulemark intake kit (Engineering Phase E3)

The files sent right after a customer agrees to a pilot, and the procedure behind them. Version 1.0 (field mapping 1.0.0).

The customer fills **one workbook** and uploads photos and files into **simple folders**; Mulemark checks it, sends **one** list of anything missing, prepares the pages, and asks for an approval before anything goes live. Nothing here changes the app or Production.

## What's in it

| Folder | For | Contents |
|---|---|---|
| [`customer/`](customer/) | Send to the customer (ZIP: `npm.cmd run phase-e:intake:zip`) | Onboarding guide (PDF and DOCX), blank intake workbook, completed EXAMPLE workbook (fictional), scope and assumptions sheet (DRAFT), CSV templates with a short note |
| [`internal/`](internal/) | Mulemark only | [How to run an onboarding](internal/README.md), [procedure and responsibilities](internal/onboarding-procedure.md), onboarding tracker (checklist, responsibilities, exception log, touch time), five email templates and [their placeholders](internal/emails/PLACEHOLDERS.md), content-approval wording (DRAFT), tag-production handoff, field mapping and intake schema |
| [`example-run/`](example-run/) | Reference | The check tool's output for the EXAMPLE workbook: readiness report, the one missing-information email, the current-import CSV, the contract manifest, interchange CSVs |
| [`QA.md`](QA.md), [`WALKTHROUGH.md`](WALKTHROUGH.md) | Records | What was checked and how, and a rental administrator's walkthrough |
| `MANIFEST.json` | Integrity | Bytes and SHA-256 of every generated file |

## Commands

These are `npm run` commands, so run them from the project folder.

| Command | Does |
|---|---|
| `npm.cmd run phase-e:intake:build` | Rebuilds everything here from `scripts/phase-e/intake/` (same input, same bytes) |
| `npm.cmd run phase-e:intake:build -- --check` | Rebuilds in a temporary folder and reports any file that differs from the committed one |
| `npm.cmd run phase-e:intake:zip` | Writes the customer and internal ZIPs to `packets/` (gitignored) |
| `npm.cmd run phase-e:intake:check -- --workbook <file> --files <upload folder> --out <private folder>` | Checks a filled workbook; writes the report and the one email into private storage |
| `npm.cmd run phase-e:intake:prefill -- --fleet-export <file> --out <private folder>` | Turns a customer's own fleet list into a pre-filled workbook |

**Customer data never goes in Git.** Filled workbooks, uploads and check results live in `%USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\`. The check and prefill tools refuse to write inside this repository.

## Changing the kit

Edit the sources in `scripts/phase-e/intake/` (the field mapping, the documents' text, the example), rebuild, and commit the regenerated files. A label change keeps its stable key; a new or removed field bumps the field mapping's version. The DRAFT marks on commercial and legal wording come off by setting `REVIEWED` in `documents.mjs` after those reviews, then rebuilding.
