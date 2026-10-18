# E2A extension proposals (not built)

E2A changes no application code. These proposals come from limits the showcase packs ran into. Each states what exists today, what the packs do instead, and the smallest change that would remove the workaround. None is approved; each would need its own slice, plan and tests.

## 1. A photo credit line on the public page

| | |
|---|---|
| Today | The cover is an `<img>` cropped to 16:9 with `alt` = asset name (`components/public/public-scanner-view.tsx`). There is no field for a credit |
| Workaround | CC BY and BY-SA heroes carry a small credit label baked into the image (`photo-derivatives.mjs`), and the pack records the full attribution (author, licence link, source link, modifications) |
| Proposal | Add `assets.cover_credit` (plain text, at most about 140 characters), rendered as one muted line under the hero on `/t/` (system fonts, no new client JS) and editable next to the cover on the asset form. The import fills it from `model.photo.credit`. The baked labels can then be dropped from new derivatives |
| Why | The baked label is only about 8 px tall on a 390 px phone and cannot hold the licence link |

## 2. Pictograms inside the page

| | |
|---|---|
| Today | Pictograms reach the page only as the hosted Start-Up Guide PDF behind the "Start-Up Guide" button |
| Workaround | `guide-build.mjs` renders the approved panels into a two-page PDF; the quick-start text summarises the same steps |
| Proposal | An optional ordered panel list per equipment page: image URL (the web renders already exist), alt text, caption. `/t/` would show them inside Quick start as lazy-loaded images. Budget: 8 x 960 x 720 WebP is about 0.4 to 0.6 MB, so they load only when Quick start is expanded |
| Constraints | Scan-page guard: no webfonts and no new client JS, images only. Captions stay plain text. Panel review status must be READY before an image can be listed |

## 3. A dump-trailer return checklist

| | |
|---|---|
| Today | TRAILER-2041 uses the `utility_trailer` return template (`lib/inspections/templates.ts`): tires, lights, ramps or gate, coupler, chains, jack, body, deck, and the straps / chains / pins / spare accessories |
| Gap | Nothing records the parts that make a dump trailer different, and the hoist remote is not on the accessory list |
| Proposal | A `dump_trailer` system template: the utility-trailer items, plus "body raises and lowers fully" (pass/fail), "rear doors and spreader gate latch" (pass/fail), "body prop stowed" (yes/no) and "tarp" (pass/fail). Add "hoist remote" and "tarp" to the accessories. Each item names a part on Big Tex's 14LP product page or in its dump-trailer manual (pp. 62-67); no operating instruction is added |
| Until then | The 14LP pack lists the remote as a Northridge accessory policy (`pol-dump-remote`) and keeps `utility_trailer` |

## 4. Labelling manuals that must be bought

| | |
|---|---|
| Today | A `manual` document opens from the page's "Manual" button, wherever the link points |
| Situation | Big Tex publishes free manuals. Bobcat (E20 OMM 7255004) and Caterpillar (301.5 OMM M0088895) sell theirs, so the showcase links their official store pages. Cat Publications has no stable product link at all, so the Cat document's title has to tell the renter to search "M0088895" |
| Proposal | A per-document flag, `link_kind`, with values `document` (default) and `store`. A store link shows its button as "Get the manual" with "Sold by the manufacturer" under it, so a renter is not surprised by a checkout page |
