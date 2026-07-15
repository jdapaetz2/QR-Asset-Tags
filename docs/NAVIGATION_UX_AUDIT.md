# Mulemark — Navigation & UX Architecture Audit

**Branch / commit:** `pilot-credibility` @ `6b37f3d` — _"fix(history): repair session browser and filtered end states"_
**Product (internal name):** Mulemark · **Platform brand:** Mulemark (working name)
**Companion visual map:** [`docs/brand/navigation-map.html`](brand/navigation-map.html) (open directly in a browser)

> **Scope & limits.** This is a **current-state audit produced by static source inspection** of routes, layouts,
> route guards, navigation config, link `href`s, and server-action redirect destinations. **No application code,
> route, schema, RLS, style, component, or behavior was changed, and nothing here has been implemented.** No path was
> exercised in a live browser; anything not provable from source is labelled **Unverified** with the manual test
> needed. Every existing route/label/`href` is quoted verbatim from the repository; every proposed route or label is
> explicitly marked **Recommended** and does **not** exist today. Click counts are derived from full page transitions
> in the source, not from a timed session.

---

## 0. Wave 3N.1 implementation decisions (2026-07 — supersedes the recommendations below)

The role/navigation/export/terminology findings in this audit were acted on in **Wave 3N.1**
(`fix(navigation): align roles exports and checklist terminology`). Where a recommendation below conflicts with a
decision here, **this section wins**; the current-state findings are left intact as the record of what was fixed.

- **Canonical user-facing term = "Return checklist"** (not "Return inspection"). Origin variants: **"Renter return
  checklist"** / **"Staff return checklist"**; plural inbox filter "Return checklists"; success "Return checklist
  submitted". The **template architecture keeps "inspection"** (`/dashboard/templates/return-inspections`, template
  names, `lib/inspections/**`), **"Outbound inspection" is unchanged**, and the internal `return_checklist` data
  value, `/forms/[shortCode]/return` route, and helper/function names do **not** change. So the F10 recommendation to
  "standardize on Return inspection" is **reversed**: the seam is unified on **Return checklist** instead.
- **Navigation now matches route authorization.** A new `requireCustomerAdminOrgId()` guard (in `lib/auth/session.ts`,
  wrapping `requireOrgContext()`) enforces `customer_admin` on the server for every admin-only config route —
  Settings (+ Users), Export (+ download), Tag requests, Templates (incl. the return-inspection catalog), Import,
  Equipment-page templates. Operational surfaces (Dashboard, Assets + asset detail, Submissions + inbox CSV, Rentals
  + session evidence, Analytics, and the staff QR workflow) keep the org-membership guard for both roles. The
  staff-visible "Manage team" dead-end is gone (the whole Settings page is admin-only). **Rentals** was added to both
  the admin and staff top nav.
- **Customer data export is a platform-owner-enabled capability, disabled by default.** One canonical helper,
  `canCustomerUseExport({ role, flags })` (`lib/export/access.ts`), gates nav, page, download route, and dashboard
  card: it returns true only when `role === customer_admin` **and** `organizations.customer_exports_enabled` is true
  (fails closed via `toExportFlags`; no migration — the boolean already exists, `not null default false`, migration
  0015). `customer_staff` never sees or reaches export. The export entry point is a **conditional secondary item under
  Settings**, not top nav. The owner always retains owner-side export + the enable/disable toggle.

---

## 1. Executive summary

Mulemark's individual pages are well built and on-brand, but the **journeys between them** have systematic gaps: role
navigation that hides links without enforcing them, a fully-built rental-sessions area with no home in the menu, a
mobile staff flow that drops users into the desktop admin app, filter loss on the operator's most frequent loop, and
an owner experience with no organization context in the menu. The renter (public scan) experience is the strongest
of the three and closest to shippable.

**Five highest-impact findings**

1. **Staff role-gating is display-only, not enforced.** The customer_staff top nav hides Tag requests + Settings, but
   the `(admin)` layout guards on org, not role — so a staff user can reach Settings, Export, Tag requests, Templates,
   and Rentals by typing the URL. Only `/dashboard/settings/users` is truly role-gated. There is even a **visible
   dead link**: staff can open `/dashboard/settings`, click "Manage team", and be bounced to `/dashboard`. _(This is
   a product decision to record, not silently patch: either the nav under-promises or the guards under-protect.)_
2. **Staff QR → desktop-admin cliff.** The staff workflow runs in a webfont-free, system-font mobile shell, but its
   "View session evidence" / "View outbound inspection" actions jump into the full desktop admin `AppShell`. For a
   customer_staff user, that destination isn't in their nav and has no back-to-list link — a context/perf cliff on a
   phone that ends in browser-Back reliance.
3. **Rental sessions has no top-nav home.** `/dashboard/rentals` (list) + `/dashboard/rentals/[sessionId]` (evidence)
   are complete and searchable, but appear in **no** menu — reachable only through ~5 contextual links — and the
   evidence page's only back link is `← Asset timeline`.
4. **Filter loss on the hottest loop.** Opening a submission and pressing Back returns to the **unfiltered** inbox;
   the mark-returned action redirects to a bare inbox too. Operators re-apply the same status/asset/search filter all
   day. Assets has the same detail→back filter loss.
5. **Owner loses organization context.** There is no org sub-nav; drilling into an org's Settings backs out to the
   **org list**, and drilling into Production (`?org=`) backs out to the **cross-org picker**, discarding the org.

**Five quickest wins** (small, low-risk, pilot-ready)

- Add a `← Rentals` back link on `/dashboard/rentals/[sessionId]`.
- Unify the return-workflow labels on one term. _(Wave 3N.1: unified on **"Return checklist"** — see §0.)_
- Point the owner org-Settings back link at the org detail, not `/owner`.
- Carry the querystring on the submissions detail back link + the mark-returned redirect (preserve filters).
- Remove/guard the staff-visible "Manage team" bounce link.

**Proposed primary navigation** (Recommended target — see §12)

| Persona | Recommended top nav | Key structural change |
|---|---|---|
| Platform owner | Organizations · Tag requests · Production · Analytics **+ org-context sub-nav** | Add a per-org sub-nav (Overview / QR / Users / Export / Settings); keep org context on Back |
| Rental company (admin) | Dashboard · Assets · Submissions · **Rentals** · Analytics · Settings | Promote Rentals; fold Tag requests, Templates, Export, Users under Settings |
| Rental company (staff) | Scan-first mobile shell (Scan · Submissions) | **Enforce** role gating so nav and access agree; keep staff on mobile shells |
| End scan user | Single mobile screen (unchanged) | Add a cold-staff "sign in as staff" affordance |

