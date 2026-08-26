# Phase A Pilot Readiness — Mulemark

**Phase A7 closeout.** Branch `pilot-credibility` @ `f8a662c` (assessed) — see "Commit assessed" below.

Readiness is **not one number**. The software is in a very different state from the domain, the email
sender, and the physical tag process, and blending them into a single verdict would either wrongly halt
development or wrongly authorise permanent tags. This document gives **six independent verdicts**, each
with its own evidence and its own unblock condition.

Vocabulary: **GO** — cleared. **CONDITIONAL GO** — cleared only with the stated conditions honoured.
**NO-GO** — not cleared; a named gate is unmet. **NOT YET ASSESSED** — no evidence gathered; not a
judgement.

---

## Verdicts at a glance

| # | Readiness | Verdict | Blocked by |
|---|---|---|---|
| 1 | Development | **GO** | — |
| 2 | Controlled staging / demo | **GO** | — |
| 3 | Software-only limited pilot | **CONDITIONAL GO** | 4 conditions below (all operator-side) |
| 4 | Permanent-tag live customer pilot | **NO-GO** (narrowed) | domain decided + software gate closed in B3; awaiting DNS/Vercel, live verification, and physical scan QA |
| 5 | Live notification delivery | **NO-GO** (narrowed to one operator step) | application hardened + verified in B4; awaiting the three Production variables + redeploy + the live test |
| 6 | Physical production | **NOT YET ASSESSED** | laser not arrived; no material/durability/scan/economics data |

**There are no software blockers.** Every NO-GO is an external operator gate.

---

## 1. Development readiness — **GO**

The codebase is healthy and safe to keep building on, independently of the domain and email deferrals.

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | **136 files / 1087 tests passed** |
| `npm run build` | `✓ Compiled successfully in 9.3s`, exit 0 |
| `npm run test:security` | **8 files / 79 tests passed** |
| `npm run test:e2e:smoke` | **12 passed** |
| `npm run test:e2e` (full) | **68 passed** |
| `npm run verify:production-config` | `0 fail, 2 warn, 6 pass` |

Repository + database state:

- Branch `pilot-credibility`, working tree clean at assessment, 13 Phase A commits.
- `supabase migration list` — **0001–0033 matched local ↔ remote**, no unmatched versions.
- `supabase db push --dry-run` — **"Remote database is up to date."** No pending migration.
- No tracked secret: 0 JWT/private-key literals in tracked files; no tracked `.env`.
- Node aligned: `.nvmrc` = 22, `engines.node` = `22.x`, and `ci` / `e2e` / `security` workflows all on
  `node-version: 22`. Secret scanning runs gitleaks in `ci.yml`.

The two `verify:production-config` warnings are **the deferrals themselves**, correctly reported as
warnings locally rather than failures: `site-url` (localhost in this shell) and `sender`
(`NOTIFICATION_FROM_EMAIL` unset → dry-run email). Neither is a code defect.

~~**Known non-blocking drift:** Vercel builds on Node 24.x.~~ **Resolved in B1B** — the Vercel project is now **22.x**.

---

## 2. Controlled staging / demo readiness — **GO**

A test-only Vercel URL is sufficient and is working.

| Evidence | Result |
|---|---|
| Staging deployment | `https://qr-asset-tags-czvqz3pth-jdapaetz2-s-projects.vercel.app` (preview, commit `b7884a4`) |
| Labelled test-only | yes — `STAGING_DEPLOYMENT_RUNBOOK.md` header: "TEST-ONLY URL — NEVER PRINT ON A PHYSICAL TAG" |
| Speed Insights | **CORRECTED (B1B): not collecting.** Present in `app/layout.tsx`, but the browser never requests the script — verified identically on production and preview. Operator must enable it in the Vercel dashboard. |
| QA environment values | **B1B: Supabase `kwserenxwjxozztyigmw` (dedicated staging)**, `VERCEL_ENV=preview`, staging-specific `SCAN_IP_HASH_SALT` |
| Dry-run notifications | `RESEND_*` unset on the project → dry-run by configuration |
| Permanent artifacts produced | **none** — durable-output routes returned `307 → /login` for anonymous callers, and the base-URL guard refuses `*.vercel.app` |
| Smoke tests | 12 passed; full E2E 68 passed |
| Device QA on staging | 110 checks, **106 pass** (`REAL_DEVICE_QA.md`) |

