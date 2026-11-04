# Marketing consistency report (Engineering Phase E2C)

Every place `getmulemark.com` shows a showcase machine, before and after the prepared patch, checked against the four E2C pages and the four printed cards. The marketing repository is the operator's: the patch is prepared and checked here, and the operator applies, commits and deploys it (approval packet, item 5) straight after the app cutover is verified.

**The patch:** `docs/phase-e/packs/marketing/e2c-showcase-marketing.patch`.
- **Contents:** patches A and B from E2A plus the new trailer scene C, as one git binary patch that includes both photos.
- **Size and hash:** 1,147,871 bytes; SHA-256 `1145a51150438cff1f4c75bcfef4f314f56beaf14df1c7eb991da0b473b9419e`.
- **Base:** marketing `main` = `57747c3`, unchanged since E0.
- **Checked:**
  - `git apply --check` passes on a fresh clone and touches 15 files;
  - the repository's `npm run check` passes ("brand files unchanged, local links resolve…");
  - `npm run build` completes, with both photographs local.

  Run it in a clone without line-ending conversion (`git clone -c core.autocrlf=false`): on Windows, the default conversion makes the check report the untouched brand SVGs as changed.

## Where the machines appear

| Place | Before (`57747c3`) | After | Matches |
|---|---|---|---|
| Home hero (`/`), EXCAVATOR-017 | Bobcat E20 photo with a real rental company's decals, phone and fleet number | The retouched E20 (those marks removed; full frame); credit "TaurusEmerald, CC BY-SA 4.0, modified", with the changes listed on `/credits` | Page "Excavator 017 · Bobcat E20"; card 1 "EXCAVATOR 017"; link `/t/demo-ex017` (unchanged) |
| `/equipment-tags` card 01 | Same photo as the hero | Same as the hero | Same |
| `/equipment-tags` card 02, TRAILER-014 | A **Twister enclosed cargo trailer** (wrong model), "By the landing-leg controls", credit Gorillaphotog CC BY 4.0, note "may differ from the photographed model" | Big Tex's own 35SA photo (unmodified, used with permission), "On the tongue rail", credit "Big Tex Trailer Manufacturing, LLC"; the tag is drawn on the tongue rail beside the Big Tex decal | Page "Trailer 014 · Big Tex Trailers 35SA-12"; card 3 "TRAILER 014"; link `/t/demo-tr014` (unchanged) |
| `/demo`, four cards | "Mini excavator", "Mini excavator", "Trailer", "Trailer" | "Bobcat E20 compact excavator", "Cat 301.5 mini excavator", "Big Tex 35SA utility trailer", "Big Tex 14LP dump trailer" | Pages "Excavator 017", "Mini Excavator 301.5", "Trailer 014", "Dump Trailer 2041"; QR files and links unchanged |
| `/credits` | Twister trailer credit (CC BY 4.0) | Big Tex credit, used with permission; the E20 entry lists its changes | — |
| `site/field.js` enlarged-scene fallback | Unedited Wikimedia originals | The local photos | — |
| Review and export files (`artwork/*`, `REVIEW.html`, `tools/artboard-export.js`; not deployed) | Twister scene data | The same scene data as the site | — |
| `README.md` | "not retouched"; Twister credit | States the E20 retouch; Big Tex credit | — |

## Never touched

- **QR and tag files:** the four `site/assets/qr-*.svg` and the eight `tag-*.svg` (empty `git diff`).
- **QR destinations, card artwork and site structure.**

The patch only replaces imagery, names, captions, credits and two fallback links.

## Open points for the operator

- **The new trailer caption, "On the tongue rail",** is a placement line written from the photo. Approve it with packet item 5, or give another.
- **Card 4** prints "UTILITY TRAILER 204". The site and the page say "Big Tex 14LP dump trailer" / "Dump Trailer 2041" (decided 2026-11-03). The card's code line, TRAILER-2041, matches. The cards are not reprinted.
- **Apply steps** (your marketing clone, after the cutover is verified):
  1. `git apply --index <path to e2c-showcase-marketing.patch>`;
  2. `npm run check`, then `npm run build`;
  3. commit and push to `main`.

  I then check the live `/`, `/equipment-tags`, `/demo` and `/credits` (never a `/t/` URL).