**Overall current scores** (1–5, whole-journey; see §10): Platform owner **2.8**, Rental company **2.7**, End scan
user **3.9**.

---

## 2. Methodology

- **Inputs:** every `app/**/{page,layout,route}.tsx` (66 route files), the nav config (`lib/auth/nav.ts`), the shell
  (`components/app-shell.tsx`, `components/nav-links.tsx`), the guards (`lib/auth/session.ts`, `lib/auth/policy.ts`,
  `lib/staff/guard.ts`), the middleware (`proxy.ts` → `lib/supabase/proxy.ts`), href builders
  (`lib/rentals/evidence.ts`, `lib/dashboard/briefing.ts`), the public surface (`components/public/*`,
  `lib/public/resolve.ts`), brand tokens (`app/globals.css`), and `docs/{BRAND.md, NON_GOALS.md, CODE_HANDOFF.md}`.
- **Technique:** grep each route's inbound `href`, outbound `<Link>`/`redirect()`, guard call, and query-param read;
  cross-check nav config against per-page guards to find nav-vs-guard mismatches; trace server-action `redirect`
  destinations.
- **Click counting:** one click = one navigation that causes a full page transition (App Router server navigation).
  In-page accordions, `<details>` toggles, and form stage advances are counted as taps but noted separately from
  cross-page transitions. Scrolling is **not** a click and is reported as its own friction note.
- **Not done:** no live browser session, no dev server, no timing, no visual regression, no automated crawl. Rendering
  and mobile-overflow claims are from source structure only and flagged **Unverified** where relevant.

---

## 3. Personas & primary jobs

**A. Platform owner** (`platform_owner`) — operates Mulemark itself. Jobs: onboard organizations; manage plan &
covered-asset limits and export permissions; govern QR codes (custom short code, rotation/replacement,
production-primary); run tag production (SVG/CSV/print sheet); fulfil tag requests; view cross-org analytics; suspend
/reactivate orgs; support/troubleshoot a specific org and return to it. Landing: `/owner`.

**B. Rental company user** — one map, three branches:
- **customer_admin** — full org operator. Jobs: dashboard triage; asset lifecycle (create/import/edit/QR/publish);
  submissions inbox triage; rental sessions + evidence; templates; tag requests; org settings/branding; user
  management; export. Landing: `/dashboard`.
- **customer_staff** — reduced daily-loop operator. Jobs: dashboard, assets, submissions, analytics; and the QR
  staff workflow. **Cannot** (by nav) reach Tag requests/Settings — but see §11 for the enforcement gap.
- **staff via QR scan** — a same-org authenticated user who scans a tag and enters `/staff/t/[shortCode]`: start /
  attach / view an outbound inspection, complete a return inspection, view session evidence, scan another asset.

**C. End scan user** (unauthenticated renter / operator / contractor) — scans `/t/[shortCode]`: Quick Start,
manuals, safety/fuel/troubleshooting, support contact (tap-to-call/email), renter acknowledgement, and the three
public forms (damage / support / renter return). Zero-login, mobile-first. Landing: whatever the QR encodes.

---

## 4. Complete route matrix

Legend for **Class**: **P** primary destination · **S** secondary · **C** contextual/workflow · **D** deep-link-only
· **Pub** public · **E** support/error. **Auth**: anon / auth / owner / org-active / role. Back = explicit link
destination unless "browser". "Filter/ID preserved?" flags where returning loses state.

### 4.1 Platform owner — `app/(platform)/owner/**`

| Page | Route | Params | Auth | Top-nav | Purpose | Entry | Exit / back | Class → Rec | Friction |
|---|---|---|---|---|---|---|---|---|---|
| Organizations (home) | `/owner` | — | owner | ✅ | Org list + landing | nav, brand mark | → org detail, new, settings, tag-requests, analytics, users | P → P | — |
| Org detail | `/owner/organizations/[organizationId]` | organizationId | owner | — | Single-org hub | `/owner` name link | back `← Organizations` → `/owner` | P → P | back skips "up"; goes to list |
| New org | `/owner/organizations/new` | — | owner | — | Create org | `/owner` action | action → new org detail; back → `/owner` | C → C | — |
| Org settings & plan | `.../[organizationId]/settings` | organizationId | owner | — | Branding, plan, export flags | `/owner`, org detail | **back `← Organizations` → `/owner`** | S → S | **loses org context on Back** |
| Org users | `.../[organizationId]/users` | organizationId | owner | — | Invite/manage members | org detail, `/owner/users` | back → org detail ✓ | S → S | — |
| Org QR governance | `.../[organizationId]/qr` | organizationId | owner | — | Custom code, rotate, primary | org detail | back → org detail ✓ | S → S | only entry is org detail |
| Org export (page) | `.../[organizationId]/export` | organizationId | owner | — | Admin CSV export | org detail, org settings | back → org settings ✓ | D → S | — |
| Org export (CSV) | `.../[organizationId]/export/download` | organizationId, `?type` | owner | — | CSV handler | export page | — | D → D | — |
| Production | `/owner/production` | `?org`, `?select` | owner | ✅ | Org picker → tag production | nav, org detail, tag-request | **back `← All organizations` → picker** | P → P | **`?org` lost on Back; never returns to org detail** |
| Production exports | `/owner/production/{export.csv,qr.svg,qr-sheet.svg,sheet}` | `?org,?select,?short` | owner | — | SVG/CSV/print handlers | production page | new tab / download | D → D | — |
| Tag requests (global) | `/owner/tag-requests` | `?org,?status,?viewed` | owner | ✅ | All-org procurement queue | nav, `/owner`, org detail | → detail; back → `/owner` | P → P | global-only; org is a filter |
| Tag request detail | `/owner/tag-requests/[id]` | `id` | owner | — | One request + status | tag-requests list | back → list; "Open in production →" | C → C | param named `id`, not `tagRequestId` |
| All users (roster) | `/owner/users` | — | owner | ❌ | Read-only cross-org roster | **`/owner` action only** | back → `/owner` | S → S | **off-nav; reachable only from home** |
| Owner analytics | `/owner/analytics` | — | owner | ✅ | Cross-org counts table | nav, `/owner` | back → `/owner` | P → S | no drill-down out of table |

**Owner note:** every owner page has an **explicit** back link (no page relies purely on browser Back), but the
destinations are inconsistent (some go "up" to org detail, some to `/owner`, one to a picker). There is **no
org-scoped sub-nav** — the top nav never changes when inside an org. Guard placement: `(platform)/layout.tsx` enforces
only authentication (`requireProfile`); every owner page/route repeats `requireRole(ROLES.PLATFORM_OWNER)`.