**Conditions that remain true for staging use:** the bypass token should be revoked between sessions.
~~The staging Supabase is shared with production.~~ **Resolved in B1B** — staging runs on its own
project; Preview no longer holds production credentials. Isolation is proven, not assumed
(`docs/STAGING_ENVIRONMENT_SETUP.md`).

---

## 3. Software-only limited pilot readiness — **CONDITIONAL GO**

A customer could use the product today on a temporary URL, *if* all four conditions hold. This is a real
"yes, with conditions", not a soft no.

**Conditions (all operator-side, all must hold):**

1. **The customer is told, in writing, that the URL is temporary** and will change when the final domain
   is chosen. No commitment may depend on URL stability.
2. **No permanent physical tags are produced.** Paper/temporary labels only. Verdict 4 is NO-GO.
3. **Email is dry-run**, so notifications must be replaced by a documented manual process (the admin
   checks the inbox UI; nobody relies on an email arriving). The application is ready as of B4 — what is
   missing is the Production environment step in `EMAIL_CONFIGURATION_CHECKLIST.md` §4 and the live test.
4. **QA/pilot data is isolated** from other tenants. ~~The operator accepts that staging shares
   production's Supabase project.~~ **Resolved in B1B** — staging is now a separate project.

**Supporting evidence — P0/P1 software blockers are closed:**

| Item | State |
|---|---|
| Migrations applied on the target project | ✅ 0001–0033 verified |
| Role separation enforced at the DB | ✅ migration 0032 + admin guards (A3.1) |
| Live RLS / storage / RPC boundaries | ✅ 79 executed tests (A3.2) |
| Shared-store rate limiting on public writes | ✅ migration 0033 applied remotely in A6.3 |
| Orphaned-media cleanup | ✅ A4 |
| Notification reliability + redacted logging | ✅ A5 (delivery still deferred) |
| Browser golden paths + role boundaries | ✅ 68 E2E tests (A6.2) |
| Real-device QA | ⚠️ automated pass done; **physical-device matrix not executed** |

**Residual risks the customer inherits** (documented, accepted, not blockers): admin data tables overflow
horizontally on phones (D-1, S3); the 30 s inbox auto-refresh re-prefetches row links (D-3, S3);
customer-admin profile writes still use the service role (P1, deferred to its own migration).

---

## 4. Permanent-tag live customer pilot readiness — **NO-GO** (blocker narrowed)

**Update (B3).** The canonical host is decided — **`https://mulemark.io`** — and the *software* half of
this gate is closed: the tag-safety guard is a denylist, so the real domain needs no code change; path
preservation (`/t/{shortCode}` exactly), the `*.vercel.app` block and the localhost block are pinned by
tests; and canonical metadata is derived from the environment rather than hard-coded.
`getmulemark.com` and `mulemark.ca` are reserved and documented as never being QR destinations.

**Why this is still NO-GO:** none of the external work has happened. `vercel domains ls` returns **0
domains** and `mulemark.io` still serves a registrar parking page. Until DNS, the Vercel domains, the
Production `NEXT_PUBLIC_SITE_URL`, and the redeploy are done, `verify:tag-config` continues to fail by
design — and a real-phone scan test has not been run.

Not cleared, and the software refuses to pretend otherwise.

**The gate, executed:**

```
$ npm run verify:tag-config
Permanent-tag configuration gate

  BLOCKED  NEXT_PUBLIC_SITE_URL (http://localhost:3000) must use https.

  Permanent tag production: NOT CLEARED.
  This is an expected DEFERRED OPERATOR GATE, not a code defect
EXIT=1
```

The staging URL is refused too — which is the important case, because it *passes* the deployment config
check:

