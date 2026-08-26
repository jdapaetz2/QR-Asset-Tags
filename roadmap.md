# Mulemark Roadmap

**Updated:** July 22, 2026  
**Current stage:** Pre-pilot product hardening  
**Next phase:** Phase A - Pilot closeout and production hardening

## Purpose

This file is the durable roadmap for Mulemark. It records:

- the current product position
- the work that must be completed before a paid pilot
- the commercial and physical-product work that follows
- trigger-based features that should not be built until real customer evidence justifies them
- decisions that should not be reopened casually

It is not a substitute for `CLAUDE.md`, `docs/CODE_HANDOFF.md`, `docs/NON_GOALS.md`, `docs/DATA_MODEL.md`, or `docs/SECURITY_MODEL.md`. Current repository code remains the technical source of truth.

---

## Product thesis

Mulemark is a customer-facing support, return-checklist, condition-evidence, and rental-session layer attached to physical rental equipment through durable QR tags.

Mulemark does not attempt to replace a rental-management system. Its strongest value is:

- instant renter access to useful equipment information
- structured damage and support intake
- renter and staff return checklists
- outbound and return condition evidence
- durable rental-session history
- fewer low-value support interactions
- clearer damage and accessory records
- better yard workflow and customer experience
- durable physical tags plus implementation, not software alone

---

## Current product position

The core pilot workflow is substantially built:

- public QR equipment pages
- tenant branding and support contacts
- manuals and equipment documents
- Quick Start, safety, fuel/power, troubleshooting, and return information
- public damage and support forms
- renter return checklists
- authenticated staff outbound inspections
- authenticated staff return checklists
- rental sessions connecting outbound, renter, acknowledgement, and staff records
- photo-backed condition evidence
- asset timelines
- searchable rental-session evidence
- submissions inbox, filters, bulk triage, and notifications
- asset import, templates, and category assignment
- QR governance, rotation, production-primary selection, and tag requests
- plan limits and covered-asset counts
- platform-owner-controlled customer export
- role-aware navigation for owner, customer admin, customer staff, and public scan users
- Mulemark branding and design language across current product surfaces

The remaining risk is no longer a missing core workflow. The main risks are:

- production deployment discipline
- stale technical documentation
- cross-role and cross-tenant regressions
- public abuse and storage-cost exposure
- email and operational observability
- insufficient browser and real-device coverage
- unstable domain or physical-tag assumptions
- incomplete commercial packaging and physical-tag validation

---

## Durable product decisions

### Usage and pricing model

- Public scans are unlimited.
- Pricing is based primarily on covered assets per yard/location.
- A covered asset is active, non-archived, and actively covered by a production QR tag.
- There is no seasonal or rarely-used paused-coverage loophole.
- Archived assets do not count.
- First-year pricing may be lower than renewal pricing to reduce adoption friction.
- Annual plans may include a physical-tag allowance.
- Standard implementation is scoped. It is not unlimited custom work.

### Export and continuity

- Customer export is disabled by default.
- Only the platform owner can enable customer export.
- When enabled, customer export is available to customer admins only.
- Customer staff never receives organization-wide export access.
- Platform-owner export remains available regardless of the customer-export setting.
- A complete future offboarding package must eventually include media, not only CSV data.

### Terminology

- The canonical user-facing term is **Return checklist**.
- Origin-specific records use **Renter return checklist** and **Staff return checklist**.
- **Outbound inspection** remains the outbound term.
- Internal identifiers such as `return_checklist` do not need cosmetic renaming.

### Evidence and photos

- Photos are strongly encouraged but are not an absolute prerequisite.
- Missing recommended evidence requires a clear confirmation where appropriate.
- Damage remains actionable even when no usable photo can be provided.
- Records and media have different retention needs.
- Evidence must never be silently deleted.

### QR durability

- Short codes must remain durable.
- A stable production domain is also required before permanent physical tags are deployed.
- Preview and localhost URLs are never production-tag destinations.
- Redirect continuity and domain ownership must be documented.

---

# Roadmap phases

## Phase A - Pilot closeout and production hardening

**Objective:** Turn the current feature-complete pilot product into a production-deployable, supportable, and testable system.