### 4.2 Rental company admin — `app/(admin)/dashboard/**`

| Page | Route | Params | Top-nav | Purpose | Exit / back | Key query | Filter preserved? | Class → Rec | Friction |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | — | ✅ | Briefing: attention queue, pulse, activity | band-stats → filtered lists; Rentals link | — | n/a | P → P | — |
| Assets list | `/dashboard/assets` | — | ✅ | Asset index + rich filters | rows → asset detail | `q,category,publicStatus,qr,page,lifecycle,rental,sort` | **no — detail back is bare** | P → P | filters lost on return |
| Asset detail | `/dashboard/assets/[assetId]` | assetId | — | Asset hub | `← Assets` (bare); timeline, page editor, documents, rentals`?asset=`, evidence, QR/publish | — | — | P → P | many secondary links, in-page anchors |
| Equipment page editor | `.../[assetId]/page` | assetId | — | Public-page content editor | asset detail | — | — | C → C | — |
| Documents | `.../[assetId]/documents` (+ `/[documentId]`) | assetId, documentId | — | Manage docs | asset detail | — | — | C → C | — |
| Asset timeline | `.../[assetId]/timeline` | assetId | — | Derived history + filters | `← {asset}`; Browse rental sessions → `/dashboard/rentals?asset=` | `q,type,range,from,to` | resets to page one | C → C | — |
| New asset | `/dashboard/assets/new` | — | — | Create asset | assets list | — | — | C → C | — |
| Import | `/dashboard/assets/import` (+ `template.csv`) | — | — | CSV import | assets list, templates | — | — | C → C | — |
| Template catalog | `/dashboard/assets/templates` | — | — | Equipment-page templates | templates page, import | — | — | D → S | weakly linked |
| Submissions inbox | `/dashboard/submissions` | — | ✅ (badge) | Triage queue + bulk | rows → detail; export | `q,form_type,status,asset_id,media,attention,done` | **no — detail back is bare** | P → P | **filter loss (hottest loop)** |
| Submission detail | `/dashboard/submissions/[submissionId]` | submissionId | — | One submission + actions | **`← Submissions` (bare)**; asset detail/timeline/this-asset-subs/session-evidence (×2 clusters) | — | — | P → P | dup link clusters; filter loss |
| Submissions export | `/dashboard/submissions/export` | filter params | — | CSV handler | inbox export button | server filters | — | D → D | — |
| Rentals browser | `/dashboard/rentals` | `?asset`, filters | **❌** | Org rental-session search | dashboard link, asset detail, timeline header | `q,asset_q,renter_q,status,range,from,to,asset` | resets to page one | **C → P** | **no top-nav home** |
| Session evidence | `/dashboard/rentals/[sessionId]` | sessionId | ❌ | Printable evidence record | **`← Asset timeline` only**; rows → submission detail | — | — | C → S | **no `← Rentals` back-to-list** |
| Analytics | `/dashboard/analytics` | `?range` | ✅ | Scan/submission analytics | drill links | `range` | — | P → S | — |
| Templates (return-inspection) | `/dashboard/templates` (+ `new`, `[templateId]`, `return-inspections`, `return-inspections/custom/[id]`) | templateId, id | ❌ | Return-inspection template mgmt | assets templates, asset detail anchor | — | — | D → S | off-nav; deep |
| Tag requests | `/dashboard/tag-requests` (+ `new`, `[id]`) | id | ✅ (admin) | Request physical tags | nav | — | — | S → S | staff nav hides; guard allows |
| Export | `/dashboard/export` (+ `download`) | `?type` | ❌ | Customer self-serve CSV (if enabled) | dashboard card | — | — | D → S | off-nav; owner-gated feature |
| Settings | `/dashboard/settings` | — | ✅ (admin) | Org branding/support/scanner | nav | — | — | S → S | staff can reach by URL |
| Users | `/dashboard/settings/users` | — | ❌ | Team management | settings "Manage team" | — | — | S → S | **only role-gated admin page**; staff bounce |

### 4.3 Staff via QR — `app/(staff)/staff/t/[shortCode]/**`

| Page | Route | Auth | Purpose | Exit | Class | Friction |
|---|---|---|---|---|---|---|
| Staff asset (state matrix) | `/staff/t/[shortCode]` | org member (any role) | 4-state: available/attach/recorded/error | outbound, return, **evidence → `/dashboard/rentals/[id]`**, **outbound insp → `/dashboard/submissions/[id]`**, `← Public equipment page` → `/t/[shortCode]` | C (Pub-adjacent) | cross-surface jump to desktop admin |
| Outbound inspection | `.../outbound` | org member | Outbound baseline form | back to staff page `?started=/?attached=` | C | — |
| Return inspection | `.../return` | org member | Staff return form | complete page | C | — |
| Return complete | `.../return/complete` | org member | Confirmation + evidence links | `/dashboard/rentals/[id]`, `/dashboard/submissions/[id]`, `/dashboard/assets/[id]` | C | jumps to desktop admin |

### 4.4 End scan / public + auth

| Page | Route | Auth | Purpose | Exit / back | Class | Friction |
|---|---|---|---|---|---|---|
| Public equipment page | `/t/[shortCode]` | anon | Scan landing: identity, Quick Start, docs, support, forms, ack | forms; docs (new tab); tap-to-call/email; **staff banner → `/staff/t/[shortCode]`** (same-org only) | Pub | staff link invisible to cold staff |
| Damage form | `/forms/[shortCode]/damage` (+ `/thanks`) | anon | 1-stage damage report | `← Back to equipment page`; thanks → `/t/[shortCode]` | Pub | — |
| Support form | `/forms/[shortCode]/support` (+ `/thanks`) | anon | 1-stage support request | same | Pub | — |
| Renter return | `/forms/[shortCode]/return` (+ `/thanks`) | anon (staff prefill) | 3-stage return inspection | same | Pub | label "Return Checklist" vs form "Return inspection" |
| Unavailable | (rendered by `/t` + forms when resolve = null) | anon | Not-published / suspended notice | none (by design) | E | — |
| Root landing | `/` | anon | Marketing + Sign in | `/login`, demo scan | Pub | not a role redirect |
| Login | `/login` | anon | Password / magic sign-in | role landing / `?next` | Pub | — |
| Auth action / confirm / set-password | `/auth/action`, `/auth/confirm`, `/auth/set-password` | token | Invite/magic + password set | role landing | E/D | — |
| Suspended | `/suspended` | auth | Suspended-org notice | bounces active/owner to landing | E | — |

