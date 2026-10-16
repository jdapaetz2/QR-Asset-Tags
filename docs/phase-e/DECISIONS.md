# Phase E decisions (Engineering Phase E0)

**Status:** 2026-10-14. Section 1 is binding (operator decisions in the Phase E brief) and is **not re-asked**. Section 2 records the scope reconciliation E0 is required to make. Section 4 is the one grouped approval E0 requests.

**Approved by the operator on 2026-10-16: items 1–5, as written.** The OMM purchase inside item 1 is a spending decision. It still needs an explicit cost confirmation before anything is bought.

## 1. Already decided (binding, not re-asked)

- **Protected destinations:** keep the four published demo destinations and any destination on approved business-card artwork. No replacement QR artwork, no new domain, no rotation to tidy names.
- **Real equipment only:** real makes, models, manuals, photos and instructions. Fictional ids, people and histories only as labelled demo material.
- **Northridge's role:** it is the polished showcase, not the QA sandbox. Archive its history recoverably first. Destructive QA moves to a separate org. No cross-tenant row reassignment by default.
- **Synthetic history:** about 90–120 days, about 70–100 completed rentals over four assets, as scenario targets rather than benchmarks. One story per asset: guidance/handoff; condition evidence; accessories/returns; support on simpler equipment.
- **Pictographic guidance:** a prominent deliverable and possibly a paid service, but never autonomous invention of operating instructions.
- **Manuals:** prefer controlled hosting where permitted, reuse one verified revision, and share across orgs only expressly approved material.
- **Onboarding division of labour:** the customer supplies facts and files; Mulemark configures, maps, imports and checks. Research is bounded and returns one consolidated request. No guessed values.
- **Scale:**
  - 25–250 assets in batches;
  - no general ETL and no self-signup;
  - about 3 business days to review-ready as an internal objective;
  - elapsed time, customer wait and hands-on minutes measured separately.
- **Approval:** an affirmative approval before public release and tag production. Silence is not approval, and approval is not a waiver.
- **Physical tags:** they may be the longest lead time, so software work runs in parallel.

## 2. Non-goal reconciliation: four limited extensions