### A0. Current-state orientation

- record branch, commit, working tree, migrations, route inventory, and deployment state
- compare current code to handoff and roadmap documentation
- identify actual pilot blockers without assuming older docs are accurate
- produce an evidence-based Phase A implementation plan

### A1. Repository and documentation reconciliation

- reconcile `CODE_HANDOFF`, `DATA_MODEL`, `SECURITY_MODEL`, `NON_GOALS`, roadmap, inspection docs, and staff workflow docs
- remove stale statements claiming implemented features are still future work
- create an authoritative migration ledger
- document applied, unapplied, superseded, and operator-required migrations
- confirm current route, role, export, notification, storage, rental-session, and QR behavior

### A2. Production deployment and environment readiness

- validate Vercel and Supabase project linkage
- validate production environment variables
- confirm production URL and QR base URL
- prevent production tag output using localhost or preview hosts
- apply all required migrations in the target project
- verify Resend production configuration
- verify Speed Insights and production logging
- create a repeatable deployment and rollback runbook
- run production smoke tests

### A3. Security, roles, and tenant isolation

- audit every route, server action, RPC, storage path, and export handler
- verify customer-admin and customer-staff permissions
- verify platform-owner isolation and organization context
- verify cross-organization IDs fail safely
- confirm service-role usage is limited to sanctioned server workflows
- verify public forms are insert-only and private media remains private
- add automated regression coverage for the highest-risk boundaries
- scan tracked files and docs for secrets

**Split slices (from A0):**
- **A3.1 — database role-separation backstop.** Add a defense-in-depth backstop so same-organization write policies
  distinguish `customer_admin` from `customer_staff` (org settings, notification settings, tag requests, templates),
  harden/review the server-only service-role team-management path, and resolve the `/dashboard/submissions/export`
  product-policy decision so it cannot bypass owner-controlled customer export. These are intra-tenant/defense-in-depth
  items, not cross-tenant leaks (see `docs/PILOT_LIMITATIONS.md`).
- **A3.2 — full boundary audit + secret scanning.** Broader route/server-action/RPC/storage-path/export audit,
  cross-organization ID fuzzing, and CI secret scanning + git hooks.

### A4. Public abuse, rate limiting, and upload cleanup

- retain the honeypot as a low-cost first layer
- add shared-store rate limiting for public submissions and media workflows
- do not use instance-local in-memory limits
- rate-limit by privacy-preserving identifiers such as IP hash, short code, and action
- return clear 429 responses without leaking asset or organization state
- enforce file count, per-file size, total-byte, MIME, and path rules
- clean uploaded files when submission finalization fails
- provide an operator cleanup path for orphaned media
- add structured abuse logging without raw IP storage

### A5. Notification reliability and operational observability

- verify the Mulemark sending domain and provider configuration
- document SPF, DKIM, and DMARC requirements
- preserve non-blocking public submissions when email fails
- stop swallowing failures without enough diagnostic information
- add structured, redacted notification logs
- capture provider response IDs and failure classifications where safe
- define retry or operator follow-up behavior for transient failures
- create an operations runbook for email, deployment, storage, and public-form incidents
- avoid building SMS or a full notification center in Phase A

### A6. Browser E2E, real-device QA, and performance baseline

- add a focused Playwright suite if one does not exist
- cover public scan, forms, renter return checklist, staff outbound, staff return, submissions, rentals, export gating, and owner routes
- test role and tenant boundaries through real navigation
- create repeatable QA accounts and test-data setup
- test photo uploads with controlled fixtures
- test iPhone and Android devices or equivalent real-device coverage
- test weak-signal behavior and mobile layout at common widths
- establish Speed Insights and route-performance baselines
- define practical performance budgets for scan and form routes

**Split slices (from A0 — no browser/E2E, live-RLS, or migration-execution tests exist today):**
- **A6.1 — E2E harness.** Stand up a Playwright suite from scratch (none exists; `vitest` runs node-only with no DOM)
  and wire it into CI; cover the public scan/forms/return-checklist and core admin golden paths.
- **A6.2 — role and tenant boundary E2E.** Exercise customer-admin, customer-staff, platform-owner, and public
  boundaries through real navigation, plus live-RLS/migration-execution coverage for the highest-risk boundaries.