**IDs / filters not preserved (highlighted):** submissions detail→back (all inbox filters); assets detail→back (all
list filters); `MarkReturnedResolveButton redirectTo` (inbox filters); owner org-settings back (org id → list); owner
production back (`?org` → picker); rentals session detail (no back-to-list at all). Param-name inconsistency for the
same concept: **`?asset=`** (rentals) vs **`?asset_id=`** (submissions) vs **`?category=`** (assets).

---

## 5. Platform-owner written map

1. **Entry points:** `/login` → (owner) `/owner`; brand mark → `/owner`; deep links to any `/owner/*`.
2. **Primary navigation:** Organizations `/owner` · Tag requests · Analytics · Production (4 items; global).
3. **Secondary / contextual:** per-org pages reached from the org detail hub (Settings, Users, QR, Export) and from
   `/owner` (New org, Users). No org-scoped sub-nav exists.
4. **High-frequency:** `/owner` (org list), `/owner/tag-requests` (fulfilment queue), `/owner/production` (tag output).
5. **Low-frequency setup:** New org, org Settings/plan, org Users, org Export.
6. **Workflow-only:** QR governance (`.../qr`), tag-request detail, production export handlers.
7. **Success states:** create-org → new org detail; QR/tag-request actions → same page (redirect-back).
8. **Error/recovery:** bad org/tag id → `notFound()`; non-owner → own landing.
9. **Cross-role handoffs:** owner ↔ org data only through the org detail hub; owner never enters a customer's
   `/dashboard` (separate role landing).
10. **Exit paths:** every page has an explicit back link (to org detail, `/owner`, or the production picker).
11. **Current friction:** no org sub-nav; org-Settings Back → org list; Production Back → picker (org lost);
    `/owner/users` off-nav; QR governance (org) vs Production (global `?org=`) split is non-obvious; param naming
    `organizationId` vs `id`.
12. **Recommended target:** add a persistent **org-context sub-nav** (Overview / QR codes / Users / Export / Settings)
    shown whenever the URL contains an `organizationId`; make Production **org-scoped** (`/owner/organizations/[id]/
    production` **Recommended**) or at minimum keep `?org` on Back and add "← {org} detail"; keep Tag requests global
    but add a per-org tab within the org hub; surface `/owner/users` in the top nav or fold it under Organizations.

---

## 6. Rental-company written map (swimlanes)

**Swimlane A — Admin (desktop).** Nav: Dashboard · Assets · Submissions(badge) · Analytics · Tag requests · Settings.
Primary loop: Dashboard attention queue → asset/submission detail → resolve. Secondary/contextual (off-nav): Rentals,
Templates, Export, Import, Users, asset sub-pages (page editor, documents, timeline). Friction: filter loss on
detail→back (Submissions, Assets); Rentals/Templates/Export have no menu home; duplicate submission-detail link
clusters; `?asset=` vs `?asset_id=`.

**Swimlane B — Staff (mobile).** Nav: Dashboard · Assets · Submissions · Analytics (no Tag requests/Settings). Real
job is the QR flow in the **separate system-font staff shell**: scan → `/staff/t/[shortCode]` → state matrix (Start /
Add outbound → `/outbound`; Complete return → `/return`; View evidence / outbound inspection → **desktop admin**).
Friction: nav hides but doesn't enforce (staff can URL-reach Settings/Templates/Rentals); the desktop-admin jump on a
phone; no back-to-list on the evidence page; the visible-then-bounce "Manage team" link.

**Swimlane C — Shared records & evidence.** `/dashboard/rentals` (list) + `/dashboard/rentals/[sessionId]` (evidence)
+ `/dashboard/submissions/[id]` are shared by both admin and staff; they are the join between the mobile staff flow
and the desktop admin. These are the least-navigable pages: no menu home, one contextual back link, and they mix a
mobile-origin audience with a desktop shell.

**Labelled handoff (staff QR → admin):** a customer_staff user completing a return sees "View session evidence" and
lands on `/dashboard/rentals/[sessionId]` — a page whose section (`Rentals`) does not appear in their nav, with only
`← Asset timeline` to leave. Recommended: keep evidence viewable inside the staff shell, or add a `← Rentals` /
`← Back to staff workflow` path and make Rentals a primary nav item.

**Recommended target:** admin nav = Dashboard · Assets · Submissions · **Rentals** · Analytics · Settings; fold Tag
requests, Templates, Export, Users under **Settings** (secondary). Staff = scan-first shell (Scan · Submissions) with
**enforced** role gating. Preserve list filters across detail→back everywhere. Standardize the asset query param.

---

## 7. End-scan-user written map (mobile-first)

1. **Entry:** QR → `/t/[shortCode]` (or the marketing `/` demo link). `dynamic = force-dynamic`.
2. **Primary screen:** tenant top bar → org identity → cover → asset identity → action nav (Start-Up / Manual /
   **Report Damage** / Return Checklist / Request Support) → content accordions (Quick Start auto-expands on an
   active session) → documents → support contact → footer. A `sm:hidden` sticky bottom bar mirrors the top actions.
3. **Conditional branches (all confirmed in source):**
   - _asset available vs rented_ — **layout identical**; rental state only drives Quick Start auto-expand + ack.
   - _active rental session_ — enables the acknowledgement prompt + Quick Start "first scan" expand.
   - _ack completed vs not_ — AckPrompt shows after 4 s only if a session exists and not completed; **completing**
     writes `ackPrompt:{asset}:{session}` (suppressed for that session on that device); **dismissing** is transient
     (returns next scan); a new session id re-prompts.
   - _unauthenticated vs same-org staff_ — staff see a dashed **"Open staff workflow →"** banner and the ack prompt is
     suppressed; everything else identical.
   - _missing/broken document_ — "Currently unavailable" / "Open · being verified" per `isDocumentOpenable`.
   - _no support contact_ — graceful fallback paragraph; sticky bar swaps the Call cell for a Support-form cell.
   - _public page unavailable / suspended_ — `resolvePublicEquipment` returns null → `UnavailableNotice` (single
     binary; the reason is never disclosed publicly).
4. **Forms:** damage/support are single-stage; renter return is 3-stage (`condition → return_details → review`).
   Submit → `/forms/[shortCode]/{slug}/thanks?ref=SUB-YYYY-XXXXXX`.
5. **Success:** thanks page shows the canonical reference + **"Return to equipment page" → `/t/[shortCode]`** (no
   dead end); every form also has "← Back to equipment page".
