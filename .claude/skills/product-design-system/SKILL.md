---
name: product-design-system
description: MuleMark design system rules for AssetTag QR admin/marketing UI — tokens, typography, the AssetTagChip device, the nameplate-band components (PlateLabel/BandRule/BandStat/Sparkline), the chamfered PrimaryButton, attention semantics, status/timestamp/eyebrow/empty-state/motion/voice rules, and the wordmark hard rules. Consult before any visual/UI change on admin or marketing surfaces (never applies to /t/ scan pages beyond the zero-webfont rule).
---

# Product Design System (working name: MuleMark)

Canonical sources — build to match, do not redesign:
- `docs/brand/BRAND.md` + `docs/brand/brand-reference.html` — brand identity.
- **`docs/brand/ui-language.md`** — component specs + interaction rules (authoritative).
- **`docs/brand/dashboard-reference.html`** — the four canonical dashboard states.

This skill is the interface-design contract that sits on top of them.

## DESIGN INTENT
- Industrial workwear, not blue SaaS.
- Descended from the stamped-metal asset tag — the product's one physical truth.
- Carhartt shelf appeal, Linear-grade interface discipline.
- Calm, specific, brief voice — like a good foreman.
- One signature device (the tag chip), used with discipline. Everything else quiet.
- Spend boldness in exactly one place per screen.

## RULES

### Tokens (roles, not decoration)
- `iron-950` primary text / darkest; `iron-600` secondary text, eyebrows, quiet icons;
  `iron-200` the default 1px separation border; `bone-50` warm off-white surface.
- `brass-500` / `brass-600`: **platform accent only** — brand mark, and (later) primary
  buttons / active states on platform surfaces. Never on tenant scan pages. Brass restraint
  cap: at most one brass element carrying weight per screen.
- Semantic: `success` `warning` `danger` `info` for status only.
- 8px spacing grid. Radius 6px on controls, 10px on cards. Separate regions with 1px
  `iron-200` borders and background shifts — **not shadows** (shadows only on true overlays).
- Never make the app feel brown, vintage, or themed. Warm neutrals + one brass accent.

### Tenant vs platform separation
- `--tenant-primary` (and any derived tenant values) drive public scan surfaces; brass/iron
  drive platform surfaces. Never mix: no brass on a tenant scan page, no tenant color on the
  platform chrome.

### Typography
- Barlow 600 headings, Barlow 400 body on admin/marketing. JetBrains Mono for codes, IDs,
  short codes, URLs, reference numbers — data only, never the brand name.
- **`/t/` scan routes: system fonts only, zero webfonts, no exceptions.** Codes there render in
  the system monospace stack. Precedence: on `/t/` the performance guardrail beats typeface
  fidelity; on admin/marketing the brand faces load.
- `tabular-nums` on numeric table cells and stat values.

### Eyebrows
- Section labels ("QUICK START"): 11–12px, uppercase, ~+6% letter-spacing, `iron-600`.

### AssetTagChip
- The single signature device (`components/ui/asset-tag-chip.tsx`). Ring-style rivet hole at
  the left (a ring with a **transparent** center — never filled), code in JetBrains Mono, on a
  `bone-50` surface with a 7px radius. Optional single readiness dot; never a cluster.
- **Usage law:** every asset reference on every admin surface renders as the chip. A bare mono
  asset code on an admin surface is a defect. Admin surfaces only — never on `/t/` or `/forms/`
  (scan pages use bare system-mono, no chip).