```
  BLOCKED  NEXT_PUBLIC_SITE_URL (https://qr-asset-tags-...vercel.app)
           is a Vercel preview/deploy host (disposable — tags made from it would break).
EXIT=1
```

**Unmet conditions** (all in `PRODUCTION_DOMAIN_CHECKLIST.md`):

| # | Condition | State |
|---|---|---|
| 1 | Stable production domain exists | 🟡 **decided (B3): `mulemark.io`** — owned, but not yet connected to Vercel |
| 2 | `npm run verify:tag-config` passes | ⬜ **exits 1 by design** |
| 3 | Path-preserving `/t/*` redirect obligation documented + owned | 🟡 **documented (B3)** in `QR_DOMAIN_STRATEGY.md` + `PRODUCTION_DOMAIN_CHECKLIST.md`; owner still to be named |
| 4 | Physical QR scan tests pass on real phones | ⬜ not run |

**Defence in depth already in place:** durable-output routes are auth-gated (307 for anonymous) *and*
base-URL-guarded (`lib/qr/output-guard.ts`), the `*.vercel.app` rule is unit-tested
(`lib/qr/production.test.ts:33`), and short codes are domain-independent (`lib/qr/url.ts` computes from
`NEXT_PUBLIC_SITE_URL`), so a later domain change needs no data migration.

**This is not a software defect.** The code is ready for a domain; the domain does not exist yet.

---

## 5. Live notification readiness — **NO-GO** (one operator step away)

**Update (B4).** The application half is now done and tested. The provider half was already verified in
B1B: sending domain `notify.mulemark.io`, DKIM + SPF TXT + return-path MX verified, root DMARC `p=none`,
a sending-only API key restricted to that domain, and an operator-attested direct provider test that
reached Gmail and Outlook.

DNS re-verified independently in B4, read-only against 8.8.8.8:

| Record | Host | Value |
|---|---|---|
| MX | `mulemark.io` | `smtp.google.com` — Google Workspace intact |
| SPF | `mulemark.io` | `v=spf1 include:_spf.google.com ~all` — one record, Google only |
| DMARC | `_dmarc.mulemark.io` | `v=DMARC1; p=none;` — exactly one policy, no stray TXT |
| SPF | `send.notify.mulemark.io` | `v=spf1 include:amazonses.com ~all` — its own hostname |
| MX | `send.notify.mulemark.io` | `feedback-smtp.us-east-1.amazonses.com` |
| DKIM | `resend._domainkey.notify.mulemark.io` | published |

**Why this is still NO-GO:** `vercel env ls production` shows neither `RESEND_API_KEY` nor
`NOTIFICATION_FROM_EMAIL`. The running product sends nothing, so **no live message has ever left the
application**. Live deliverability through the app is not claimed.

**Closed in B4 (code, with tests):**

| Gate | Evidence |
|---|---|
| Reply-To support | `NOTIFICATION_REPLY_TO_EMAIL` → `reply_to`; omitted entirely when unset |
| Duplicate protection | deterministic `Idempotency-Key`, reused across every retry (`lib/notifications/idempotency.ts`) |
| Preview cannot send | enforced in `lib/notifications/send.ts` **before** any credential is read — asserted with a key deliberately configured |
| Submissions stay non-blocking | 15 s total wall-clock budget, not just per-attempt timeouts |
| Transactional templates | operational subjects, plain-text part, no images/tracking/shorteners, explicit reason line |
| Redacted logging | no full recipient, body, media URL, key or raw IP — re-asserted with every field populated |
| Unit coverage | **93 notification tests** (was 42) |

**Remaining conditions:**

| # | Condition | State |
|---|---|---|
| 1 | Resend sending domain verified | ✅ |
| 2 | SPF configured | ✅ |
| 3 | DKIM configured | ✅ |
| 4 | DMARC configured (`p=none`) | ✅ |
| 5 | API key confirmed sending-only + domain-restricted | ⬜ **operator to confirm in the dashboard** |
| 6 | Open/click tracking off | ⬜ **operator to confirm — a provider setting code cannot assert** |
| 7 | Production `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` / `NOTIFICATION_REPLY_TO_EMAIL` + redeploy | ⬜ |
| 8 | Live send through the application | ⬜ never run |
| 9 | Multi-provider placement test with the real template | ⬜ never run |