6. **Error/recovery:** UnavailableNotice (no link by design — no valid tag to return to).
7. **Cross-role handoff:** the only public→staff bridge is the same-org staff banner; a **cold** staff scan (not yet
   signed in) sees the plain renter page with **no** affordance pointing to `/staff/t/…`.
8. **Terminology:** clean except **"Return Checklist"** (button/thanks) vs the form's own **"Return inspection"**
   title — the renter sees two names for one thing. Internal terms (rental session, submission, outbound, baseline)
   do **not** leak to renters.

**Recommended target:** keep the single mobile screen; unify on "Return checklist" (Wave 3N.1, §0); add a subtle "Are you staff? Sign
in" affordance so a cold staff scan can reach the staff workflow without knowing the URL.

---

## 8. Golden paths & click counts

Clicks = full page transitions. "Ctx re-find" = times the user must re-locate an object/filter. Targets are the
Recommended-state counts.

### Platform owner
| # | Journey | Current sequence | Clicks | Ctx re-find | Back OK? | Mobile | Target | Target path |
|---|---|---|---|---|---|---|---|---|
| 1 | Create org → live org | `/owner` → New org → (submit) org detail | 2 + form | 0 | ✓ | n/a | 2 | unchanged |
| 2 | Org → first QR batch | org detail → QR (set primary) → Production `?org=` → export | 3 | 1 (re-pick org in Production) | ✗ (prod back→picker) | n/a | 2 | org-scoped Production |
| 3 | Tag request → fulfilled | `/owner/tag-requests` → detail → "Open in production" → export → back to request → set status | 5 | 1 | partial | n/a | 3 | keep request context on return |
| 4 | Rotate a QR without breaking tags | org detail → QR → rotate (redirect-back) | 2 | 0 | ✓ | n/a | 2 | unchanged |
| 5 | Diagnose an org, return to it | org detail → (Settings / Users / Production) → **back lands on `/owner` or picker** → re-open org | 3–4 | 1–2 | ✗ | n/a | 2 | org sub-nav keeps context |

### Rental company
| # | Journey | Clicks | Ctx re-find | Back OK? | Mobile | Target | Note |
|---|---|---|---|---|---|---|---|
| 1 | CSV import → live asset page | Assets → Import → (upload) → asset detail → Publish/QR | 4 + upload | 0 | ✓ | ok | 4 | — |
| 2 | Damage report → resolved | Dashboard queue → review inline **or** Submissions → detail → resolve | 2–3 | 1 on back (filter lost) | ✗ | ok | 2 | preserve filter |
| 3 | Find asset by code | Assets → type code → row | 1 + search | 0 | ✗ (back loses filter) | ok | 1 | preserve filter |
| 4 | Find session by RNT | **no nav home** → Dashboard/asset link → Rentals → search RNT → evidence | 3 | 1 | ✗ (no back-to-list) | poor | 1 | Rentals in nav |
| 5 | Office marks rented, staff attaches outbound | admin asset detail mark-rented; staff scan → Add outbound → submit | 2 + 1 scan | 1 (cross-surface) | n/a | mixed | 2 | — |
| 6 | Staff outbound starts a rental | scan → Start outbound → submit → staff page (`?started=`) | 1 scan + 2 | 0 | ✓ | ok | 3 | — |
| 7 | Renter return → staff completes | renter `/t` → Return → submit; staff scan → Complete return → submit | mixed | 1 | n/a | ok | — | — |
| 8 | Review all evidence for a session | Rentals → search → evidence (outbound + renter + staff in one) | 3 | 1 | ✗ | poor | 1 | Rentals in nav |
| 9 | Resolve/archive multiple submissions | Submissions → filter → multi-select → bulk action | 1 + selects | 0 | n/a | poor (mobile table) | 1 | — |
| 10 | Change scanner branding / support | **Settings not obvious for staff**; admin: Settings → save | 1 | 0 | ✓ | ok | 1 | — |
| 11 | Request physical tags | Tag requests → new → submit | 2 | 0 | ✓ | ok | 2 | — |
| 12 | Find assets with open damage | Dashboard attention queue → asset (or Submissions `?attention=damage`) | 1–2 | 0 | partial | ok | 1 | — |

### End scan user
| # | Journey | Clicks/taps | Back OK? | Mobile | Target | Note |
|---|---|---|---|---|---|---|
| 1 | Scan → Quick Start | 0 (auto-expand on session) / 1 tap | ✓ | ✓ | 0–1 | strongest path |
| 2 | Scan → manual/document | 1 (new tab) | ✓ | ✓ | 1 | — |
| 3 | Scan → contact support | 1 (tap-to-call) | ✓ | ✓ | 1 | — |
| 4 | Scan → damage + photos | Damage → fill → review → submit → thanks | 1 + form | ✓ | ✓ | 1 | — |
| 5 | Scan → support request | Support → fill → submit → thanks | 1 + form | ✓ | ✓ | 1 | — |
| 6 | Scan → renter return | Return → 3 stages → submit → thanks | 1 + 3 | ✓ | ✓ | 1+3 | unify label |
| 7 | Submit → back to equipment | thanks → "Return to equipment page" | 1 | ✓ | ✓ | 1 | no dead end |
| 8 | Complete ack, avoid re-prompts | ack card → complete (writes per-session key) | 1 | n/a | ✓ | 1 | correct |

**Scrolling friction (reported separately):** the renter `/t` page is a long single scroll (identity → 6 accordions →
docs → support) — acceptable and mobile-idiomatic. Admin **Submissions** and **Assets** tables and the **rental
evidence** page are dense and require significant horizontal/vertical scrolling on a phone; the staff-origin evidence
view is the worst offender because its audience arrives from a mobile shell.

---

## 9. Cross-role handoffs

1. **Public scan → staff workflow.** `/t/[shortCode]` shows a same-org staff banner → `/staff/t/[shortCode]`
   (guarded; cold/anon → `/login?next=`). _Gap: invisible to a not-yet-signed-in staff member._
2. **Staff workflow → admin records.** `/staff/t/[shortCode]` and `/return/complete` link into
   `/dashboard/rentals/[sessionId]` and `/dashboard/submissions/[id]` — a jump from the mobile system-font shell into
   the desktop `AppShell`. _Gap: off-nav for staff, no back-to-list._
3. **Owner → organization data.** Only through the org detail hub; owner never enters `/dashboard`. _Gap: org context
   lost on Back from Settings/Production._
