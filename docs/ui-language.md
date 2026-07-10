# Product UI language (extends BRAND.md)

Canonical visual sources: brand-reference.html (identity) and
dashboard-reference.html (application of the language). Build to match;
these specs exist so components are reproducible without eyeballing.

## Components

**PlateLabel** — the nameplate eyebrow used on iron surfaces. Rivet ring
(8px circle, 1.5px brass border, transparent fill) + label: 10.5px,
uppercase, letter-spacing 0.14em, color #D9A94F. Right-aligned partner:
date/meta stamp in JetBrains Mono 11px #8F8B82. Iron surfaces only;
bone surfaces use the standard eyebrow (11px, 0.08em, iron-600).

**BandRule** — 2px solid brass-500 line closing the bottom edge of any
iron band. One per band, full width, no other decorative rules on iron.

**BandStat** — in-band stat target. Column of mono number (18px) over
label (11px, #B8B4AC) with a 1px dotted #57534B underline as the
affordance signal. Padding 8px 12px, radius 8px, hover surface #242220.
Every BandStat links to a filtered view; a stat that links nowhere does
not belong in the band. Attention-count numbers render #F0B24A.

**Sparkline** — bars 5px wide, 2px gap, radius 1.5px; history bars
#3A3733 on iron (#D8D3C8 on bone), current period brass-500. No axes,
no tooltips at this size; it links to Analytics like any BandStat.

**PrimaryButton (chamfered)** — the R-cut as a component. 30px height,
brass-500 fill, bone text 13px/600, top-left corner cut:
clip-path: polygon(7px 0, 100% 0, 100% 100%, 0 100%, 0 7px);
border-radius: 0 7px 7px 7px. Rules: primary actions only, at most one
visible per view region, never on secondary/ghost buttons, never on
tenant scan pages. Kill switch: this is one component; removing the
clip-path and radius override reverts the entire system to standard
corners.

**AssetTagChip** — as specced in BRAND.md. Usage law: every asset
reference on every admin surface renders as the chip. Bare mono codes
on admin surfaces are a defect. (Scan pages: bare system-mono, no chip.)

**Attention semantics** — amber dot (#B07B10) for action-needed rows,
iron-600 dot for setup gaps, amber reason chip (#FAEEDA bg, #854F0B
text). Red is reserved for genuinely broken states. Success green
(#5B9A63 dot) appears in chrome only for the all-clear headline.

## Dashboard interaction rules

Accordion queue: single-open; opening an item collapses the current
one; top item pre-expanded when attention count > 0. Expanded card
contains photos, quoted description, submitter + mono reference, quick
actions for the common case, and exactly one full-detail escape path
("Open in submissions"). Expansion 250ms ease-out; prefers-reduced-
motion renders instantly. Headline count must equal queue row count.
All-clear state: green dot headline, no queue card, activity leads.
Setup: band stat always visible; the detailed setup section renders
only below 100% ready and hides at 100%, derived, never stored.

## Hierarchy law

Per view: one iron band maximum, one BandRule, one chamfered
PrimaryButton per region, brass otherwise confined to the nav badge,
active-nav underline, sparkline current bar, and progress fills. If a
screen feels brassy, it is; remove until it doesn't.