- **A6.3 — real-device QA + performance baseline.** iPhone/Android (or equivalent) scan/form testing, weak-signal and
  common mobile widths, and Speed Insights / route-performance budgets.

### A7. Pilot-readiness closeout — **DONE**

Produced **six independent readiness verdicts** rather than one blended answer, so the domain and email
deferrals cannot drag down the software verdict and good software results cannot imply tag/email
approval. Full evidence: [`docs/PHASE_A_PILOT_READINESS.md`](docs/PHASE_A_PILOT_READINESS.md).

| Readiness | Verdict |
|---|---|
| Development | **GO** |
| Controlled staging / demo | **GO** |
| Software-only limited pilot | **CONDITIONAL GO** (temporary-URL disclosure, no metal tags, manual email process, data isolation) |
| Permanent-tag live customer pilot | **NO-GO** — no stable domain |
| Live notification delivery | **NO-GO** — no Resend domain / SPF / DKIM / DMARC / verified sender |
| Physical production | **NOT YET ASSESSED** — laser not arrived |

Gates at closeout: lint, typecheck, **1087 unit tests**, build, **79 security tests**, **68 E2E**,
12 smoke, `verify:production-config` (0 fail). Migrations **0001–0033** verified local ↔ remote,
"Remote database is up to date". **No software blockers.**

Added `npm run verify:tag-config` — a machine-checkable permanent-tag gate that exits 1 while the base
URL is not tag-safe (it rejects `*.vercel.app`, which the deployment config check accepts).

### Phase A exit criteria — met for software

- ✅ production deployment is repeatable and documented
- ✅ current docs match the actual product
- ✅ every required migration is accounted for (0001–0033 verified on the linked remote)
- ✅ critical role and tenant boundaries have automated coverage (79 executed security tests)
- ✅ public forms have shared-store abuse controls (0033 applied remotely in A6.3)
- ✅ failed uploads do not leave uncontrolled orphaned media
- ✅ email failures are diagnosable (structured, redacted outcomes)
- ✅ core golden paths pass browser E2E tests (68)
- ⚠️ public scan and form surfaces pass real-device QA — **automated engine pass done (106/110);
  the physical-device matrix is unexecuted** (`docs/REAL_DEVICE_QA.md` Part 2)
- ✅ stable-domain rules are **enforced** for production tags (the rule is enforced; the domain itself
  is an operator gate below)
- ✅ no critical or high pilot blockers remain **in software**
- ✅ accepted limitations are explicitly documented

---

## Operator-owned gates (external — these do NOT block development)

These are purchases, DNS records and provider configuration. They are **not** software defects, and
nothing here blocks continued development, preview deployments, demos, E2E testing, or controlled
internal QA.

### Gate 1 — Production domain → unblocks permanent tags + live customer pilot

Checklist: [`docs/PRODUCTION_DOMAIN_CHECKLIST.md`](docs/PRODUCTION_DOMAIN_CHECKLIST.md)

- purchase the domain (pending name clearance)
- choose the stable application hostname — tags encode it permanently
- Vercel DNS + HTTPS custom domain
- set `NEXT_PUBLIC_SITE_URL` to the final origin
- **document the path-preserving `/t/*` redirect obligation and who owns it**
- `npm run verify:tag-config` must pass (currently exits 1 by design)
- permanent QR test + physical-tag scan QA

### Gate 2 — Email / DNS → unblocks live notification delivery

Checklists: [`docs/EMAIL_CONFIGURATION_CHECKLIST.md`](docs/EMAIL_CONFIGURATION_CHECKLIST.md),
[`docs/EMAIL_DELIVERABILITY_RUNBOOK.md`](docs/EMAIL_DELIVERABILITY_RUNBOOK.md)

- Resend sending domain verified; SPF, DKIM, DMARC
- `RESEND_API_KEY` + `NOTIFICATION_FROM_EMAIL` (verified sender)
- live sender test + multi-provider inbox delivery test

Until then notification is a **UI-only** workflow — nobody may rely on an email arriving.

### Gate 3 — Physical tag production (separate workstream)

