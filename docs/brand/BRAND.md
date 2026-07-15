# Brand assets and rules (working name: Mulemark)

Status: Mulemark is a working name pending CIPO/USPTO clearance. All brand
strings route through lib/constants.ts; all brand artwork lives in this
directory and is consumed as-is. A rename replaces the wordmark files and
one constant, nothing else.

## Asset inventory

| File | What it is | Where it's used |
|---|---|---|
| mulemark-lockup.svg | Glyph + wordmark lockup (Black outlines) | Sign-in, marketing hero, email header source |
| mulemark-wordmark-black.svg | Wordmark alone, Barlow Black outlines, chamfered R, +2% tracking baked in | Primary mark wherever the glyph is redundant |
| mulemark-wordmark-semibold.svg | Wordmark alternate, SemiBold outlines, +4.5% tracking | Only if Black is too heavy in a placement |
| mulemark-glyph.svg | Brass tag glyph, transparent punched hole | Brand mark, scan-page footer, loading mark |
| mulemark-glyph-mono.svg | One-color iron glyph | Monochrome contexts, engraving reference |
| mulemark-favicon.svg | 512 brass tile, punched hole, outline M | Favicon and app icons (export PNG sizes from this) |
| brand-reference.html | Visual reference sheet | Human reference; open in a browser |

## Hard rules

1. The wordmark is artwork, not text. The chamfered R exists only in the
   outline files. Never re-set MULEMARK from a live font, and never apply
   letter-spacing to it (tracking is baked into the paths).
2. The glyph's rivet hole is transparent (evenodd). Never fill it to match
   a background; it must show whatever is behind it. The hole is also the
   physical drill/engrave cut on real tags.
3. Brass (#A87B22) appears on platform surfaces only: primary buttons,
   active states, the brand mark. Never on tenant-branded scan pages,
   where the only platform presence is the small footer mark and the
   post-submission "Delivered by" line (both gated by
   hide_platform_branding).
4. AssetCodeChip is an admin device. On public scan pages, asset codes
   render in the SYSTEM monospace stack (ui-monospace, SF Mono, Roboto
   Mono, Consolas, monospace), without the chip and without loading any
   webfont. Monospace is a role (data voice), not a typeface commitment;
   JetBrains Mono is the brand mono on admin and marketing surfaces only.
5. Mono means data. JetBrains Mono is for asset codes, IDs, and URLs, and
   is never used for the brand name.
6. Type roles: live Barlow 600 for UI headings, Barlow 400 for body,
   JetBrains Mono for codes on admin/marketing; /t/ scan-page routes use
   system fonts exclusively, zero webfonts, no exceptions. Precedence
   rule when guidance collides: on /t/ routes the performance guardrail
   beats typeface fidelity; on admin and marketing surfaces the brand
   faces load.

## Geometry (for regeneration or physical production)

Glyph: rounded rect 86 x 40, corner radius 9, on a 92 x 56 grid; hole
center at 20% of tag width from the left edge, vertically centered,
radius 13.75% of tag height. Lockup: tag scaled to wordmark cap height,
gap 0.47 x cap. Chamfer: 45 degrees, depth 30% of cap height, top-left
corner of the R only.

## Minimum sizes and clear space

Wordmark minimum height 12px digital / 5mm print. Lockup minimum 16px.
Clear space around lockup and glyph: the hole diameter on all sides.
Reversed use: bone (#FAF9F6) on iron (#1A1917); never place the brass
glyph on tenant-colored backgrounds.

## Provenance

Wordmark cut from Barlow v1.422 (Jeremy Tribby, SIL OFL) via
fontTools + skia-pathops; chamfer applied as a boolean path operation.
OFL permits outline conversion for logo use without restriction.
