import { PRODUCT_NAME } from "@/lib/constants";

/**
 * Brand marks (A1). The wordmark and lockup are AUTHORITATIVE OUTLINE ARTWORK copied
 * verbatim from docs/brand/*.svg — never re-set from a live font, never letter-spaced
 * (tracking is baked into the paths), and the chamfered R exists only here in the outline.
 * The glyph's rivet hole is a transparent evenodd cut — never filled. Accessible names
 * come from PRODUCT_NAME (lib/constants) so a rename touches one constant, not the artwork.
 *
 * See docs/brand/BRAND.md. Renaming the product replaces the wordmark/lockup path data
 * (regenerated from the new name) and PRODUCT_NAME; nothing else.
 */

// docs/brand/mulemark-glyph.svg — rounded tag with transparent punched hole (evenodd).
const GLYPH_PATH =
  "M12 8H80A9 9 0 0 1 89 17V39A9 9 0 0 1 80 48H12A9 9 0 0 1 3 39V17A9 9 0 0 1 12 8ZM25.5 28A5.5 5.5 0 1 1 14.5 28A5.5 5.5 0 1 1 25.5 28Z";

// docs/brand/mulemark-wordmark-black.svg — Barlow Black outlines, chamfered R, tracking baked in.
const WORDMARK_PATH =
  "M504 700H660Q667 700 671.0 696.0Q675 692 675 685V15Q675 8 671.0 4.0Q667 0 660 0H502Q495 0 491.0 4.0Q487 8 487 15V378Q487 382 485.0 382.5Q483 383 481 380L413 269Q407 259 395 259H319Q307 259 301 269L233 380Q231 383 229.0 382.5Q227 382 227 378V15Q227 8 223.0 4.0Q219 0 212 0H54Q47 0 43.0 4.0Q39 8 39 15V685Q39 692 43.0 696.0Q47 700 54 700H210Q222 700 228 690L354 487Q357 481 360 487L486 690Q492 700 504 700ZM769 243V685Q769 692 773.0 696.0Q777 700 784 700H942Q949 700 953.0 696.0Q957 692 957 685V243Q957 202 980.5 177.5Q1004 153 1043 153Q1081 153 1104.5 178.0Q1128 203 1128 243V685Q1128 692 1132.0 696.0Q1136 700 1143 700H1301Q1308 700 1312.0 696.0Q1316 692 1316 685V243Q1316 168 1282.0 111.0Q1248 54 1186.0 23.0Q1124 -8 1043 -8Q962 -8 899.5 23.0Q837 54 803.0 111.0Q769 168 769 243ZM1410 15V685Q1410 692 1414.0 696.0Q1418 700 1425 700H1583Q1590 700 1594.0 696.0Q1598 692 1598 685V166Q1598 161 1603 161H1912Q1919 161 1923.0 157.0Q1927 153 1927 146V15Q1927 8 1923.0 4.0Q1919 0 1912 0H1425Q1418 0 1414.0 4.0Q1410 8 1410 15ZM2496 539H2197Q2192 539 2192 534V440Q2192 435 2197 435H2382Q2389 435 2393.0 431.0Q2397 427 2397 420V290Q2397 283 2393.0 279.0Q2389 275 2382 275H2197Q2192 275 2192 270V166Q2192 161 2197 161H2496Q2503 161 2507.0 157.0Q2511 153 2511 146V15Q2511 8 2507.0 4.0Q2503 0 2496 0H2019Q2012 0 2008.0 4.0Q2004 8 2004 15V685Q2004 692 2008.0 696.0Q2012 700 2019 700H2496Q2503 700 2507.0 696.0Q2511 692 2511 685V554Q2511 547 2507.0 543.0Q2503 539 2496 539ZM3059 700H3215Q3222 700 3226.0 696.0Q3230 692 3230 685V15Q3230 8 3226.0 4.0Q3222 0 3215 0H3057Q3050 0 3046.0 4.0Q3042 8 3042 15V378Q3042 382 3040.0 382.5Q3038 383 3036 380L2968 269Q2962 259 2950 259H2874Q2862 259 2856 269L2788 380Q2786 383 2784.0 382.5Q2782 382 2782 378V15Q2782 8 2778.0 4.0Q2774 0 2767 0H2609Q2602 0 2598.0 4.0Q2594 8 2594 15V685Q2594 692 2598.0 696.0Q2602 700 2609 700H2765Q2777 700 2783 690L2909 487Q2912 481 2915 487L3041 690Q3047 700 3059 700ZM3779 13 3757 91Q3755 95 3752 95H3540Q3537 95 3535 91L3513 13Q3510 0 3496 0H3325Q3307 0 3312 17L3523 688Q3527 700 3540 700H3752Q3765 700 3769 688L3980 17Q3981 15 3981 11Q3981 0 3967 0H3796Q3782 0 3779 13ZM3583 239H3708Q3714 239 3712 245L3648 469Q3647 472 3645.0 472.0Q3643 472 3642 469L3579 245Q3578 239 3583 239ZM4413.0 11.0Q4417.0 0.0 4430.0 0.0H4598.0Q4604.0 0.0 4608.0 3.0Q4612.0 6.0 4612.0 11.0Q4612.0 12.0 4610.0 18.0L4483.0 282.0Q4481.0 287.0 4486.0 289.0Q4543.0 312.0 4575.5 361.5Q4608.0 411.0 4608.0 477.0Q4608.0 543.0 4579.5 593.5Q4551.0 644.0 4499.5 672.0Q4448.0 700.0 4380.0 700.0H4272.0L4062.0 490.0V15.0Q4062.0 8.0 4066.0 4.0Q4070.0 0.0 4077.0 0.0H4235.0Q4242.0 0.0 4246.0 4.0Q4250.0 8.0 4250.0 15.0V264.0Q4250.0 269.0 4255.0 269.0H4297.0Q4301.0 269.0 4303.0 265.0ZM4250.0 534.0Q4250.0 539.0 4255.0 539.0H4349.0Q4381.0 539.0 4401.0 521.5Q4421.0 504.0 4421.0 475.0Q4421.0 447.0 4401.0 429.5Q4381.0 412.0 4349.0 412.0H4255.0Q4250.0 412.0 4250.0 417.0ZM4697 15V685Q4697 692 4701.0 696.0Q4705 700 4712 700H4870Q4877 700 4881.0 696.0Q4885 692 4885 685V446Q4885 443 4887.0 442.0Q4889 441 4891 444L5065 691Q5071 700 5084 700H5263Q5275 700 5275 691Q5275 687 5272 682L5064 393Q5062 390 5064 386L5279 18Q5282 14 5282 9Q5282 0 5269 0H5092Q5079 0 5074 10L4936 256Q4935 259 4933.0 259.0Q4931 259 4929 256L4887 192Q4885 188 4885 186V15Q4885 8 4881.0 4.0Q4877 0 4870 0H4712Q4705 0 4701.0 4.0Q4697 8 4697 15Z";