Tracked in [`docs/TAG_PRODUCTION_READINESS.md`](docs/TAG_PRODUCTION_READINESS.md): laser arrival,
material/process validation, durability, scannability, production economics. Also inherits Gate 1 — a
perfect tag is useless until the domain is stable.

---

## Phase B3 — permanent QR domain — **software gate CLOSED (2026-08-19); operator work outstanding**

Decides the canonical host and closes the *software* half of the permanent-tag gate.

**Architecture decided:**

| Role | Domain |
|---|---|
| **Canonical product + permanent QR host** | **`https://mulemark.io`** — tags encode `https://mulemark.io/t/{shortCode}` |
| Dashboard / login | same host for now; a later `app.mulemark.io` must not disturb `/t/*` |
| `www.mulemark.io` | path-preserving redirect to the apex |
| `getmulemark.com` | **reserved** marketing site — **never** a QR destination |
| `mulemark.ca` | **reserved** Canadian redirect/landing — **never** a QR destination |

Apex rather than a subdomain, so the dashboard or marketing can move later without touching printed metal.

**Software gate — closed.** The audit found the URL layer already correct: every hostname derives from
`publicEnv.siteUrl`, `buildPublicQrUrl` emits `${base}/t/${shortCode}` exactly, and the stored
`qr_links.public_url` is never trusted on read (so pre-switch rows need no migration). The tag-safety
guard is a **denylist**, so `mulemark.io` needed **no code change** — hard-coding an allowlist would have
tied tag safety to a literal and broken a future `app.mulemark.io`. Instead the behaviour is pinned by
tests, and `metadataBase` now derives canonical/OG URLs from the environment so a preview can never
advertise the production host.

**Operator work outstanding** (`docs/PRODUCTION_DOMAIN_CHECKLIST.md`): `vercel domains ls` returns **0
domains** and `mulemark.io` still serves a registrar parking page. DNS + Vercel domains + Production
`NEXT_PUBLIC_SITE_URL` + redeploy + live route verification + a real-phone scan test all remain.
The DNS step must not disturb Google Workspace MX/SPF/DKIM/DMARC or the Resend `notify` records.

**Not closed by B3:** physical tag material, marking process, durability, contrast and scannability
(`docs/TAG_PRODUCTION_READINESS.md`). **No metal-tag readiness claim is made.** Live email remains B4.

## Phase B4 — live email integration — **application DONE (2026-08-26); operator step outstanding**

Turns the verified `notify.mulemark.io` sender into something the product can safely switch on.

**Sender:** `Mulemark <notifications@notify.mulemark.io>`, Reply-To `support@mulemark.io`
(Google Workspace). Transactional only; the apex keeps Workspace MX/SPF and the two SPF records live on
different hostnames, so neither interferes with the other. DMARC stays `v=DMARC1; p=none;` — B4 does not
tighten it.

**What the audit found.** Text + HTML parts, provider-id capture, bounded retry, redacted logging and
environment-derived links were already right. Four things were not, and all four only matter once mail
is real:

1. **No Reply-To** — replies would have gone to a no-reply sending address. Now
   `NOTIFICATION_REPLY_TO_EMAIL` → `reply_to`, omitted entirely when unset.
2. **Retries could duplicate a customer's email.** The dangerous case is a timeout: the provider may
   have accepted the message we stopped waiting for. Every send now carries a deterministic
   `Idempotency-Key` (event + canonical record + hashed recipient), reused across every attempt, which
   Resend dedupes for 24 h. A submission keys on its id; a tag request keys on id + status, so
   `requested → delivered` sends and a replay of `delivered` does not.
3. **Preview stayed dry-run only because credentials were absent** — a configuration promise, not a
   guarantee. Preview now returns `dry_run` *before any credential is read*, asserted with a key
   deliberately configured.
4. **Notifications are awaited inside the renter's submission request.** Per-attempt timeouts allowed
   ~31 s of retries inside that request — enough to hit a serverless function limit and turn a
   best-effort email into a failed submission. A 15 s total wall-clock budget now bounds the whole call.

