# Onboarding procedure (internal)

Mulemark intake kit 1.0 (field mapping 1.0.0). The customer packet is in `../customer/`; the tracker for each batch is `mulemark-onboarding-tracker-v1.0.xlsx`, copied into private storage.

## Rules that always apply

- **One request.** Everything missing goes back to the customer once per batch, in the consolidated missing-information email the check tool drafts. Not a stream of questions.
- **No guessed values.** Unknowns stay unknown (Not available, Not sure, Please review) until someone who knows answers. Nothing guessed is ever published.
- **Bounded research.** Up to about 45 minutes per model and about two authoritative sources per fact; official sources only; no purchases without a cost decision; no logins; no invented links. Unresolved items join the one request.
- **Categories are labels.** A category never supplies operating instructions. Guidance exists only for an identified model, cites the maker's manual or the customer's own rule, and is reviewed.
- **Private storage.** Filled workbooks, uploads and check outputs live in `%USERPROFILE%\Mulemark-Customer-Intake\<company>\<batch>\`, never in Git. The check and prefill tools refuse to write inside the repository.
- **Permissions are per file and per customer.** A permission covers that customer's own pages. Nothing is shared with another company without its written permission. Folder defaults: the customer's photos, logo and instructions for renters show on their own pages; manuals follow the MODELS answer. A FILES & NOTES row (where it's from, who may see it) can only narrow that.
- **Approval before go-live.** An affirmative approval of an exact content version, recorded with the approver, time, included and excluded codes. Silence, a timeout or a closed preview is never approval, and approval is not a waiver.
- **Partial launch only on request.** Complete rows can go first when the customer explicitly agrees; the approval lists what's in and what's out.
- **Measure, don't promise.** About 3 business days from a complete batch to a review-ready preview is an internal target. Log hands-on minutes, customer wait and tag manufacturing separately (tracker, TOUCH TIME).

## Checklist

Gates must be done before the next stage.

| # | Stage | Step | Who | Gate |
|---|---|---|---|---|
| 1 | Agree | Customer agrees to a pilot. The agreement itself is handled outside this kit. | Customer and Mulemark | Gate |
| 2 | Set up | Create the organization in the owner UI. Plan fields are owner-only. | Mulemark |  |
| 3 | Set up | Create an upload-only folder for this customer on the approved channel. It must accept whole folders. Never a public folder or email attachments. Paste its link into the welcome email. | Mulemark | Gate |
| 4 | Invite | Send the welcome email with the guide, the blank workbook and the example. | Mulemark |  |
| 5 | Receive | Move the customer's workbook and files into private storage (Mulemark-Customer-Intake/<company>/<batch>), never into Git. Note the batch as complete when everything has arrived. | Mulemark | Gate |
| 6 | Check | Run phase-e:intake:check on the workbook (or phase-e:intake:prefill first for a raw fleet list). | Mulemark |  |
| 7 | Check | Send the one missing-information email the check tool drafted. Log each item on EXCEPTIONS. | Mulemark | Gate |
| 8 | Prepare | Prepare pages per model from approved templates, the maker's manuals and the customer's rules. Research up to about 45 minutes per model, no purchases, no invented links. | Mulemark |  |
| 9 | Prepare | Import the assets as private drafts (publish and QR flags off). Today: the current CSV import; later: the E4B owner import. | Mulemark |  |
| 10 | Review | Send the review request with the preview link and content version. | Mulemark |  |
| 11 | Approve | Record the approval: approver, time, content version, included and excluded codes. Silence is never approval. Send the acknowledgement. | Customer | Gate |
| 12 | Tags | Fill the tag-production handoff from the owner production CSV, for the included assets only. | Mulemark |  |
| 13 | Go live | Publish the approved pages. Invite the team; send each person their own sign-in link separately. Send the go-live email. | Mulemark | Gate |
| 14 | Close | Record the batch measurements on TOUCH TIME: elapsed days, customer wait, tag manufacturing and hands-on minutes. | Mulemark |  |

## Who does what

D = does it · A = approves · I = kept informed.

| Activity | Customer | Mulemark | Tag maker |
|---|---|---|---|
| Equipment facts, files and photos | D | I |   |
| Permission to use each file | D | I |   |
| Answers to the one consolidated list | D | I |   |
| Mapping and import as private drafts | I | D |   |
| Page content from approved templates and the maker's manuals | A | D |   |
| Bounded research (about 45 minutes per model) | I | D |   |
| Content approval before go-live | A | I |   |
| Publication of approved pages | I | D |   |
| Tag production | I | A | D |
| Rental terms and safety obligations | D |   |   |