**Verdict rule for when 7–9 are done** (agreed in the B4 brief, recorded so it is not re-litigated
later): authentication failure → **NO-GO**. Rejected/bounced mail → **NO-GO** until diagnosed. Gmail
inbox + Outlook junk with all authentication passing → **CONDITIONAL GO**, with monitoring and
`EMAIL_ALLOWLIST_GUIDE.md`. Consistent inbox delivery across tested providers → **GO**. **Guaranteed
inbox placement is never claimed**, at any verdict.

Until 7–9 are met, notification remains a UI-only workflow: the admin sees submissions in the inbox, and
any external alerting is manual.

Known measurement gap (unchanged): the staging runtime `[notifications]` log line was **not** captured —
the `vercel logs` CLI returns a bounded snapshot. Dry-run rests on configuration + unit coverage, not on
a first-hand staging log.

---

## 6. Physical production readiness — **NOT YET ASSESSED**

Deliberately not a NO-GO: no evidence has been gathered either way, so a judgement would be invented.
This is a separate workstream from software readiness and is tracked in
`TAG_PRODUCTION_READINESS.md`.

| Dependency | State |
|---|---|
| Laser arrival | ⬜ pending |
| Material + marking process validation | ⬜ not started |
| Durability testing (weather, abrasion, chemicals, UV) | ⬜ not started |
| Scannability (size, contrast, quiet zone, angle, damage tolerance) | ⬜ not started |
| Production economics (unit cost, batch, yield) | ⬜ not started |
| First-article / serialization / scan QA process | ⬜ not started |

It also inherits Verdict 4: even a perfect tag is useless until the domain is stable.

---

## Golden-path evidence (Part G)

Sources: **A6.2** = 68 Playwright tests against a local stack; **A6.3** = 110 emulated-device checks
against staging (WebKit, Chromium, desktop Chrome, desktop Edge).

### Public / renter

| Path | Evidence | Result |
|---|---|---|
| Scan page | A6.2 `public/scan.spec.ts`; A6.3 all 4 profiles | ✅ |
| Unavailable tag (disabled / missing) | A6.2 — HTTP 200, reason not disclosed | ✅ |
| Damage form | A6.2 + A6.3 (incl. keyboard, photo picker) | ✅ |
| Support form | A6.2 + A6.3 | ✅ |
| Renter return checklist | A6.2 3-stage + omission dialog; A6.3 stages 1→2→review | ✅ |
| Acknowledgement | A6.2 (delay, transient dismiss, suppression, staff-never); A6.3 all profiles | ✅ |
| Success reference (`SUB-YYYY-XXXXXX`) | A6.2 + A6.3 | ✅ |

### Customer admin

| Path | Evidence | Result |
|---|---|---|
| Dashboard + active nav | A6.2 `admin/dashboard-assets.spec.ts` | ✅ |
| Assets (search / filter / returnTo) | A6.2 + A6.3 | ✅ |
| Submissions (status transitions) | A6.2 `admin/submissions.spec.ts` | ✅ |
| Rentals + session evidence | A6.2 `admin/rentals-evidence.spec.ts` (5 disclosures, print, acks, RNT search) | ✅ |
| Bulk triage | A6.2 + A6.3 toolbar | ✅ |
| Export disabled → redirect | A6.2 + A6.3 (all 4 profiles) | ✅ |
| Export enabled → CSV | A6.2 (org B) | ✅ |
| Settings / users | A6.2 `admin/settings-branding.spec.ts` | ✅ |

### Customer staff