**Templates** follow transactional rules: operational subjects naming the asset code
(`New damage report — EXC-001`, `Support request — …`, `Return checklist submitted — …`,
`Tag request updated — <Organization>`), a real plain-text part, no images, tracking pixels, shorteners
or attachments, links straight to `mulemark.io`, and an explicit line saying why the recipient received
it and where to turn it off.

**Not claimed.** No live message has been sent by the application. Verdict 5 stays **NO-GO** until the
operator sets the three Production variables and redeploys, confirms the API key is sending-only and
domain-restricted with tracking off, and runs the live matrix. Outlook's first direct test landed in
Junk — recorded as an ordinary new-domain placement observation, with `docs/EMAIL_ALLOWLIST_GUIDE.md` as
the customer fallback. **Inbox placement is never guaranteed.**

**Recorded, not acted on:** the Vercel account is on **Hobby**; Pro is an operator requirement before a
paid or commercial pilot.

## Next recommended workstream

**Operator, in parallel and unblocking:** Gate 1 (domain) has the widest downstream effect — it alone
lifts the permanent-tag and live-pilot verdicts and enables a real performance re-baseline.

**Engineering, not blocked by any gate**, in priority order:

1. ~~**Give staging its own Supabase project + preview-scoped env.**~~ → **Phase B1, below.**
2. **Set the Vercel project to Node 22.x** to match the tested baseline (currently 24.x).
3. **Execute the physical-device QA matrix** (`docs/REAL_DEVICE_QA.md` Part 2) — needs hardware, not code.
4. **Fix D-1**: admin data tables overflow on phones (93 px / 183 px at 412 px).
5. **Take customer-admin profile writes off the service role** (the queued caller-aware SECURITY DEFINER
   RPC — the last P1 security item).

---

## Phase B1 — isolate the staging environment

Removes the A7 finding that a Vercel **preview** deployment reads and writes the **production** Supabase
project using the **production service-role key**. Current blast radius is demo data only (no customers
yet), so this is a planned fix — but it must land before broader preview QA, demos, or external pilot use.

### B1A — repository preparation — **DONE**

No Supabase project created, no remote migration applied, no production variable changed.

- **`scripts/lib/env-target.mjs`** — one tested module resolving which project a script may touch.
  Classification is by **project ref / host only**, never by a human-readable name; ambiguity **fails
  closed to production**; staging requires an explicitly declared `STAGING_SUPABASE_REF`; the committed
  production ref lets staging tooling refuse production **by name**; errors carry host + ref only and the
  module never accepts key material. 20 unit tests.
- **Target verifiers** — `verify:local-target`, `verify:staging-target`, `verify:production-target`.
- **CLI guard** — `scripts/check-linked-project.mjs` compares `supabase/.temp/project-ref` against a
  stated expectation and fails on mismatch. Never relinks, pushes, or runs `migration repair`.
  `db reset` is pinned to `--local`; `db reset --linked` documented as forbidden.
- **Fail-closed bootstrap** — `scripts/staging/seed-staging-qa.mjs` (prepared, **not run**): requires
  `MULEMARK_TARGET=staging`, a verified staging ref, `--confirm`, and an env-supplied password. Idempotent;
  never logs the password; never applies migrations.
- **Closed the A6.3 hole** — `scripts/qa/staging-qa-data.mjs` previously read the Supabase URL and
  service-role key with **no target check at all**. It now requires an explicit `MULEMARK_TARGET`.
- **Operator procedure** — [`docs/STAGING_ENVIRONMENT_SETUP.md`](docs/STAGING_ENVIRONMENT_SETUP.md).

### B1B — operator bootstrap — **DONE (2026-08-19)**

Staging Supabase project `kwserenxwjxozztyigmw` ("Mulemark-Staging") is live and isolated.

- **Migrations 0001–0033 applied** to staging behind the linked-project guard; `db push --dry-run` now
  reports "Remote database is up to date". Applied in order; no `migration repair`, no remote `db reset`.
- **Deterministic QA data seeded** — Northridge demo org (from `0003`/`0004`) plus two QA organizations
  (org A exports OFF, org B exports ON), four assets (public / rented / private-draft / org-B), five QR
  codes including a disabled link and a staging-only isolation probe, public + private documents, an
  active rental session, four submissions, and four QA logins (owner / admin / staff / second-org admin).
  Password login works with **no email**; the seeder is idempotent and never prints the password.