4. **Renter return → staff return.** Renter submits `/forms/[shortCode]/return` (origin=public); staff later completes
   `/staff/t/[shortCode]/return` (origin=staff); both reconcile into the same rental session evidence. Terminology
   differs across the seam ("Return Checklist" vs "Return inspection" vs `return_checklist`).

---

## 10. Current UX scorecard (1–5, whole journey)

| Dimension | Owner | Rental co. | End scan | Notes |
|---|---|---:|---:|---|
| Discoverability | 2 | 2 | 4 | Rentals/Templates/Export/Users off-nav; owner org functions buried; renter actions all visible |
| Information scent | 3 | 3 | 4 | Good labels; but "reference numbers" and off-nav areas give weak scent |
| Click efficiency | 3 | 3 | 4 | Redirect-backs help owner; filter loss + no-nav-home hurt rental |
| Role clarity | 2 | **1** | 4 | Staff nav hides but guards allow; visible-then-bounce link; renter role is clear |
| Terminology consistency | 3 | 2 | 3 | production/QR governance ok; return checklist/inspection + rental session/timeline vary |
| Context preservation | 2 | 2 | 5 | org lost on Back; filters lost on detail→back; renter has little state to lose |
| Error recovery | 3 | 3 | 4 | explicit backs; `notFound`/suspended handled; UnavailableNotice clean |
| Mobile usability | 3 | 2 | 5 | owner is desktop-only by nature; admin tables + staff→desktop jump hurt; renter excellent |
| Desktop usability | 4 | 4 | 3 | dense admin pages are strong on desktop |
| Navigation consistency | 2 | 2 | 4 | inconsistent back destinations; param names differ; renter is uniform |
| Visibility of system status | 3 | 3 | 4 | badges + banners good; rental state on `/t` is invisible (by design) |
| Visibility of next action | 3 | 3 | 4 | staff matrix + thanks pages are clear; inbox next-step after resolve is stale (bare list) |
| **Average** | **2.8** | **2.7** | **3.9** | judged on the full journey, not individual pages |

Role clarity for the rental company scores **1**: the single most serious whole-journey defect is that navigation and
access disagree (nav hides what guards permit), which is both a security-adjacent and a comprehension problem.

---

## 11. Friction & navigation defects

| # | Persona | Route / component | Current behavior | Why a problem | Freq | Sev | Recommended correction | Effort | Deps / risk |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Staff | `(admin)/layout.tsx` + all admin pages | Layout guards org, not role; only `settings/users` role-gated | Staff can URL-reach Settings/Export/Tag-requests/Templates/Rentals; nav≠access | high | **P0** | Decide the policy, then either add `requireRole` to admin-only pages **or** expand the staff nav to match | M | product decision first; RLS already scopes data |
| F2 | Staff | `settings/page.tsx` "Manage team" | Visible link → `/dashboard/settings/users` → bounce to `/dashboard` | Dead link; role confusion | med | **P0** | Hide the link for non-admins (or gate the settings page) | S | depends on F1 policy |
| F3 | Staff | `/staff/*` → `/dashboard/rentals/[id]`, `/dashboard/submissions/[id]` | Mobile system-font shell jumps to desktop AppShell; off-nav; no back | Mobile cliff + dead end | high | **P1** | Render evidence inside the staff shell, or add `← Back to staff workflow`; make Rentals primary | M | shared components |
| F4 | Admin | `/dashboard/rentals/[sessionId]` | Only `← Asset timeline`; no back-to-list | Repeated searching; browser-Back reliance | high | **P1** | Add `← Rentals` (preserve prior filters) | S | — |
| F5 | Admin | `/dashboard/rentals` | Not in any top nav | Full feature is hidden | high | **P1** | Add **Rentals** to admin nav | S | nav config |
| F6 | Admin | `submissions/[id]` back + `MarkReturnedResolveButton` | Bare `/dashboard/submissions` | Filter loss on the hottest loop | high | **P1** | Carry the querystring on back + redirect | S/M | — |
| F7 | Admin | `assets/[assetId]` back | Bare `/dashboard/assets` | Filter loss | high | **P2** | Preserve list filters | S/M | — |
| F8 | Owner | `.../settings` back; `/owner/production?org=` back | Back → `/owner` list / picker | Org context lost; re-navigation | med | **P1** | Back → org detail; keep `?org`; add org sub-nav | M | — |
| F9 | Owner | top nav / `/owner/users` | No org sub-nav; roster off-nav | Owner must memorize structure | med | **P2** | Org-context sub-nav; surface Users | M | — |
| F10 | Renter/all | "Return Checklist" vs "Return inspection" vs `return_checklist` | Three names for one thing | Terminology confusion across the seam | med | **P2** | Standardize on "Return checklist" (Wave 3N.1, §0) | S | copy-only |
| F11 | Admin | `?asset=` (rentals) vs `?asset_id=` (submissions) | Two param names, same concept | Inconsistent deep links | low | **P3** | Standardize one param name | S | parser change |
| F12 | Admin | `submissions/[id]` `assetCard` + `assetStrip` | Two link clusters, near-identical | Duplicate labels/paths | low | **P3** | Collapse to one | S | — |
| F13 | Staff | `/t/[shortCode]` cold staff | Staff banner only when already authenticated | Cold staff can't find the staff flow | med | **P2** | Add a "sign in as staff" affordance | S | — |

---

## 12. Recommended target information architecture

Per user-facing area, the recommended classification (**Primary top-nav / Secondary / Contextual / Deep-link /
Public / Support-error / Remove-or-consolidate / Rename**). Everything below is **Recommended** — none of it exists
today. Use **progressive disclosure**: not every route belongs in the top nav.

**Platform owner.** Top nav (4): **Organizations · Tag requests · Production · Analytics**. Add an **org-context
sub-nav** rendered whenever the URL holds an `organizationId`: **Overview · QR codes · Users · Export · Settings**
(Recommended). Make org data functions live under that sub-nav; keep global Production + Analytics + Tag requests at
the top (with Tag requests _also_ available as a per-org tab). The owner returns to "the current org" via the sub-nav,
not Back. QR governance stays **org-scoped** (correct today). Tag requests stay **global** with an `?org` filter
(correct) plus a per-org view. Surface `/owner/users` in the top nav or fold under Organizations (Remove from
"home-only").

**Rental company.** Admin top nav (6): **Dashboard · Assets · Submissions · Rentals · Analytics · Settings**.
- **Promote:** Rentals → Primary. **Fold under Settings** (Secondary): Tag requests, Templates + return-inspection
  templates, Export, Users, scanner branding. **Keep Primary:** Dashboard, Assets, Submissions, Analytics.
