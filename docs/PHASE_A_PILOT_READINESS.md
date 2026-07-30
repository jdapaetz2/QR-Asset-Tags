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
| 4 | Permanent-tag live customer pilot | **NO-GO** | no stable domain; tag-config gate fails by design |
| 5 | Live notification delivery | **NO-GO** | no Resend domain / SPF / DKIM / DMARC / verified sender |
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

**Known non-blocking drift:** the Vercel project builds on **Node 24.x** while the tested baseline is 22.
Set it to 22.x before any production deploy.

---

## 2. Controlled staging / demo readiness — **GO**

A test-only Vercel URL is sufficient and is working.

| Evidence | Result |
|---|---|
| Staging deployment | `https://qr-asset-tags-czvqz3pth-jdapaetz2-s-projects.vercel.app` (preview, commit `b7884a4`) |
| Labelled test-only | yes — `STAGING_DEPLOYMENT_RUNBOOK.md` header: "TEST-ONLY URL — NEVER PRINT ON A PHYSICAL TAG" |
| Speed Insights | wired (`app/layout.tsx`); no field data yet (needs real traffic) |
| QA environment values | Supabase `apeiswnkheiwrpvumder`, `VERCEL_ENV=preview`, `SCAN_IP_HASH_SALT` set |
| Dry-run notifications | `RESEND_*` unset on the project → dry-run by configuration |
| Permanent artifacts produced | **none** — durable-output routes returned `307 → /login` for anonymous callers, and the base-URL guard refuses `*.vercel.app` |
| Smoke tests | 12 passed; full E2E 68 passed |
| Device QA on staging | 110 checks, **106 pass** (`REAL_DEVICE_QA.md`) |

**Conditions that remain true for staging use:** QA data must stay inside a disposable, labelled org
(`npm run qa:staging:data`), the bypass token should be revoked between sessions, and the staging
Supabase is **shared with production** — see limitation below.

---

## 3. Software-only limited pilot readiness — **CONDITIONAL GO**

A customer could use the product today on a temporary URL, *if* all four conditions hold. This is a real
"yes, with conditions", not a soft no.

**Conditions (all operator-side, all must hold):**

1. **The customer is told, in writing, that the URL is temporary** and will change when the final domain
   is chosen. No commitment may depend on URL stability.
2. **No permanent physical tags are produced.** Paper/temporary labels only. Verdict 4 is NO-GO.
3. **Email is dry-run**, so notifications must be replaced by a documented manual process (the admin
   checks the inbox UI; nobody relies on an email arriving). See `EMAIL_CONFIGURATION_CHECKLIST.md`.
4. **QA/pilot data is isolated** from other tenants, and the operator accepts that staging currently
   shares production's Supabase project.

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

## 4. Permanent-tag live customer pilot readiness — **NO-GO**

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
| 1 | Stable production domain exists | ⬜ deferred by operator decision |
| 2 | `npm run verify:tag-config` passes | ⬜ **exits 1 by design** |
| 3 | Path-preserving `/t/*` redirect obligation documented + owned | ⬜ not recorded |
| 4 | Physical QR scan tests pass on real phones | ⬜ not run |

**Defence in depth already in place:** durable-output routes are auth-gated (307 for anonymous) *and*
base-URL-guarded (`lib/qr/output-guard.ts`), the `*.vercel.app` rule is unit-tested
(`lib/qr/production.test.ts:33`), and short codes are domain-independent (`lib/qr/url.ts` computes from
`NEXT_PUBLIC_SITE_URL`), so a later domain change needs no data migration.

**This is not a software defect.** The code is ready for a domain; the domain does not exist yet.

---

## 5. Live notification readiness — **NO-GO**

Dry-run behaviour is verified. **Live deliverability is not claimed and has never been tested.**

**Verified now (dry-run):**

| Check | Evidence |
|---|---|
| Provider unconfigured | `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` absent from the Vercel project |
| Submissions never blocked | 24 QA submissions persisted on staging; every renter saw a success page + reference |
| Outcome is explicit | `logNotificationEvent` emits `"outcome":"dry_run"` (`lib/notifications/log.test.ts:42`) |
| `dry_run` ≠ delivered | asserted in `lib/notifications/outcome.test.ts:21` |
| Redacted logging | no full recipient/body/secret/IP in the log line (A5) |
| Unit coverage | 42 notification tests pass |

**Unmet conditions** (`EMAIL_CONFIGURATION_CHECKLIST.md` / `EMAIL_DELIVERABILITY_RUNBOOK.md`):

| # | Condition | State |
|---|---|---|
| 1 | Resend sending domain verified | ⬜ deferred |
| 2 | SPF configured | ⬜ deferred |
| 3 | DKIM configured | ⬜ deferred |
| 4 | DMARC configured | ⬜ deferred |
| 5 | `RESEND_API_KEY` set | ⬜ deferred |
| 6 | `NOTIFICATION_FROM_EMAIL` a verified sender | ⬜ deferred |
| 7 | Live sender test | ⬜ never run |
| 8 | Multi-provider inbox delivery test | ⬜ never run |

**No one may rely on an email arriving.** Until conditions 1–8 are met, notification is a UI-only
workflow: the admin sees submissions in the inbox, and any external alerting is manual.

Known measurement gap: the staging runtime `[notifications]` log line was **not** captured (the
`vercel logs` CLI returns a bounded snapshot). Dry-run rests on configuration + unit coverage, not on a
first-hand staging log.

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

1. **Staging shares production's Supabase project and service-role key** (Vercel scopes every var
   `Production, Preview`). Give staging its own project before a paid pilot.
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