- **Preview isolation proven, not asserted.** The client bundle does not inline the Supabase URL, so the
  proof is a short-code pair: `stg-only-isolation-probe` (staging-only) **resolves** on Preview while
  production-only codes `67uqc3q7` / `eb43bf3r` do **not exist** to it. A damage report submitted through
  Preview (`SUB-2026-2E9E37`) landed in staging; production `form_submissions` stayed at 39.
- **Production unmutated** — every row count identical before and after; zero B1B QA users, zero staging
  short codes, zero B1B submissions, zero scan events created.
- **23/23 staging golden-path checks pass** (`npm run staging:verify`) across public, owner, admin, staff,
  org-B export, and cross-tenant denial.
- **Node 22.x confirmed** in the Vercel project, closing the A6.3 drift finding.

**Found and recorded, not papered over:** Speed Insights is **not collecting** — present in
`app/layout.tsx`, script route returns 200, but the browser never requests it. Verified identically on
production and preview, so it is **pre-existing, not caused by B1B**. Earlier phases called it "wired,
awaiting traffic"; that was optimistic. Operator action: enable it in the Vercel dashboard.

## Phase B2 — responsive fix + device matrix closeout — **DONE (2026-08-19)**

Closed D-1, the last open engineering item from the A6.3 device QA.

- **The recorded root cause was wrong.** A6.3 blamed the tables and recommended an `overflow-x-auto`
  wrapper; both tables already had one and it works. The page could never be dragged sideways
  (`scrollX` stays 0). The real mechanism: a wide table pushes its **min-content width into the
  document's intrinsic width** even when an ancestor clips it, so mobile Chromium **shrink-to-fits** and
  renders the page zoomed out (~66 % on the submissions inbox).
- **Two causes, and six affected routes rather than two.** Wide tables on `/dashboard/assets`,
  `/dashboard/submissions`, `/dashboard/templates`, `/owner`, `/owner/tag-requests`,
  `/owner/production` — plus a **shared primitive**, `PageHeader`, whose action row had no `flex-wrap`.
  Eight other table routes were already clean and were left alone.
- **Fix:** card list below `md`, existing compact table at `md`+, both mapping the same fetched rows.
  Desktop density untouched; bulk selection preserved through the existing context provider, with a
  mobile "Select all visible" control added since the table's lives in a `<thead>`.
- **Verified:** all 14 routes report 0 px at 360 / 390 / 430 / 768 / 1024 / 1280 via the new
  `npm run qa:overflow`; device pass **108/110, 0 failures**; staging workflow verification 23/23.
- **Tooling hardened:** QA scripts now take every input from `.env.staging.local` — no URL or secret on
  a command line, in a log, or in an approval prompt.

**Still operator-owned:** the physical-device matrix (`docs/REAL_DEVICE_QA.md` Part 2) remains
unexecuted — camera QR scan, real weak signal, iOS Safari and desktop Safari need hardware.

### Unchanged by Phase B1

The permanent QR domain remains deferred to **B3**; Resend/live email remains dry-run until **B4**.

---

## Phase B - Commercial readiness

- CIPO, USPTO, common-law, domain, and social-handle clearance
- final production domain and continuity story
- pricing and package decisions
- first-year versus renewal pricing
- monthly versus annual terms
- tag allowance and replacement pricing
- onboarding scope and multi-yard rules
- full unit-economics model
- sales deck, one-page overview, pilot package, buyer FAQ, pricing sheet, agreement, onboarding checklist, case-study template, and PNW prospect list
- credible Mulemark landing page

---

## Phase C - Physical product readiness

- anodized aluminum, Cerakote, stainless, and interim supplier testing
- QR size, contrast, quiet zone, scan angle, and damage tolerance
- UV, rain, freeze/thaw, mud, grease, fuel, hydraulic fluid, abrasion, pressure washing, and temperature cycling
- adhesive, rivet, screw, curved-surface, trailer, heavy-equipment, and portable-tool mounting
- production traveler, first article, scan QA, serialization, scrap tracking, packaging, replacement traceability, warranty, and first-batch acceptance criteria

---

## Phase D - Controlled pilots