`docs/NON_GOALS.md` stays in force. Each extension below is narrow, and every ban it touches is restated. A pointer is added to `NON_GOALS.md` and `OPEN_QUESTIONS.md` (#19).

| Non-goal (NON_GOALS.md) | Limited extension for Phase E | What stays banned |
|---|---|---|
| "AI-generated safety instructions — the platform never generates or guarantees safety content" (L26); "does not author … equipment-specific safety or operating instructions" (L33-35) | **Supervised, source-traceable demo quick guides and original pictographic artwork** for the four showcase models, and later as a reviewed service. Every step cites the OEM manual or a customer policy; a qualified reviewer checks it; nothing generic is assumed correct for a model | The platform never generates or publishes guidance on its own. No unsourced step, no category-derived control instruction, no flipped or stylized safety-critical control |
| "Automated customer self-signup — onboarding is manual by the platform owner" (L24) | **Owner-led batch preparation**: an owner-run, dry-run-first, resumable import for an explicit org, plus customer review and preview | Self-signup, public account creation, self-serve billing |
| (No approval feature exists; contracts are out of scope) | **An authenticated operational content-approval record**: who approved which content version for which assets, when | E-signature services, rental contracts or agreements, any claim that approval waives liability |
| "Automated link checking — link status is manual in MVP" (L27) | **Bounded onboarding source validation**: a header and format check of the sources named in a batch manifest, at onboarding time | General crawling, scheduled fleet-wide link monitoring, login or paywall bypass |

Any material conflict beyond these limits comes back for approval. Nothing is deleted from `NON_GOALS.md`.

## 3. Draft operational approval language (for legal review — not final)

> **Content approval — [organization], content version [vN], assets [included list]; excluded [list].**
> I confirm, as [approver role], that I have reviewed the content in this preview. To the best of my knowledge, the equipment facts and files our company supplied are accurate. The content may be published on the public equipment pages for the listed assets, and tags may be produced for them.
> Mulemark does not author operating or safety instructions. Guidance shown here cites its sources, and our company remains responsible for its equipment, rental terms and safety obligations.
> This approval records a division of responsibility for this content version. It does not waive Mulemark's responsibility for defects in its service, or our company's remedies. It is not a rental agreement, a contract amendment or an electronic signature. Commercial and legal terms are agreed separately.

The record stores: approver profile and role, timestamp, content version hash, included and excluded asset codes, and preview reference. Silence, a timeout or a closed preview is never approval. Legal review of this wording is a separate, operator-owned step.

## 4. The grouped approval E0 requests

| # | Approve | Where | Unblocks |
|---|---|---|---|
| 1 | **Four identities and source approach.** Bobcat E20 · Caterpillar 301.5 · Big Tex 35SA · Big Tex 14LP. Manuals by **official link** (no hosting without OEM permission). **Cost decision:** buy one Bobcat E20 OMM (P/N 7255004) and one Cat 301.5 OMM for private source preparation only. Photos: the existing CC BY-SA Bobcat photo with on-page credit; the CC0 Cat photo if its generation checks out; **owned or permitted photos for both Big Tex trailers**; replace the marketing site's Twister trailer photo | [CANONICAL_SHOWCASE_FLEET.md §3](CANONICAL_SHOWCASE_FLEET.md#3-recommended-identities-one-per-code) | E2A |
| 2 | **Archive and reset boundary.** Keep the org, all 11 asset rows, all 12 QR rows, the summary ledger and the demo login in place. Archive all activity with Storage bytes and hashes outside Git. Rebuild only the 4 showcase pages and history. Other assets archived in-app only if never printed. Destructive QA moves to the staging QA orgs | [§8](CANONICAL_SHOWCASE_FLEET.md#8-archive-and-reset-boundary) + [manifest](manifests/northridge-archive-boundary.json) | E1 |
| 3 | **Synthetic history strategy.** 105 days, 90 completed rentals, 2 on rent at the anchor; manifest-pinned ids as the only marker; a chronological service-role loader with post-insert `UPDATE`; every timestamp below the digest watermark; no emails | [§5–6](CANONICAL_SHOWCASE_FLEET.md#5-history-design-e2b-builds-it-deterministic-in-isolation-first) | E2B |
| 4 | **Bounded authoring and research scope.** The four extensions in §2; about 45 minutes and about 2 authoritative sources per model group; no purchases beyond item 1 without a new cost decision | §2 above, [contract §4](ONBOARDING_DATA_CONTRACT.md#4-reuse-correction-and-research-limits) | E2A, E4B |
| 5 | **Initial onboarding and approval design.** The four-layer contract and schema; Draft / Review-ready / Publishable tiers; the four review statuses; blocker and warning rules; partial release only with explicit lists; the provisional 3-business-day objective with measurement; the draft approval language for legal review | [ONBOARDING_DATA_CONTRACT.md](ONBOARDING_DATA_CONTRACT.md), §3 above | E3, E4A/B, E5A |

### Operator actions (independent of the approval, but they gate the E2C cutover)

1. **Business cards.** Each ordered variant's final proof or a phone scan; read the URL without opening it.
2. **Printed sheets and tags.** Was the 2026-07-20 QR sheet (host `qr-asset-tags.vercel.app`) or any tag from the Northridge tag requests ever printed?
3. **Photos.** Owned photos of a Big Tex 35SA and 14LP, or written permission from Big Tex. Confirm the Cat photo's generation in E2A.
4. **Northridge logo.** Approve replacing the hotlinked real dealer logo with owned fictional artwork, and choose a support number: fictional 555-01XX or a real demo line.
5. **Marketing site.** Replace the TRAILER-014 Twister photo (marketing repo, operator's tool) once the 35SA photo exists.
