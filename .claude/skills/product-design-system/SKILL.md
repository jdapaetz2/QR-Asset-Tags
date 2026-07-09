---
name: product-design-system
description: MuleMark design system rules for AssetTag QR admin/marketing UI — tokens, typography, the AssetTagChip device, status/timestamp/eyebrow/empty-state/motion/voice rules, and the wordmark hard rules. Consult before any visual/UI change on admin or marketing surfaces (never applies to /t/ scan pages beyond the zero-webfont rule).
---

# Product Design System (working name: MuleMark)

Canonical brand artwork + rules: `docs/brand/BRAND.md` and `docs/brand/brand-reference.html`.
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
- The single signature device. Admin surfaces only; never on `/t/` or `/forms/`. Ring-style
  rivet hole at the left (a ring with a **transparent** center — never filled), code in
  JetBrains Mono. Optional single readiness dot; never a cluster.

### Status display (never stack badges)
- One rental-state badge (Rented / Available). One readiness indicator. A lock icon for
  private. Never stack multiple badges to say one thing.

### Timestamps
- Relative display ("2h ago"); absolute local time on hover (title). Never show raw UTC on
  customer-facing screens.

### Empty states
- One single-weight line icon in `iron-600`, one sentence, one primary action. Nothing more.

### Motion
- 150ms ease-out on hovers; one 250ms slide for panes/toasts; skeleton shimmer for loading.
- **Nothing animates on scan pages.** `prefers-reduced-motion` kills all motion.

### Voice
- Sentence case. Verb-first buttons. The action name matches its toast. Errors state the fact
  plus the fix.

### Accessibility
- Visible focus rings. AA contrast minimum. 44px minimum touch targets.

### Wordmark hard rule
- Never re-set the wordmark from live text. Never letter-space it (tracking is baked into the
  paths). Use the provided SVG artwork (`components/brand/brand.tsx`, sourced from
  `docs/brand/`). The glyph's rivet hole is transparent — never fill it.
