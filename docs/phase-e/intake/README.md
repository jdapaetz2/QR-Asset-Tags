# Mulemark onboarding kit (Engineering Phase E3, kit 2.0)

Onboarding is a 30-minute call plus the customer's own equipment list, and the customer checks one page per model on a phone. That's about 1–2 hours at their desk. Mulemark does the rest, with two commands that do the paperwork. Nothing here changes the app or Production.

Kit 2.0 replaced the 1.0 intake kit on 2026-11-24, at the operator's request ([WORK_LOG](../WORK_LOG.md), "E3 rework"). In 1.0 the customer filled a 5-tab workbook and uploaded folders.

## What's in it

| Folder | For | Contents |
|---|---|---|
| [`customer/`](customer/) | The only files a customer gets | The one-page "what to expect" sheet (PDF), and an equipment-list template for customers without rental software |
| [`internal/`](internal/) | Mulemark only | [How to onboard a customer](internal/README.md), the setup workbook (blank and a fictional EXAMPLE), four email templates and [their placeholders](internal/emails/PLACEHOLDERS.md), the scope reference (DRAFT), the one-pager in Word, the tag order, the field mapping and the intake schema |
| [`example-run/`](example-run/) | Reference | What `onboard:check` writes for the EXAMPLE: the to-do list, the questions email, the preview and go-live drafts, the tag order, the import CSV and the contract manifest |
| [`QA.md`](QA.md), [`WALKTHROUGH.md`](WALKTHROUGH.md) | Records | What was checked and how, and the walkthrough of both sides |
| `MANIFEST.json` | Integrity | Bytes and SHA-256 of every generated file |

## Commands

Run these from the project folder.

| Command | Does |
|---|---|
| `npm.cmd run onboard:start -- "Company Name" [--sender "Your Name"]` | Starts a customer's batch in private storage: their setup workbook, `inbox\` and its folders, the two files to send, and the welcome email |
| `npm.cmd run onboard:check -- "Company Name"` | Fills MODELS and ASSETS from their list (once), checks everything, and writes the to-do list and the plain-text email drafts |
| `npm.cmd run phase-e:intake:build` | Rebuilds every file in this folder from `scripts/phase-e/intake/` (the same input gives the same bytes) |
| `npm.cmd run phase-e:intake:build -- --check` | Rebuilds in a temporary folder and reports any file that differs from the committed one |

**Customer data never goes in Git.** Everything for a customer lives in `%USERPROFILE%\Mulemark-Customer-Intake\<company>\batch-<n>\`. The onboard commands refuse to write inside this repository.

## Changing the kit

1. Edit the sources in `scripts/phase-e/intake/`: the field mapping, the documents' text, the example.
2. Rebuild, and commit the regenerated files.

**Versioning:** a label change keeps its stable key; a new or removed field bumps the field mapping's version.

**DRAFT marks:** the marks on commercial and legal wording come off after those reviews. Set `REVIEWED` in `documents.mjs`, then rebuild.