// docs/brand/mulemark-lockup.svg — brass tag glyph beside the wordmark.
const LOCKUP_TAG_PATH =
  "M158 0H1348A158 158 0 0 1 1505 158V542A158 158 0 0 1 1348 700H158A158 158 0 0 1 0 542V158A158 158 0 0 1 158 0ZM394 350A96 96 0 1 1 201 350A96 96 0 1 1 394 350Z";
// Same wordmark outline, positioned to the right of the tag in the lockup grid.
const LOCKUP_WORDMARK_PATH = WORDMARK_PATH;

type MarkProps = {
  className?: string;
  /** Accessible name; defaults to the product name. Pass "" to mark decorative. */
  title?: string;
};

/**
 * Brass tag glyph (or one-color iron when `tone="mono"`). The rivet hole is a transparent
 * evenodd cut — do not add a CSS `fill` that would flatten it.
 */
export function BrandGlyph({
  className,
  tone = "brass",
  title = `${PRODUCT_NAME} mark`,
}: MarkProps & { tone?: "brass" | "mono" }) {
  const decorative = title === "";
  return (
    <svg
      viewBox="0 0 92 56"
      className={className}
      role="img"
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      {!decorative ? <title>{title}</title> : null}
      <path
        fillRule="evenodd"
        fill={tone === "mono" ? "#1a1917" : "#a87b22"}
        d={GLYPH_PATH}
      />
    </svg>
  );
}

/** Wordmark outline artwork (Barlow Black, chamfered R). Never re-set from live text. */
export function BrandWordmark({
  className,
  title = PRODUCT_NAME,
}: MarkProps) {
  return (
    <svg
      viewBox="-24 -24 5342 748"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g transform="matrix(1 0 0 -1 0 700)">
        <path d={WORDMARK_PATH} fill="#1a1917" />
      </g>
    </svg>
  );
}

/** Glyph + wordmark lockup. Used on sign-in, marketing hero, and the app shell. */
export function BrandLockup({ className, title = PRODUCT_NAME }: MarkProps) {
  return (
    <svg
      viewBox="-30 -30 7189 760"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path fillRule="evenodd" fill="#a87b22" d={LOCKUP_TAG_PATH} />
      <g transform="matrix(1 0 0 -1 1835 700)">
        <path d={LOCKUP_WORDMARK_PATH} fill="#1a1917" />
      </g>
    </svg>
  );
}
