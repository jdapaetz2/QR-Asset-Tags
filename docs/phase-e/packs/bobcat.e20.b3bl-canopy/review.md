# Bobcat E20: content pack review copy

Generated from [pack.json](pack.json) by `scripts/phase-e/packs/pack-review.mjs`. Do not edit by hand. E2A draft; nothing here is published.

| | |
|---|---|
| Asset | `EXCAVATOR-017` · Excavator 017 · serial `DEMO-E20-0017` |
| Protected route | `demo-ex017` (unchanged) |
| Model key | `bobcat.e20.b3bl-canopy` · Compact Excavator |
| Review status | **MULEMARK_REVIEW** |
| Items | 1 READY · 24 REVIEW_REQUIRED · 9 BLOCKED |
| Storyboard | [storyboard.md](storyboard.md) (8 panels) |

## Blockers

- OMM 7255004 not yet in hand (the operator is buying it): specifications, start-up, controls, attachments and transport points; panels 3, 4, 7 and 8.
- Knowledgeable review of the drawn panels and page text by the named reviewer (the operator).

## Warnings and missing facts

- B-1699 is Bobcat's general compact-excavator rental sheet; each rule taken from it is cross-checked against the E20 OMM on receipt.

## Configuration

| Item | Value |
|---|---|
| generation | E20 with serial prefix B3BL (the model Bobcat sold until the new E20 of November 2025) |
| operator protection | canopy (matches photo candidate A) |
| tracks | rubber |
| arm | not established (OMM; candidate B shows the long arm) |
| control pattern | not established (OMM) |
| auxiliary hydraulics | not established (OMM) |
| blade | fitted |

Applicability: serial from `B3BL11001`. Per Bobcat's listing for OMM 7255004; confirmed when the manual arrives. Never use brochure B-3038, which describes the newer E20.

## Manual and supplements

