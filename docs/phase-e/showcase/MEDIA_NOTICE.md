# Showcase evidence media: notices

The evidence images of the synthetic showcase history (`docs/phase-e/showcase/media/`, recorded with hashes in `media.json`). They show the right **model**, never the showcase unit itself. Each carries one small corner tag: "Illustrative photo" or "Illustration".

| File | Source and licence | Changes |
|---|---|---|
| `e20-illustrative-photo.webp` | Photo by TaurusEmerald, [Bobcat E20 Mini Excavator](https://commons.wikimedia.org/wiki/File:Bobcat_E20_Mini_Excavator.jpg), Wikimedia Commons, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | The E2A derivative (a rental company's marks removed; `docs/phase-e/packs/bobcat.e20.b3bl-canopy/media/media.json`), cropped to 16:9, resized to 1024x576, tag "Illustrative photo · Photo: TaurusEmerald (Wikimedia Commons), CC BY-SA 4.0, modified". **This derivative is shared under CC BY-SA 4.0.** |
| `cat-301-5-illustrative-photo.webp` | Photo by LostplanetKD73, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_small_Cat_vehicle_in_Bay_Shore,_NY_-_July_2024.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (credit as a courtesy) | The E2A derivative (a sticker and a dealer decal removed; `docs/phase-e/packs/cat.301-5.canopy/media/media.json`), resized to 1024x576, tag "Illustrative photo" |
| The nine `*-illustration.webp` files | Original Mulemark drawings (Engineering Phase E2B, `scripts/phase-e/showcase/evidence-drawings.mjs`), built from the E2A drawing kit | Tag "Illustration" |

**Where they are used:**
- the two photos are the routine "overall" condition photo of their excavator;
- the bucket, hitch and deck drawings are the attachment and trailer condition photos;
- each of the three incident drawings is used once: the 35SA tail-lamp crack, the worn Cat tooth and the weeping Cat fitting.

They are stored once per record, at that record's own storage path.

**Replacing an image:**
1. Save the new image in place of the old one, under the same file name and still as WebP. It needs the same kind of small corner tag.
2. Run `npm run phase-e:showcase:media`. It records the new file's hash in `media.json`; `--replace=<key>` instead re-draws a drawing from code.
3. Run `npm run phase-e:showcase:build`.
4. Refresh the targets ([DEMO_REFRESH_POLICY.md](../DEMO_REFRESH_POLICY.md)).