### Nameplate-band components (docs/brand/ui-language.md)
These build the dashboard briefing band; use them, don't re-roll bespoke variants.
- **PlateLabel** (`components/ui/plate-label.tsx`) — iron-surface eyebrow: 8px brass rivet ring +
  brass letterspaced label (`brass-label` #D9A94F, 0.14em) + optional right mono meta stamp
  (`mono-meta` #8F8B82). Bone surfaces use `<Eyebrow>` instead.
- **BandRule** (`components/ui/band-rule.tsx`) — the one 2px brass line closing an iron band. One
  per band; no other decorative rules on iron.
- **BandStat** (`components/ui/band-stat.tsx`) — an in-band stat that is **always a link** to a
  filtered view (`href` is required — a stat that links nowhere doesn't belong in the band). Mono
  number over a dotted-underline label; attention counts render `attention` amber (#F0B24A);
  hover surface `iron-hover` (#242220).
- **Sparkline** (`components/ui/sparkline.tsx`) — CSS bars, no charting dep; history muted
  (`spark-iron`/`spark-bone`), current period brass. Accessible `aria-label` summary; links to
  Analytics like any BandStat.

### Chamfered PrimaryButton
- `components/ui/primary-button.tsx` — the R-cut primary action: 30px, brass fill, bone text,
  top-left corner cut. **Primary actions only, at most one per view region, never on
  secondary/ghost buttons, never on tenant scan pages.**
- **Kill switch:** the module const `CHAMFER`. Set it false to drop the clip-path + radius
  everywhere and revert the whole system to the ordinary platform primary button.

### Attention semantics (needs-attention queue)
- Amber dot (`warning` #B07B10) for action-needed rows; `iron-600` dot for setup gaps; amber
  reason chip (`amber-chip-bg` #FAEEDA bg / `amber-chip-text` #854F0B). Red is reserved for
  genuinely broken states. The only chrome green (`chrome-clear` #5B9A63) is the all-clear
  headline dot, shown only when literally true.
- **Queue accordion:** single-open (opening one collapses the current); top item pre-expanded
  when the attention count > 0; the headline count must equal the visible queue row count. Each
  expanded card has exactly one full-detail escape ("Open in submissions"). Setup: the band
  ready/total stat always shows; the detailed setup section renders only below 100% ready.

### Hierarchy law (brass restraint)
- Per view: **one** iron band max, **one** BandRule, **one** chamfered PrimaryButton per region.
  Brass otherwise confined to the nav badge, the active-nav underline, the sparkline current bar,
  and progress fills. If a screen feels brassy, it is — remove until it doesn't.

### Scan-page guard (`/t/[shortCode]`)
- No AssetTagChip, no chamfered PrimaryButton, no brass emphasis (tenant color + neutrals only),
  no admin webfonts (system stack, zero webfonts), no new client JS. Design polish never outranks
  the scan-page behavior/security contract.

### Status display (never stack badges)
- One rental-state badge (Rented / Available). One readiness indicator. A lock icon for
  private. Never stack multiple badges to say one thing.

### Timestamps
- Relative display ("2h ago"); absolute local time on hover (title). Never show raw UTC on
  customer-facing screens.

### Empty states
- One single-weight line icon in `iron-600`, one sentence, one primary action. Nothing more.

### Motion
- 150ms ease-out on hovers; 250ms ease-out for the queue accordion expansion; skeleton shimmer
  for loading.
- **Nothing animates on scan pages.** `prefers-reduced-motion` renders expansions instantly and
  kills all motion (the accordion uses a CSS grid-rows transition + `motion-reduce:transition-none`).

### Voice
- Sentence case. Verb-first buttons. Errors state the fact plus the fix.
- **Toast is deferred** — there is no toast/optimistic-update infrastructure yet. Server actions
  give inline feedback (a `role="alert"` message + a pending button label) and full revalidation.
  Do not add a toast library or hand-rolled toast/optimistic system without an explicit decision.

### Accessibility
- Visible focus rings. AA contrast minimum. 44px minimum touch targets.

### Wordmark hard rule
- Never re-set the wordmark from live text. Never letter-space it (tracking is baked into the
  paths). Use the provided SVG artwork (`components/brand/brand.tsx`, sourced from
  `docs/brand/`). The glyph's rivet hole is transparent — never fill it.
