# E2A source and rights register

Generated from [SOURCES_REGISTER.json](SOURCES_REGISTER.json) by `scripts/phase-e/packs/pack-review.mjs`. Do not edit by hand.

- Hand-maintained master list. Every entry validates against definitions/source in docs/phase-e/schema/equipment-content.schema.json (1.1.0); each pack.json embeds copies of the entries it cites, and the pack tests check the copies match.
- Original bytes live in the private source vault outside Git (<home>/Mulemark-Sources/e2a, listed with SHA-256 in its SHA256SUMS). vault_path is relative to it.
- Rights: Big Tex, Bobcat and Caterpillar documents state no redistribution terms, so they are linked, never hosted, until written permission exists. Purchased manuals are private source material only.
- shareable_across_orgs stays false until the operator expressly approves reuse in other organizations (ONBOARDING_DATA_CONTRACT.md, MODEL layer). Linking an official URL is not affected.

| Source | Kind | Edition | Rights | Use | Availability | Verified | Used by |
|---|---|---|---|---|---|---|---|
| `src-bigtex-owners-2020`<br>[Big Tex Trailers Owners Manual](https://www.bigtextrailers.com/wp-content/uploads/2023/11/Big-Tex-Trailers_Owners-Manual_2020.pdf) | oem-manual | Rev. March 2020. Draft state: the lug-nut torque table is a placeholder (p. 70, "NEED TO INSERT NEW WHEEL TORQUE GUIDELINES HERE") | unknown | link-only | in-hand | read | TRAILER-014 |
| `src-bigtex-owners-2020-dump`<br>[Big Tex Trailers Owners Manual (Dump Trailers)](https://www.bigtextrailers.com/wp-content/uploads/2023/11/Big-Tex-Trailers_Owners-Manual_2020-Dump-Trailers-2.pdf) | oem-manual | Rev. March 2020. Draft state: the lug-nut torque table is a placeholder (p. 80) | unknown | link-only | in-hand | read | TRAILER-2041 |
| `src-bigtex-hoist`<br>[Hoist Manual](https://www.bigtextrailers.com/wp-content/uploads/2023/07/hoist-manual.pdf) | oem-manual | February 2013. Cover: 14LX/GX, 10LP-12 and 70LP dump trailers; BT-8, BT-10, BT-12, BT-18 and BT-20 hoists | unknown | link-only | in-hand | read | TRAILER-2041 |
| `src-bigtex-wiring`<br>[Standard Big Tex Electrical Connector Wiring Diagrams (Wiring Diagram)](https://www.bigtextrailers.com/wp-content/uploads/2023/07/wiring-diagram.pdf) | oem-document | © 2006, sheet 63. 4-way, 6-way and 7-way contact layouts, viewed into the open end of plug or socket | unknown | link-only | in-hand | read | TRAILER-014, TRAILER-2041 |
| `src-bigtex-plug-contacts`<br>[Standard Big Tex Electrical Connector Wiring Diagrams (Plug Contacts)](https://www.bigtextrailers.com/wp-content/uploads/2023/07/plug-contacts.pdf) | oem-document | Undated. 4-way, 6-way, 7-way RV and 7-way semi wiring, including the breakaway switch, battery and charger | unknown | link-only | in-hand | read | TRAILER-014, TRAILER-2041 |
| `src-bigtex-35sa-web`<br>[35SA Single Axle Utility Trailer (product page)](https://www.bigtextrailers.com/trailer/35sa/) | oem-web |  | unknown | link-only | in-hand | read | TRAILER-014 |
| `src-bigtex-14lp-web`<br>[14LP Heavy Duty Ultra Low Profile Dump (product page)](https://www.bigtextrailers.com/trailer/14lp/) | oem-web |  | unknown | link-only | in-hand | read | TRAILER-2041 |
| `src-bigtex-owners-index`<br>[Owners Manuals (index page)](https://www.bigtextrailers.com/owners-manuals/) | oem-web |  | unknown | link-only | in-hand | read |  |
| `src-bobcat-b1699`<br>[Rent It Safely: Safety Rules for Bobcat Compact Excavators (B-1699)](https://res.cloudinary.com/doosan-bobcat/image/upload/v1642696283/bobcat-assets/na-approved/products/excavators/multi-model/literature/b-1699-rentitsafely-excavator.pdf) | oem-document | 04/25 | unknown | link-only | in-hand | read | EXCAVATOR-017 |
| `src-bobcat-e19-e20-schedule`<br>[Service Schedule: E19, E20 Compact Excavator (SS EXC E19 E20-0315)](https://res.cloudinary.com/doosan-bobcat/image/upload/v1650574486/bobcat-assets/na-approved/products/excavators/compact-excavators/service-schedules/ss-exc-e19-e20-0315.pdf) | oem-document | 0315 | unknown | link-only | in-hand | read | EXCAVATOR-017 |
| `src-bobcat-e20-omm`<br>[E20 Compact Excavator Operation & Maintenance Manual](https://shop.bobcat.com/ca/e20-excavator-operation-and-maintenance-digital-manual-7255004enuspdf) | oem-manual | 7255004 ENUS; for serial B3BL11001 and above per Bobcat's listing (confirmed on receipt) | purchased-private | private-only | to-purchase | unverified | EXCAVATOR-017 |
| `src-cat-301-5-brochure`<br>[301.5 Mini Excavator (specifications brochure AEHQ8144-08)](https://s7d2.scene7.com/is/content/Caterpillar/CM20180625-48918-63979) | oem-brochure | AEHQ8144-08 | unknown | link-only | in-hand | read | EXCAVATOR-3015 |
| `src-cat-301-5-omm-preview`<br>[Operation and Maintenance Manual M0088895-24: 301.5, 301.6, 301.7 CR, 301.8, 302 CR (publisher preview)](https://catpublications.com/previews/M0088895EN-US.pdf) | oem-manual | M0088895-24 (en-us), June 2026 | unknown | link-only | in-hand | read | EXCAVATOR-3015 |
| `src-cat-301-5-omm`<br>[Operation and Maintenance Manual M0088895: 301.5 to 302 CR Mini Hydraulic Excavators (full)](https://catpublications.com/) | oem-manual | M0088895-24 (en-us), June 2026. Cat Publications price seen 2026-10-17: download US$97, CD US$97, printed book US$114 | purchased-private | private-only | to-purchase | unverified | EXCAVATOR-3015 |
| `src-photo-e20-taurusemerald`<br>[Bobcat E20 Mini Excavator.jpg](https://commons.wikimedia.org/wiki/File:Bobcat_E20_Mini_Excavator.jpg) | photo | Taken 2024-08-22; 3658 x 2686 | cc-by-sa | public-host | in-hand | read | EXCAVATOR-017 |
| `src-photo-e20-housen`<br>[20150724 libramont095.JPG](https://commons.wikimedia.org/wiki/File:20150724_libramont095.JPG) | photo | Taken 2015-07-24 at the Libramont fair, Belgium; 3872 x 2592 | cc-by-sa | public-host | in-hand | read |  |
| `src-photo-301-5-lostplanetkd73`<br>[A small Cat vehicle in Bay Shore, NY - July 2024.jpg](https://commons.wikimedia.org/wiki/File:A_small_Cat_vehicle_in_Bay_Shore,_NY_-_July_2024.jpg) | photo | Taken July 2024; 4032 x 3024 | cc0 | public-host | in-hand | read | EXCAVATOR-3015 |

## Applicability and integrity

### `src-bigtex-owners-2020`

- Applicability: Big Tex trailers in general; Big Tex lists it as "Owners Manual" on its owners-manuals page with no model mapping. Used for the 35SA (bumper-pull ball coupler, no brakes fitted on the showcase unit).
- Locators: Printed page numbers; PDF page = printed + 1. Body section numbers differ from the table of contents, so locators quote the body heading.
- 4298192 bytes, SHA-256 `95681a2ecf9586a590184f67069537540ed151146ebae85c67516351fb61cffa`, Last-Modified 2025-03-20T18:12:31Z, retrieved 2026-10-17
- Attribution: © Big Tex Trailer Manufacturing, LLC

### `src-bigtex-owners-2020-dump`

- Applicability: Big Tex dump trailers in general (figures show the 10SR and 25DU); listed as "Owners Manual (Dump Trailers)" with no model mapping. Used for the 14LP: ball-hitch coupling pp. 41-47, dump loading and unloading pp. 62-67.
- Locators: Printed page numbers; PDF page = printed + 1.
- 5721256 bytes, SHA-256 `284d41c818032358a32ce8569d092a8e5385fe055346b3772e7995d071a11922`, Last-Modified 2025-03-20T18:12:29Z, retrieved 2026-10-17
- Attribution: © Big Tex Trailer Manufacturing, LLC

### `src-bigtex-hoist`

- Applicability: The 14LP is not on the cover, so this manual's applicability to the 14LP is unconfirmed (question for Big Tex). Its troubleshooting guide (p. 24) is quoted for staff review only until Big Tex confirms.
- Locators: Printed page numbers; PDF page = printed + 2. Pages are scanned images (no text layer).
- 27312771 bytes, SHA-256 `33ccedd1e91143d49050b1f91834775ce33af5a9a775dd583584d62ef000c9a2`, Last-Modified 2025-03-20T18:13:31Z, retrieved 2026-10-17
- Attribution: © Big Tex Trailer Manufacturing, LLC

### `src-bigtex-wiring`

- Applicability: Big Tex connectors in general. Its 7-way colours (black = electric brakes, blue = reverse) differ from the Plug Contacts sheet ("black or blue = brakes"), so neither is used for pin-level guidance.
- Locators: Single sheet.
- 1506020 bytes, SHA-256 `b0d2ef808674a507eb1a98d72fe759144695ad8737f96b728ea4d2438275b00f`, Last-Modified 2025-03-20T18:13:34Z, retrieved 2026-10-17
- Attribution: © 2006 Big Tex Trailer Manufacturing, Inc.

### `src-bigtex-plug-contacts`

- Applicability: Big Tex connectors in general: the 35SA's 4-way flat and the 14LP's 7-way RV. Staff reference for lighting faults; see the colour conflict noted on src-bigtex-wiring.
- Locators: Single sheet.
- 1009430 bytes, SHA-256 `9af5adad8f75ec2af6f7e4a4c615c4878c38556baf579f61489d78e52752c58f`, Last-Modified 2025-03-20T18:13:33Z, retrieved 2026-10-17
- Attribution: © Big Tex Trailer Manufacturing, LLC

### `src-bigtex-35sa-web`

- Applicability: 35SA-10/12/14, current listing. Inconsistency: one carousel caption calls the 4 ft rear ramp gate optional, while the Features & Options table and the FAQ list the 3-way ramp gate as standard.
- Locators: Page section names (Models & Dimensions; Features & Options; FAQ). The page changes over time; the vault copy is the record.
- 261036 bytes, SHA-256 `eb599703dddeecc0641107632a5b5018a2d8e0717d6a8d1b89208f50421c8930`, retrieved 2026-10-17

### `src-bigtex-14lp-web`

- Applicability: 14LP-12/14/16, current listing. The Power group lists the pump, a 5 W solar charger and a wireless remote without marking which are standard. The hoist is "self-contained scissor"; its capacity is not stated.
- Locators: Page section names. The page changes over time; the vault copy is the record.
- 216114 bytes, SHA-256 `4b3e9cf224d2ef8e161c77efafd0f24840a2e9f4bcc13c324cfcacbca40b57df`, retrieved 2026-10-17

### `src-bigtex-owners-index`

- Applicability: Lists exactly five owner documents (Owners Manual, Owners Manual (Dump Trailers), Hoist Manual, Plug Contacts, Wiring Diagram) with no model-to-manual mapping.
- 79906 bytes, SHA-256 `3a7a1205cc7e39ae6c60d4fac18539613bdaad521a0f54b7aacb80ab113304bb`, retrieved 2026-10-17

### `src-bobcat-b1699`

- Applicability: Bobcat compact excavators in general (Bobcat's rental safety sheet), so it covers the E20 but is not E20-specific. Rules taken from it stay REVIEW_REQUIRED until cross-checked in the E20 OMM; control layouts are never drawn from it.
- Locators: PDF page 1 = outside panels (before operating, servicing, transporting); PDF page 2 = inside panels (worksite, leaving the machine, while operating).
- 1816446 bytes, SHA-256 `d48e316f11e6b12ba8501409f6670a5246701ff77b70ecb5751b65bcfe6e0b9f`, Last-Modified 2025-04-15T18:30:40Z, retrieved 2026-10-17
- Attribution: © 2025 Bobcat Company

### `src-bobcat-e19-e20-schedule`

- Applicability: E19 and E20. Bobcat's service-schedule listing (bobcat.com/na/en/parts-service/service/service-schedules/excavators) ties it to the E20 with the Tier 4 Kubota engine, serial prefix B3BL: the generation in both licensed photos.
- Locators: PDF page 1 = 10, 50 and 100 hour items; PDF page 2 = 250 hour to 24 month items.
- 25503 bytes, SHA-256 `236c67132330693c276dca8033aa0f52f8b73ab40a695307e10c997c427c9cf9`, Last-Modified 2022-04-21T20:54:48Z, retrieved 2026-10-17
- Attribution: © Bobcat Company

### `src-bobcat-e20-omm`

- Applicability: The 2015-2025 E20 (B3BL). Not the next-generation E20 launched November 2025, whose brochure B-3038 must not be used. Source of every E20 spec, control and procedure. The operator is buying it (2026-10-17).
- Attribution: © Bobcat Company

### `src-cat-301-5-brochure`

- Applicability: Current-generation 301.5 with the C1.1 engine (Tier 4 Final / Stage V). Specifications on pp. 2-3, read from page renders because the text layer interleaves columns.
- Locators: Printed page numbers (equal to PDF pages).
- 1189479 bytes, SHA-256 `bb4248381d1903b81d12687abc764de9539ec6332978e499430abd7f6d1f6137`, Last-Modified 2025-02-08T10:36:19Z, retrieved 2026-10-17
- Attribution: © Caterpillar

### `src-cat-301-5-omm-preview`

- Applicability: 301.5 serial prefixes MNH 1-UP and ZHL 1-UP. The preview holds only the cover, the safety notice and the table of contents (Safety pp. 7-51, Operation pp. 171-293, Maintenance pp. 295+), so it locates content but supplies no steps.
- Locators: Page numbers from the manual's own table of contents.
- 503921 bytes, SHA-256 `17ab9922fc53c6d9d1a12c32ffa16ce3f0db30deb82450d4165da80e6a1ff6d6`, Last-Modified 2026-06-16T14:27:23Z, retrieved 2026-10-17
- Attribution: © Caterpillar

### `src-cat-301-5-omm`

- Applicability: 301.5 serial prefixes MNH 1-UP and ZHL 1-UP. Source of every 301.5 control and procedure. The operator declined the purchase for now (2026-10-17); the page links Cat Publications, which has no stable product link (search M0088895).
- Attribution: © Caterpillar

### `src-photo-e20-taurusemerald`

- Applicability: Bobcat E20 with canopy, left side, B3BL-generation styling. A rental company's decals, phone number and fleet number are removed in the derivative (scripts/phase-e/packs/photo-derivatives.mjs, recipe e20-a).
- 2299439 bytes, SHA-256 `7577af369f83de13553d722108accec23e38e3544d5d0f52f02799c5e3c5cb81`, retrieved 2026-10-17
- Attribution: TaurusEmerald, CC BY-SA 4.0, via Wikimedia Commons (modified)
- Licence: https://creativecommons.org/licenses/by-sa/4.0/

### `src-photo-e20-housen`

- Applicability: Bobcat E20 with enclosed cab and long arm, a European unit. Considered as candidate B and not used: the operator chose candidate A on 2026-10-17. Kept for provenance; no derivative is published.
- 4004215 bytes, SHA-256 `6544d83a4af6f9a173fefd72bd29574d0febd3f8b1ac58e1f7ba554b22f47444`, retrieved 2026-10-17
- Attribution: Jean Housen, CC BY-SA 4.0, via Wikimedia Commons (modified)
- Licence: https://creativecommons.org/licenses/by-sa/4.0/

### `src-photo-301-5-lostplanetkd73`

- Applicability: Current-generation Cat 301.5 with canopy and rubber tracks, right side (model decal "301.5"). A political sticker and a dealer decal are removed in the derivative (recipe cat-301-5). Background signage and a parked van remain.
- 2259364 bytes, SHA-256 `dd86f34d500d06b70b22519fa9bbe61337e44aad47cf149b4fe3de040f300292`, retrieved 2026-10-17
- Attribution: LostplanetKD73 via Wikimedia Commons (CC0; credit given as a courtesy)
- Licence: https://creativecommons.org/publicdomain/zero/1.0/
