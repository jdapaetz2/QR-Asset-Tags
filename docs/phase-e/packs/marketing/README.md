# Marketing candidates for getmulemark.com (not pushed)

Prepared in E2A against marketing commit `57747c3` of `jdapaetz2/Getmulemark.com`. Nothing was committed or pushed to that repository: these are proposals for the operator, who owns that site. Both patches were checked with `git apply --check` against an unmodified copy of `57747c3`. The marketing repository's own `npm run check` was **not** run here; run it when applying.

## A. E20 placement photo without the rental company's decals (can go now)

Today the homepage and `/equipment-tags` placement scene hotlink Wikimedia's thumbnail of the unedited Bobcat E20 photo. It shows a real rental company's name, phone number and fleet number on a machine presented as Mulemark's example. The candidate uses the same recorded edits as the showcase hero, applied to the full frame. The tag position is stored as fractions of the frame (`quad`), so it does not move.

| File | What it changes |
|---|---|
| [`a-e20-photo.patch`](a-e20-photo.patch) | `site/assets/field-scenes.json` and `docs/PHOTO_SOURCES.json` gain `local_source` and `changes` for the excavator scene; `tools/build.mjs` reads a local source when one is set instead of downloading; `site/credits.html` states the changes |
| Image | Copy [`../bobcat.e20.b3bl-canopy/media/e20-fullframe-a.jpg`](../bobcat.e20.b3bl-canopy/media/e20-fullframe-a.jpg) to `artwork/photos/bobcat-e20-modified.jpg` (1280 x 940; SHA-256 in that folder's `media.json`) |

To apply, in a clone of the **marketing repository** (not this one):
1. Copy the image to `artwork/photos/bobcat-e20-modified.jpg`.
2. Apply the patch with `git apply`, giving it the path to `a-e20-photo.patch`.
3. Run that repository's `npm run check` and `npm run build`, then review the pages.

Not covered by the patch:
- `artwork/review.html`, `tools/artboard-export.js` and `REVIEW.html` keep their own copy of the scene list and still fetch the Wikimedia original for exports and the review file. They should get the same local source.

Licence: the photo is TaurusEmerald's, CC BY-SA 4.0. The modified version stays under CC BY-SA 4.0 and `credits.html` keeps the attribution, now listing the changes.

## B. Equipment-example labels (only after the E2C cutover)

[`b-demo-labels.patch`](b-demo-labels.patch) renames the four cards on `demo.html` from "Mini excavator" and "Trailer" to the showcase identities: Bobcat E20 compact excavator, Cat 301.5 mini excavator, Big Tex 35SA utility trailer and Big Tex 14LP dump trailer. **Apply it only after E2C**, when the four equipment pages actually show those machines.

## Not prepared: the TRAILER-014 scene

E0 found that the trailer scene shows a Twister enclosed cargo trailer, a different category from TRAILER-014. No licensed Big Tex 35SA photo exists yet. When Big Tex's permission arrives, replace that scene's photo and recompute its `quad` from the new frame. Until then the scene stays as it is.