- two or three carefully selected yards
- defined sponsor, asset scope, users, and success measures
- real tags and real operational use
- regular check-ins and end-of-pilot conversion review
- metrics for onboarding, scans, valuable actions, submissions, return checklists, outbound baselines, staff returns, acknowledgements, photo evidence, response time, repeated problems, storage, delivery, objections, and renewal intent
- case study, pricing evidence, workflow evidence, and post-pilot roadmap

---

## Phase E - Post-pilot development

Build only what repeated pilot evidence justifies.

- operations-grade value reporting
- storage and media lifecycle enforcement
- organization-customized checklist templates
- finer staff permissions
- multi-yard/location support
- multiple notification recipients
- SMS and delivery history
- API, webhooks, and rental-system integrations
- offline/PWA support
- in-app scanner
- automated billing
- custom domains/subdomains
- localization, French, units, and timezone settings
- complete offboarding package with media
- customer-facing rental-session history where justified

---

# Trigger-based backlog

| Item | Build trigger | Current disposition |
|---|---|---|
| Storage quotas and archival | Before storage cost becomes material or before broad photo rollout | High priority after Phase A |
| Multi-recipient notifications | First pilot needs different operations/service recipients | Deferred |
| SMS | Email proves too slow for urgent damage or support | Deferred |
| Notification center | Event volume makes email/log review insufficient | Deferred |
| Out-of-service/hold state | A pilot needs to block damaged equipment from rental | Deferred, likely early |
| Checklist customization | Two or more customers need materially different checks | Deferred |
| Fine-grained staff permissions | Customer has counter, yard, service, and manager role separation | Deferred |
| Multi-yard/location | First serious multi-location prospect | Deferred |
| API/webhooks | Integration need repeats across prospects | Deferred |
| RMS integration | A paid customer makes it a buying condition | Deferred |
| Offline/PWA | Poor coverage causes failed or abandoned field workflows | Deferred |
| In-app scanner | Staff repeatedly need batch or in-app scanning | Deferred |
| SSG/ISR | Scan cost or performance justifies rendering-model work | Deferred |
| Video evidence | Photos repeatedly prove inadequate | Deferred |
| Customer self-service actions | Pickup, extension, or accessory requests show clear demand | Deferred |
| Complete offboarding package | Enterprise continuity or churn concern requires media export | Deferred |
| Automated billing | Manual invoicing becomes an operating burden | Deferred |
| Custom domains | Larger customer requires stronger white-labeling | Deferred |
| Internationalization | First committed French/non-English customer | Deferred |
| Split-view submissions inbox | Real volume makes page-by-page triage too slow | Deferred |
| SLA timers/assignment | Multiple operators need ownership and escalation | Deferred |
| Physical-tag QA | Before first paid physical deployment | Phase C blocker |
| Trademark clearance | Before large tag or marketing spend | Phase B blocker |

---

# Small items to verify during Phase A

- no visible AssetTag QR references remain
- Mulemark metadata, email, print, and production output are consistent
- owner Organizations page shows unviewed tag-request status
- customer export fails closed
- staff cannot access admin configuration by direct URL
- list filters survive detail round trips
- category defaults and explicit template assignments still work
- duplicate outbound baselines are blocked
- acknowledgements attach to the correct rental session
- archived submissions leave active counts
- submission counters update without manual refresh
- production selects the production-primary QR link
- deactivated QR links retain history
- public forms do not expose database errors
- timelines and rental-session browsers remain bounded and paginated
- no automatic refresh loops remain
- sign out works for every role

---

# Current non-goals

- full rental booking and reservation system
- invoicing and payment processing
- dispatch management
- general-purpose CMMS
- full work-order scheduling
- GPS and telematics
- native mobile app
- blank-canvas form builder
- e-signature or rental contracts
- automated fault attribution
- automated damage billing
- AI damage determination
- template marketplace
- unlimited video storage

---

# Roadmap maintenance rules

- Update this file after every completed phase.
- Record completed work without deleting the history of why it was prioritized.
- Move a deferred item into an active phase only when its trigger has been met.
- Keep accepted pilot limitations separate from defects.
- Real pilot evidence takes precedence over speculative roadmap work.