- **Asset-level secondary nav** (on `/dashboard/assets/[assetId]`): Overview · Equipment page · Documents · Timeline ·
  Rentals (`?asset=`) — a consistent per-asset tab strip (Recommended) instead of scattered inline links.
- **Submission-level contextual nav:** one asset link cluster (collapse the `assetCard`/`assetStrip` duplication);
  keep status actions above the fold.
- **Mobile staff:** a scan-first shell (Scan · Submissions); render evidence within it; **enforce** role gating so
  nav and access agree.
- **Rentals:** should be **Primary** (it is a daily operator surface once outbound/return workflows are in use), not
  contextual-only.

**End scan.** First-screen hierarchy: identity → primary action (Report Damage) → Quick Start → docs → support. Keep
Quick Start auto-expand on an active session; keep ack behavior (per-session key). Form entry from both the action nav
and the sticky bar; keep the 3-stage return with review + confirmation + "Return to equipment page". Add a cold-staff
sign-in affordance (Recommended). Unavailable/suspended recovery stays a single non-disclosing notice.

---

## 13. Page-layout standards

Recommended consistent shells (Recommended; describes the target, not current):

| Shell | Title area | Primary action | Status | Secondary nav | Back/breadcrumb | Filters | Mobile | Desktop density | Empty | Error | Return path | Filter preservation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| List/index | H1 + count | one filled button | inline badges | tab strip if scoped | explicit up-link | top, collapsible `<details>` | stacked, 44px targets | dense rows | one-line + one CTA | inline `role=alert` | keep list filters | **URL params preserved on detail→back** |
| Asset detail | AssetCodeChip + name | Publish/QR | rental + readiness badges | per-asset tab strip | `← Assets` **(with filters)** | n/a | stacked sections | 2-col | — | — | back to filtered list | preserve |
| Submission detail | reference + type badges | status buttons | status badge | one asset cluster | `← Submissions` **(with filters)** | n/a | reorder actions first | 2-col | — | — | filtered inbox | preserve |
| Session evidence | RNT ref + status | Print | Active/Returned | `← Rentals` + `← Asset timeline` | explicit both | n/a | print-first | disclosures | per-source empty | — | back to Rentals list | preserve |
| Staff scan | asset identity | one state-appropriate primary | state banner | none (mobile) | `← Public equipment page` | n/a | system font, single column | n/a | safe error card | error state | back to `/t` | n/a |
| Settings/setup | section H2s | Save per card | saved indicator | grouped tabs | `← Dashboard` | n/a | stacked cards | forms | — | inline validation | landing | n/a |
| Owner org page | org name + status | Manage | account status | **org sub-nav** | `← Organizations` + sub-nav | n/a | desktop | dense | — | `notFound` | org detail | keep `?org`/sub-nav |
| Public scan | org identity | Report Damage | (none shown) | action nav + sticky bar | none (entry) | n/a | mobile-first, sticky bar | n/a | — | UnavailableNotice | n/a | n/a |
| Public form | "Equipment · Locked to this tag" | Submit | step N of M | none | `← Back to equipment page` | n/a | mobile-first, `max-w-md` | n/a | — | "no longer available" | `/t/[shortCode]` | preserve edits across Back |
| Success | received title | Return to equipment page | reference chip | none | link back | n/a | mobile-first | n/a | — | degrade if unresolved | `/t/[shortCode]` | n/a |

---

## 14. Prioritized recommendations

| ID | Pri | Persona | Problem | Change (Recommended) | Routes | Benefit | Clicks → | Effort | Risk | Before pilot? |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | P0 | staff | nav hides but guards allow | Decide policy; align guards **or** nav | `(admin)/*` | role clarity + safety | — | M | product decision | **Yes** |
| R2 | P0 | staff | "Manage team" bounce | hide/guard the link | `settings/*` | no dead link | — | S | low | **Yes** |
| R3 | P1 | admin | Rentals off-nav | add **Rentals** to admin nav | `lib/auth/nav.ts` | discoverability | 3→1 | S | low | **Yes** |
| R4 | P1 | admin/staff | no back-to-list on evidence | add `← Rentals` | `rentals/[sessionId]` | less searching | — | S | low | **Yes** |
| R5 | P1 | admin | filter loss (submissions) | carry querystring on back + redirect | `submissions/*` | fewer re-filters | 3→2 | S/M | low | **Yes** |
| R6 | P1 | staff | mobile→desktop cliff | evidence inside staff shell / back link | `/staff/*` | mobile continuity | — | M | shared UI | soon |
| R7 | P1 | owner | org context lost | org sub-nav; keep `?org`; org-scoped Production | `/owner/*` | fewer re-navs | 3→2 | M | med | soon |
| R8 | P2 | admin | assets filter loss | preserve list filters | `assets/*` | fewer re-filters | — | S/M | low | soon |
| R9 | P2 | renter | return term mismatch | "Return checklist" everywhere renter-facing (Wave 3N.1, §0) | `/t`, forms | clarity | — | S | copy | **Yes** |
| R10 | P2 | staff | cold-staff can't find flow | "sign in as staff" affordance | `/t` | staff onboarding | — | S | low | soon |
| R11 | P3 | admin | `?asset=` vs `?asset_id=` | standardize param | rentals/submissions | consistent deep links | — | S | parser | later |
| R12 | P3 | admin | duplicate link clusters | collapse to one | `submissions/[id]` | less clutter | — | S | low | later |
| R13 | Future | admin | asset-level tab strip | per-asset secondary nav | `assets/[assetId]/*` | recognition | — | M | design | later |
| R14 | Future | all | self-service action measurement | (already a documented non-goal) | — | proof-of-value | — | L | out of scope | no |

**Five highest-impact:** R1, R3, R4, R5, R7. **Five quickest wins:** R2, R3, R4, R9, R5. **Do not do yet:** R14
(explicit non-goal — `docs/NON_GOALS.md`); a full asset-level tab-nav redesign (R13) before the P0/P1 defects; any
new top-level nav items beyond Rentals (avoid crowding — use Settings sub-grouping instead); renaming DB/`form_type`
values (`return_checklist`) — change **display** copy only, never the canonical data term.

---

## 15. Mulemark Navigation & Workflow Standard

Actionable rules (not generic theory). "Must" = a defect if violated.

1. **Recognition over recall.** Every high-frequency destination is either in the top nav or one predictable click
   from it. If a fully-built area (e.g. Rentals) has no menu home, that is a defect.
2. **One obvious primary action per region.** Exactly one filled/chamfered primary per view; secondaries are bordered
   or links (already the pattern on the staff state matrix — apply everywhere).