| Path | Evidence | Result |
|---|---|---|
| Role navigation (no Settings; 6 admin routes 302) | A6.2 `staff/nav-denial.spec.ts` | ✅ |
| Outbound (available → creates session) | A6.2 verified by service-role read | ✅ |
| Outbound on active session (attach) | A6.2 — same session, `started_at` unchanged | ✅ |
| Outbound blocked (baseline exists) | A6.2 | ✅ |
| Staff return checklist | A6.2 — session `returned`, pointer null | ✅ |
| Evidence | A6.3 reachable on all profiles | ✅ |
| Sign out | A6.1 smoke | ✅ |

### Platform owner

| Path | Evidence | Result |
|---|---|---|
| Organizations list + subnav | A6.2 `owner/orgs-export.spec.ts` | ✅ |
| QR governance (create alias) | A6.2 `owner/qr-and-access.spec.ts` | ✅ |
| Production safeguards | A6.3 — 307 auth gate + `*.vercel.app` refusal | ✅ |
| Tag requests | A6.2 | ✅ |
| Export toggle | A6.2 | ✅ |
| Owner export always available | A6.2 — 200 CSV | ✅ |

**Named gaps** — not claimed as covered: the **physical-device matrix** (`REAL_DEVICE_QA.md` Part 2) is
unexecuted; the owner **disabled-primary QR guard** is unit-tested but not driven end-to-end; live email
is never asserted; Chromium/WebKit only, no visual regression.

---

## Security + tenant isolation (Part C)

All from the executed suite (`npm run test:security`, 79 tests, real Postgres/Auth/Storage):

| Control | Result |
|---|---|
| Owner / admin / staff / anonymous role boundaries | ✅ |
| Cross-tenant IDs (org A ↔ org B) | ✅ denied via RLS, verified in browser too (A6.2) |
| Export gating (master + per-type flags, admin-only) | ✅ |
| Service-role use | ✅ 4 importers, all allowlisted + server-only |
| Storage policies (submissions / documents / public-assets) | ✅ |
| Signed media URLs | ✅ |
| Public insert-only (`form_submissions`, `scan_events`) | ✅ |
| Shared rate limit | ✅ `rate_limit_counters` + `rate_limit_touch`, service_role-only grants |
| No raw IP | ✅ `scan_events.ip_hash` salted hash only (observed `bcdffea8ac41…`) |
| Secret scanning | ✅ gitleaks in `ci.yml`; 0 tracked secrets |

---

## Accepted limitations carried into any pilot

Full list in [`PILOT_LIMITATIONS.md`](PILOT_LIMITATIONS.md). The ones a pilot customer would actually
notice or inherit:

1. ~~**Staging shares production's Supabase project and service-role key.**~~ **Resolved in Phase B1B** —
   staging runs on its own project (`kwserenxwjxozztyigmw`) with Preview-scoped Vercel variables;
   isolation proven by short-code pair + live write test (`docs/STAGING_ENVIRONMENT_SETUP.md`).
2. **Performance figures are a staging lab baseline**, not field data — 5 samples, one machine, one
   network (`PERFORMANCE_BASELINE.md`).
3. **Admin tables overflow on phones** — 93 px (assets) / 183 px (submissions) at 412 px.
4. **Customer-admin profile writes still use the service role** — narrowed, not eliminated.
5. **`public-assets` cover images are public by URL** regardless of asset status.
6. **Timezone fixed to `America/Vancouver`** for analytics buckets.

---

## Commit assessed

| | |
|---|---|
| Branch | `pilot-credibility` |
| Commit assessed | `f8a662c` — *test(qa): record staging device and performance baseline* |
| Gates re-run at | Phase A7 |
| Verdict-bearing artifacts | this file, `PRODUCTION_DOMAIN_CHECKLIST.md`, `REAL_DEVICE_QA.md`, `PERFORMANCE_BASELINE.md`, `STAGING_DEPLOYMENT_RUNBOOK.md`, `MIGRATION_LEDGER.md` |

A7 itself adds only assessment artifacts and one verification gate — **no product code changed.**

## Re-assessment triggers

Re-run this closeout when any of these change: the domain is configured; Resend/DNS is configured; the
physical-device matrix is executed; the laser arrives; staging gets its own Supabase project; or any P0/P1
in `PILOT_LIMITATIONS.md` moves.