| Role | Source | Availability | Delivery |
|---|---|---|---|
| Manual | [E20 Compact Excavator Operation & Maintenance Manual](https://shop.bobcat.com/ca/e20-excavator-operation-and-maintenance-digital-manual-7255004enuspdf) (7255004 ENUS; for serial B3BL11001 and above per Bobcat's listing (confirmed on receipt)) | to-purchase | link |
| Supplement | [Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699)](https://res.cloudinary.com/doosan-bobcat/image/upload/v1642696283/bobcat-assets/na-approved/products/excavators/multi-model/literature/b-1699-rentitsafely-excavator.pdf) (04/25) | in-hand | link |
| Supplement | [Service Schedule: E19, E20 Compact Excavator (SS EXC E19 E20-0315)](https://res.cloudinary.com/doosan-bobcat/image/upload/v1650574486/bobcat-assets/na-approved/products/excavators/compact-excavators/service-schedules/ss-exc-e19-e20-0315.pdf) (0315) | in-hand | link |

## Photo

**READY**: Candidate A, chosen by the operator on 2026-10-17. Licence CC BY-SA 4.0 with credit; edits recorded.

Credit: TaurusEmerald, CC BY-SA 4.0 (modified), [source](https://commons.wikimedia.org/wiki/File:Bobcat_E20_Mini_Excavator.jpg).

- Removed the rental company's phone number, name and sticker from the lower body panel (the E20 decal is kept).
- Removed the rental fleet number from the canopy roof.
- Cropped to 16:9 and resized; credit label added.

| File | Size | Bytes | SHA-256 |
|---|---|---|---|
| [media/e20-hero-a.webp](media/e20-hero-a.webp) | 1280x720 | 173670 | `0f9718aa0cff16c6…` |
| [media/e20-hero-a.jpg](media/e20-hero-a.jpg) | 1280x720 | 183852 | `9d319f30c7952c48…` |

## Specifications

| Spec | Value | Source | Status |
|---|---|---|---|
| Specifications (weights, dimensions, engine, capacities) | Not yet sourced: taken from OMM 7255004 once it is bought | E20 Compact Excavator Operation & Maintenance Manual, Specifications section | BLOCKED: The operator is buying the manual. Current Bobcat web specs describe the newer E20 and are not used. |

## Quick guide (renter)

1. Before you dig, call 811 and learn where underground lines run. Check the area for holes, drop-offs and soft ground. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "Knowing the Worksite"
   - Status: **REVIEW_REQUIRED**: 811 is the number on Bobcat's sheet and the operator's default for Northridge.
2. Walk around the machine before you start: look for leaks and broken or damaged parts. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 1, "Before Operating"; Service Schedule: E19, E20 Compact Excavator (SS EXC E19 E20-0315), PDF p. 1, "Every 10 Hours (Before Starting The Excavator)"; Northridge policy `pol-renter-walkaround`
   - Status: **REVIEW_REQUIRED**: Northridge policy (operator default): the yard does the daily service checks; the renter walks around.
3. Climb on and off using the grab handles and tracks; never jump off. Fasten the seat belt snugly. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 1, "Before Operating"; PDF p. 2, "Leaving the Machine"
   - Status: **REVIEW_REQUIRED**
4. Start the machine only from the seat, with the steering levers and controls in neutral. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
5. Keep bystanders away and never lift the boom or an attachment over anyone. Look in the direction of travel before moving or swinging. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
6. Pushing the steering levers away from you drives the machine toward the blade, so check where the blade is first. Travel with the attachment low. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
7. Do not travel across or up slopes over 15 degrees, or down or backing up slopes over 25 degrees. Do not swing loads on a slope. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
8. Stay within the rated lift capacity on the machine's lift chart. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
9. Before leaving the seat: lower the attachment to the ground, shut down, take the key out and raise the control console. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "Leaving the Machine"
   - Status: **REVIEW_REQUIRED**
10. To trailer it: drive up the ramp with the heavy end uphill, engage the slew lock and chain the machine down at its tie-down points. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 1, "Safely Transporting the Machine and Attachment"
   - Status: **REVIEW_REQUIRED**: The tie-down points and slew lock are located from the OMM.
11. Engine start, warm-up and shutdown procedure. *(safety-critical)*
   - Source: E20 Compact Excavator Operation & Maintenance Manual, Operating Instructions (section to be located on receipt)
   - Status: **BLOCKED**: Needs OMM 7255004.
12. Control layout and lever functions: dig, swing, boom offset, blade, travel and any pattern selector. *(safety-critical)*
   - Source: E20 Compact Excavator Operation & Maintenance Manual, Operating Instructions (section to be located on receipt)
   - Status: **BLOCKED**: Needs OMM 7255004; never drawn from generic material.
13. Using hydraulic attachments: the auxiliary hydraulics mode switch.
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 1, "Before Operating"; E20 Compact Excavator Operation & Maintenance Manual, Auxiliary hydraulics (section to be located on receipt)
   - Status: **BLOCKED**: B-1699 names the switch; its location and use come from the OMM.

## Warnings (renter)

1. Never carry riders. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
2. Never operate the controls from the ground. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "While Operating"
   - Status: **REVIEW_REQUIRED**
3. Keep hands and feet inside the operator's area while the machine is on. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 2, "Leaving the Machine"
   - Status: **REVIEW_REQUIRED**
4. Never smoke while fueling. *(safety-critical)*
   - Source: Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699), PDF p. 1, "Before Operating"
   - Status: **REVIEW_REQUIRED**

## Support notes (staff only, never public)

1. "How do I start it?" or "Which lever does what?": point the renter to the Start-Up Guide once its control panels are approved; until then, staff answer from the OMM. *(safety-critical)*
   - Source: E20 Compact Excavator Operation & Maintenance Manual, Operating Instructions
   - Status: **BLOCKED**: Needs OMM 7255004.

## Safety signs

| Sign | Kind | Shows | From | Status |
|---|---|---|---|---|
| No riders `e20-sign-no-riders` | prohibition | A person riding on the excavator, crossed out | `e20-w1` | REVIEW_REQUIRED: Drawn 2026-10-17 from the cited warning; awaiting the named reviewer (the operator). |
| Never from ground `e20-sign-no-ground-controls` | prohibition | Someone working the controls from the ground, crossed out | `e20-w2` | REVIEW_REQUIRED: Drawn 2026-10-17 from the cited warning; awaiting the named reviewer (the operator). |
| Hands, feet inside `e20-sign-limbs-inside` | mandatory | The operator seated with hands and feet inside the canopy | `e20-w3` | REVIEW_REQUIRED: Drawn 2026-10-17 from the cited warning; awaiting the named reviewer (the operator). |
| Fueling: no smoking `e20-sign-no-smoking-fueling` | prohibition | A fuel nozzle and a lit cigarette, crossed out | `e20-w4` | REVIEW_REQUIRED: Drawn 2026-10-17 from the cited warning; awaiting the named reviewer (the operator). |
| Within lift chart `e20-sign-lift-chart` | limit | A lifted load at or under the machine's lift chart | `e20-s8` | REVIEW_REQUIRED: Drawn 2026-10-17 from the cited warning; awaiting the named reviewer (the operator). |
| Stop and call `e20-sign-stop-call` | info | A warning light, a leak or an odd noise; then stop and call Northridge | `pol-stop-and-report` | REVIEW_REQUIRED: Drawn 2026-10-17 from a Northridge demo policy; awaiting the named reviewer (the operator). |

## Public page text

The seven equipment-page fields in display order (2 READY · 3 REVIEW_REQUIRED · 2 BLOCKED). Citations stay here; the page shows plain text only.

### Headline · READY

> Bobcat E20 compact excavator with canopy. Read the Start-Up Guide before you start.

From: `model`, `operator_protection`. Identity facts.

### Quick start · BLOCKED

> 1. Call 811 first. Watch for holes, drop-offs, soft ground.
> 2. Walk around it: look for leaks and damaged parts.
> 3. Belt on, controls in neutral; start only from the seat.
> 4. Levers pushed away drive toward the blade. Check it first.
> 5. Slopes: 15° across or up, 25° down or backing up.
> 6. Keep people clear of the swing; never lift over anyone.
> 7. Leaving: bucket down, engine off, key out, console up.
> 8. Transport: heavy end uphill, slew lock on, chained down.
> The Start-Up Guide shows each step.

From: `e20-s1`, `e20-s2`, `pol-renter-walkaround`, `e20-s3`, `e20-s4`, `e20-s6`, `e20-s7`, `e20-s5`, `e20-s9`, `e20-s10`. Start-up and control steps come from Bobcat's E20 manual (7255004), not in hand yet. Publish after they are added and reviewed.

### Safety · REVIEW_REQUIRED

> Keep people out of the swing area; never lift over anyone.
> Slopes: 15° across or up, 25° down or backing up. No swinging on a slope.
> No riders.
> Never work the controls from the ground.
> Keep hands and feet inside while the machine is on.
> No smoking while fueling.
> Stay within the lift chart on the machine.

From: `e20-s5`, `e20-s7`, `e20-w1`, `e20-w2`, `e20-w3`, `e20-w4`, `e20-s8`. Shortened picture-first on 2026-10-17 (one line per panel or sign); awaiting the reviewer.

### Fuel / power · BLOCKED

*(empty)*

From: none. Fuel type and tank capacity come from the E20 manual.

### Troubleshooting · REVIEW_REQUIRED

> Something wrong (a warning light, leak or odd noise): stop, lower the bucket to the ground, shut down and use Request Support.

From: `pol-stop-and-report`, `e20-s9`. Northridge policy plus Bobcat's leaving-the-machine sequence; awaiting the reviewer.

### Return · REVIEW_REQUIRED

> Return the keys and any attachments.
> Leave it with the bucket on the ground, engine off, key out and console up.
> Use Return checklist when you drop it off.

From: `template:mini_excavator_skid_steer`, `e20-s9`. Accessories from the return checklist template; the parking line from Bobcat's sheet.

### Emergency · READY

> For emergencies call your local emergency number. For equipment issues, use the support contact on this page.

From: `mulemark-standard-emergency`. Mulemark's standard emergency wording (lib/onboarding/templates.ts).

## Documents on the page

| Title | Type | Delivery | Target | Status |
|---|---|---|---|---|
| Bobcat E20 Start-Up Guide | startup_guide | hosted | [guide/bobcat.e20.b3bl-canopy-start-up-guide.pdf](guide/bobcat.e20.b3bl-canopy-start-up-guide.pdf) (204287 bytes, 2 pages) | REVIEW_REQUIRED: Carries the review-draft badge until every panel and sign is approved. |
| Bobcat E20 Operation & Maintenance Manual (sold by Bobcat) | manual | link | [link](https://shop.bobcat.com/ca/e20-excavator-operation-and-maintenance-digital-manual-7255004enuspdf) | READY: Bobcat's official channel; the manual is sold, not free. |
| Bobcat Rent It Safely: compact excavator safety rules | safety_sheet | link | [link](https://res.cloudinary.com/doosan-bobcat/image/upload/v1642696283/bobcat-assets/na-approved/products/excavators/multi-model/literature/b-1699-rentitsafely-excavator.pdf) | READY: Bobcat's free official rental safety sheet, linked. |

## Showcase story: Guidance and handoff

A renter scans the tag on site, opens the Start-Up Guide built from Bobcat's documents and acknowledges it. Staff record the outbound condition, a support question is answered by pointing to the guide, and most returns are clean.

**What it does not show:** It shows the guidance was delivered and acknowledged, not that it was read or understood.

## Checklists

Return and outbound template: `mini_excavator_skid_steer`. Accessories: Keys, Attachments, Manual.

Accessory icons: Keys (`keys`, from `template:mini_excavator_skid_steer`, REVIEW_REQUIRED); Attachments (`attachment`, from `template:mini_excavator_skid_steer`, REVIEW_REQUIRED); Manual (`manual`, from `template:mini_excavator_skid_steer`, REVIEW_REQUIRED).

- Northridge policy `pol-renter-walkaround`: Northridge does the daily service checks before each rental; renters walk around for leaks and damage before starting. (Fictional demo policy.)
- Northridge policy `pol-stop-and-report`: If something seems wrong (a warning light, leak or unusual noise), stop safely and contact Northridge with Request Support. (Fictional demo policy.)

Files: `docs/phase-e/packs/bobcat.e20.b3bl-canopy/`.