3. **Role-aware navigation must match access.** Nav that hides a link the guards still permit is a defect. Either the
   route is role-gated **and** hidden, or shown **and** reachable — never one without the other.
4. **Scan-first mobile staff.** Staff task flows stay in the system-font mobile shell; never route a mobile staff user
   into the desktop admin shell without an in-shell view or an explicit, labelled handoff and a way back.
5. **Renter-facing zero-login.** No public action requires auth; `/t` and `/forms` load webfont-free; the reason a page
   is unavailable is never disclosed publicly.
6. **Context preservation.** A detail→Back must return to the **filtered** list the user came from. Server actions that
   change state must return the user to a **current** context, not a bare default list.
7. **Filtered deep links.** Links from a summary (dashboard band-stat, attention queue, "this asset's submissions")
   open the **filtered** state, never an unfiltered index.
8. **Consistent terminology.** One renter-facing name per concept: **Return checklist** (Wave 3N.1, §0),
   **Rental session**, **Session evidence**, **Timeline/History**. Internal data terms (`return_checklist`, `outbound`,
   `baseline`) never surface to renters.
9. **Consistent status vocabulary + color.** Submissions: `new`=info(blue), `reviewed`=neutral, `resolved`=success
   (green), `archived`=neutral. Assets: Available/Rented, QR ready, Page live. Rental sessions: Active/Returned. Same
   word + same tone everywhere; badges are border+text (no fill), never stacked to say one thing.
10. **Progressive disclosure.** Not every route in the top nav. Setup/low-frequency pages (Templates, Export, Users,
    Import) live under Settings or a contextual entry, never as permanent top-nav slots.
11. **No ambiguous clickable reference numbers.** A reference (`SUB-…`/`RNT-…`) is displayed as a non-clickable mono
    chip; navigation uses a separate explicit action (already the evidence-page pattern — keep it universal).
12. **No hidden destructive actions;** archive is neutral, not red; genuinely destructive actions confirm.
13. **No duplicate navigation labels** pointing at the same target from one view (collapse the submission-detail
    clusters).
14. **No repeated searching.** A user should never have to re-find the same asset/session/filter they were just on —
    preserve query state and provide back-to-list links.
15. **No operationally irrelevant fields in primary views;** no setup noise in the attention queue; the dashboard
    briefing shows what needs action, not configuration gaps mixed in.
16. **No unbounded history pages** (already enforced: cursor pagination + explicit Load-more) and **no automatic
    refresh/poll loops** (already enforced) — keep both invariants in any new list.

---

## 16. Navigation regression checklist

Rerun after each wave. Format: **start route → action → expected destination → expected preserved state → expected
role behavior.**

**Platform owner**
- `/owner` → click an org → `/owner/organizations/[id]` → n/a → owner only.
- org detail → QR codes → `.../qr` → org id in path → owner only; Back → org detail.
- org detail → Production → `/owner/production?org=[id]` → `?org` preserved → **[current: Back drops `?org` — verify]**.
- `/owner/tag-requests` → open a request → `/owner/tag-requests/[id]` → marks viewed → owner only.
- non-owner hits any `/owner/*` → redirected to own landing.

**Rental company**
- Dashboard band-stat "Rented" → `/dashboard/assets?rental=rented` → filter applied.
- Assets → filter → open asset → Back → **[current: filter lost — verify]**.
- Asset detail → Timeline → `.../timeline`; → "Browse rental sessions" → `/dashboard/rentals?asset=[id]`.
- Submissions → set status filter → open submission → Back → **[current: returns to unfiltered inbox — verify]**.
- Submission → Mark returned → **[current: redirect to bare inbox — verify]**.
- Rentals → search RNT → open evidence → **[current: no `← Rentals` — verify]**.
- Staff scan → Complete return → View session evidence → `/dashboard/rentals/[id]` → **[current: off-nav for staff,
  desktop shell — verify]**.
- customer_staff → type `/dashboard/settings` → **[current: reachable; only `/settings/users` blocks — verify]**.
- customer_staff → `/dashboard/settings/users` → redirected to `/dashboard` (role-gated ✓).

**End scan user**
- Scan `/t/[shortCode]` (active session) → Quick Start auto-expands; ack card appears after 4 s.
- Complete ack → re-scan same session → ack suppressed; new session → ack returns.
- Dismiss ack → re-scan → ack returns.
- `/t` → Report Damage → submit → `/forms/[shortCode]/damage/thanks?ref=SUB-…` → "Return to equipment page" →
  `/t/[shortCode]`.
- `/t` (renter return) → 3 stages → submit → thanks → back to `/t`.
- Same-org staff scan → "Open staff workflow" banner shown; ack suppressed.
- Cold (anon) staff scan → **[current: no staff affordance — verify]**; `/staff/t/[shortCode]` while anon →
  `/login?next=/staff/t/[shortCode]`.
- Unpublished/suspended tag → `UnavailableNotice`, reason not disclosed.

---

## 17. Open questions & unverified behavior

- **[Product decision] Staff permissions vs nav.** The customer_staff nav hides Tag requests + Settings, but the
  `(admin)` layout guards on org (not role) and only `/dashboard/settings/users` uses `requireRole`. **Contradiction
  between navigation config (hides) and route guards (allow).** Decide the intended policy before "fixing" either
  side — the audit does not assume which is correct. _(Documented, not patched.)_
- **[Unverified — needs browser test]** Exact runtime behavior of the middleware redirect + cookie refresh timing
  (`proxy.ts` matcher `/dashboard/:path*`, `/owner/:path*`; `/staff` guarded per-page). Source confirms the redirect
  to `/login?next=`; not exercised live.
- **[Unverified]** Visual rendering, 390 px overflow, and print output of the dense admin pages (Submissions, Assets,
  session evidence). Structure suggests horizontal scroll on a phone; not visually tested.
- **[Unverified]** Real click counts assume no mis-taps and the current link graph; they are static estimates.
- **[Unverified]** Whether every "orphan-ish" page has at least one **intended** entry point vs an accidental one —
  the weakest-linked are `/dashboard/assets/templates` and `/dashboard/templates/return-inspections/custom/[id]`
  (each reachable from only one or two places); confirmed reachable, not confirmed discoverable.
- **[Contradiction]** Renter-facing return flow is labelled "Return Checklist" (button/thanks) while the form titles
  itself "Return inspection" and the data uses `return_checklist` — three names for one concept.
- **[Contradiction]** Same concept, three query-param spellings: `?asset=` (rentals), `?asset_id=` (submissions),
  `?category=`/others (assets).

_End of audit._
