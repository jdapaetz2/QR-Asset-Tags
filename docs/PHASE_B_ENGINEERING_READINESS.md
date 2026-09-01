# Phase B Engineering Readiness — Mulemark

**Phase B6 closeout, 2026-08-31.** Branch `pilot-credibility` @ `dc260cc` (assessed), clean working tree.

Readiness is **not one number**. The software, the domain, the email sender and the physical tag process
are in genuinely different states, and a single blended verdict would either wrongly halt development or
wrongly authorise permanent metal. Six independent verdicts follow, each with its own evidence and its
own unblock condition.

Vocabulary: **GO** — cleared. **CONDITIONAL GO** — cleared only with the stated conditions honoured.
**NO-GO** — a named gate is unmet. **NOT YET ASSESSED** — no evidence gathered; not a judgement.

---

## Verdicts at a glance

| # | Readiness | Verdict | Blocked by |
|---|---|---|---|
| 1 | Continued development | **GO** | — |
| 2 | Controlled staging / demo | **GO** | — |
| 3 | Software-only limited pilot | **CONDITIONAL GO** | 4 conditions, all operator-side |
| 4 | Permanent-tag live pilot | **NO-GO** | physical scan QA + a named redirect owner |
| 5 | Live notification | **CONDITIONAL GO** | replay unproven against the live provider; cold placement unmeasured |
| 6 | Physical production | **NOT YET ASSESSED** | no material/durability/scan/economics data exists |

**Every remaining blocker is external or physical. There is no software blocker hidden as an external
gate** — the one item that could have been (the permanent-tag configuration check) is now an executed,
passing gate rather than an assertion.

---

## Part A — repository and gates

Branch `pilot-credibility`, working tree clean, 12 Phase B commits (`342ae87` → `dc260cc`).

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | **139 files / 1184 tests passed** |
| `npm run build` | compiled successfully, exit 0 |
| `npm run test:security` | **8 files / 79 tests passed** (fresh local stack, migrations 0001–0033 applied) |
| `npm run test:e2e` (full) | **68 passed** |
| `npm run smoke:staging` | **28 checks — 27 pass, 0 fail, 1 skip** |
| `npm run smoke:production` | **14 checks — 13 pass, 0 fail, 1 skip** |
| `npm run verify:production-config` | `0 fail, 3 warn, 5 pass` |
| `npm run verify:tag-config:production` | **PASS** — `https://mulemark.io` is a tag-safe production origin |
| `npm run verify:tag-config` (local) | exits 1 — **correct**, the unset local value must be refused |
| gitleaks 8.18.4 (`--redact --verbose`) | 158 commits, **no leaks** |
| Node | 22 — `.nvmrc` + `engines` agree; Vercel project on 22.x |

The three `verify:production-config` warnings are the local shell's unset `NEXT_PUBLIC_SITE_URL`,
`SCAN_IP_HASH_SALT` and `NOTIFICATION_FROM_EMAIL`. All three are correct locally and none is a defect.

**Migrations — stated honestly.** Local files are contiguous 0001–0033 (checked by the config verifier),
and `test:security` proves they apply cleanly to a fresh database. **Remote applied state on production
and staging was operator-verified in A7 and B1B and was NOT re-verified in B6** — doing so needs a
database password and a Supabase CLI relink, both of which this phase was told not to perform. Treat the
remote state as operator-attested, not freshly measured.

---

## Part B — environment isolation — **GO**

| Claim | Evidence |
|---|---|
| Local uses local | `playwright.config.ts` binds `baseURL` to loopback and pulls credentials from `supabase status` via `getStackConfig`, which **refuses a non-loopback host** |
| Preview uses staging | `vercel env ls preview` — Preview-scoped `NEXT_PUBLIC_SUPABASE_URL` (project `kwserenxwjxozztyigmw`) |
| Production uses production | `vercel env ls production` — Production-scoped, project `apeiswnkheiwrpvumder` |
| Preview holds no production service-role key | `vercel env ls preview` — `SUPABASE_SERVICE_ROLE_KEY` is Preview-scoped only |
| Staging holds no production key | same listing; the two scopes share no credential |
| QA data isolated | seeded QA orgs only; `stg-only-isolation-probe` exists solely in staging |
| Target guards pass | `verify:staging-target`, `verify:production-target`, plus `assertSmokeTarget` in both runners |
| Production not contaminated | production **does not resolve** the staging-only probe — asserted on every production smoke run |

Isolation is now proven **behaviourally, in both directions, on every run**: staging must resolve the
staging-only short code and production must not. A configuration listing shows intent; this shows which
database each deployment is actually reading. Crossover is additionally refused *before the first
request*, re-proven by hand in both directions during B6.

Live email adds a third boundary: `lib/notifications/send.ts` returns `dry_run` for `VERCEL_ENV=preview`
**before reading any credential**, so a key added to Preview by mistake is inert. Observed first-hand in
B4 with a recipient configured (`reason":"preview_environment"`, `attempts: 0`, `providerId: null`).

---

## Part C — device and responsive — **CONDITIONAL GO**

**D-1 is closed.** Admin tables no longer overflow at phone widths. The B2 root cause was recorded
correctly only after being measured: `overflow-x-auto` was already present, and the real cause was the
table's **min-content width propagating into the document's intrinsic width**, which makes mobile
Chromium zoom out rather than scroll. Fixed by a responsive card presentation below `md` (`ListCard`),
plus `min-w-0` on the page header and tightened cell padding on the one table that still overflowed at
`lg`.

**The automated matrix is complete: 110/110** (`npm run qa:staging:devices`), across WebKit
(iPhone-class), Chromium (Android-class), desktop Chrome and real Edge. That includes the mobile
select-all control added in B2 when two `N/A` results turned out to be a genuine gap, not a fixture
artefact.

**The physical matrix is NOT complete, and is not claimed to be.** `REAL_DEVICE_QA.md` Part 2 is
deliberately blank: camera QR scan, real weak signal, iOS Safari and desktop Safari can only be answered
on hardware. Emulation reproduces viewport, DPR, touch flags, user agent and CPU throttling — not a
handset. **Filling those rows from the automated pass would be the single easiest way to fake device
readiness, and it has not been done.**

**No page-level horizontal overflow** — asserted on every staging smoke run and across all 110 automated
checks. **Critical mobile actions accessible** — sticky actions, photo picker, keyboard entry and bulk
selection all pass on both mobile profiles.

**Performance regression: absent, and measured rather than assumed.** A B6 re-run of
`npm run qa:staging:vitals` shows every route faster than the A6.3 baseline in both device classes, with
the admin routes B2 touched improving most (mobile dashboard LCP 2860 → 1128 ms; assets 2552 → 1096 ms).
CLS remained 0.000 throughout. The improvement is **not** attributed to code — the deployment, the
Supabase project (B1B separation) and the machine all changed between runs. The supportable claim is the
negative one: nothing regressed. Full comparison in `PERFORMANCE_BASELINE.md`.

B6 also fixed the vitals runner, which had been silently skipping every authenticated route for want of
an env-var name — meaning the routes most likely to regress were the ones never measured.

**Condition to reach GO:** execute `REAL_DEVICE_QA.md` Part 2 on real hardware.

---

## Part D — permanent domain — **software gate CLOSED; verdict 4 still NO-GO**

B3 completed, and the operator work behind it is done.

| Check | Result |
|---|---|
| `mulemark.io` active | ✅ serves 200 |
| HTTPS | ✅ certificate valid |
| Tag config passes | ✅ **executed**: `verify:tag-config:production` → tag-safe production origin |
| `/t/*` preserved | ✅ `buildPublicQrUrl` emits `${base}/t/${shortCode}` exactly, pinned by tests; `www` → apex verified **308 with the path intact** |
| Staging remains separate | ✅ Preview keeps its own site URL; the staging-only probe does not resolve on production |
| Disposable QR scan passes | ✅ artwork generated for three codes encodes exactly `https://mulemark.io/t/<code>` with no `vercel.app`/`localhost` host |

Until B6 the configuration gate had only ever been *asserted* for production, because
`verify:tag-config` reads the local shell. It is now run against the real origin through an ignored,
credential-free env file (`NEXT_PUBLIC_SITE_URL` is public — it ships in the browser bundle and is etched
on tags).

`PRODUCTION_DOMAIN_CHECKLIST.md` items 3–10 and 13 were completed during the B3 operator closeout but the
checklist was never updated; it still claimed `vercel domains ls` returned 0 domains. **Corrected in B6.**

**Why verdict 4 is still NO-GO — two items, both outside software:**

1. **Physical QR scan test on real phones** — not run (`REAL_DEVICE_QA.md` Part 2).
2. **The `/t/*` redirect obligation has no named owner.** It is documented; nobody owns it. A tag is
   permanent, so a documented obligation with no owner is a promise nobody has made.

Plus the separate physical gate (verdict 6). **Do not produce permanent metal tags.**

---

## Part E — live notification — **CONDITIONAL GO**

B4 completed. Production sends real, authenticated email; staging sends none.

| Check | Result |
|---|---|
| Resend domain verified | ✅ `notify.mulemark.io` — DKIM, SPF (at `send.notify`), return-path MX |
| Sender | ✅ `Mulemark <notifications@notify.mulemark.io>` |
| Reply-To | ✅ `support@mulemark.io`, reaches a human |
| SPF / DKIM / DMARC | ✅ pass in delivered headers at **both** Gmail and Outlook; DMARC `p=none` (monitoring) |
| Multi-provider test | ✅ Gmail + Outlook |
| All four event types | ✅ support, damage, return checklist, tag-request status — one email each, provider IDs captured, `mulemark.io` links |
| API key scope | ✅ operator-confirmed sending-only, restricted to `notify.mulemark.io` |
| Preview dry-run | ✅ observed: `reason":"preview_environment"`, `attempts: 0` |
| Production live | ✅ |
| Customer allowlist guidance | ✅ `EMAIL_ALLOWLIST_GUIDE.md` |
| Google Workspace undisturbed | ✅ apex MX + SPF unchanged; `_dmarc` holds exactly one record |

**Conditions to reach GO:**

1. **Replay one event inside 24 h and confirm no second email.** "Exactly one email per event" is a
   different measurement. Duplicate protection depends on **Resend honouring the `Idempotency-Key` we
   send** — taken from their documentation and proven only against a mocked API. Nothing has confirmed
   the live endpoint accepts and dedupes on it. This is the highest-value check left, because the failure
   mode reaches a real customer.
2. **Measure cold-mailbox placement, or decide the allowlist is part of onboarding.** Outlook delivered
   with authentication passing, but that mailbox carries an allow/safe-sender rule added after the first
   Junk result. The evidence is "delivers to an allowlisted recipient", not "delivers to a new customer".

Also unexercised live (unit-tested only, neither risks a wrong email reaching a customer): the
provider-failure path and the disabled-notification path.

**Open/click tracking status is deliberately unrecorded.** It is a Resend dashboard setting the app
cannot assert; an unverified "off" in a runbook is worse than an admitted unknown because it stops anyone
looking.

**May be said:** all four notification types deliver live and authenticated at two providers.
**May not be said:** that duplicate protection is proven in production, that tracking is off, or that any
message will land in an Inbox. **Inbox placement is never guaranteed.**

---

## Part F — smoke verification — **GO**

| Requirement | Result |
|---|---|
| Staging smoke repeatable | ✅ run twice in B5, once in B6 — identical shape; writes land in the seeded QA orgs and are idempotent |
| Production smoke bounded | ✅ read-only, **no credentials**, no login, no form write, no email |
| Target crossover blocked | ✅ refused **before the first request**, both directions, re-proven in B6 |
| Operator runbook current | ✅ `PRODUCTION_DEPLOYMENT_RUNBOOK.md` §5 has the when-to-run matrix; staging and operations runbooks updated |

Two independent gates: a URL classifier (`scripts/lib/smoke-target.mjs`, 17 unit tests) that treats any
unrecognised public host as production, and the behavioural isolation probe.

**Staging is deliberately not "complete".** Outbound and staff-return are checked for reachability and
guards only; completing them would close the rental session the *next* run's acknowledgement check
depends on. A smoke suite that degrades its own fixtures manufactures tomorrow's false failure.

**SKIP is reported separately from PASS and never counted as one.** Both runners currently report one
skip, each for a stated reason.

---

## Known limitations

- Physical-device matrix not executed (hardware).
- Replay/idempotency unproven against the live Resend API.
- Cold-mailbox placement unmeasured; the Outlook test mailbox is allowlisted.
- Open/click tracking status unrecorded.
- Production performance never baselined — all numbers are staging lab data.
- **Vercel Speed Insights is not collecting** (present in `app/layout.tsx`, never requested by the
  browser). Verified identically on production and preview in B1B.
- Customer-admin profile writes still use the service role (P1, deferred to its own migration).
- The 30 s inbox auto-refresh re-prefetches row links (D-3, S3).
- No durable notification-history table — Vercel logs + the Resend dashboard only, a deliberate pilot
  decision.
- Vercel account is on **Hobby**; Pro is required before a paid or commercial pilot.

## External operator actions

| # | Action | Unblocks |
|---|---|---|
| 1 | Execute `REAL_DEVICE_QA.md` Part 2 on real hardware | verdicts 3 and 4 |
| 2 | Name an owner for the `/t/*` redirect obligation | verdict 4 |
| 3 | Replay one production notification within 24 h | verdict 5 → GO |
| 4 | Test placement in a clean, never-allowlisted mailbox — or record allowlisting as onboarding policy | verdict 5 → GO |
| 5 | Record the Resend open/click tracking status | closes an admitted unknown |
| 6 | Enable Speed Insights in the Vercel dashboard, then re-baseline on `mulemark.io` | real performance data |
| 7 | Upgrade Vercel to Pro | any paid/commercial pilot |
| 8 | Optionally set `PRODUCTION_SMOKE_SHORT_CODE` to a test-only asset | turns the last production smoke SKIP green |

## Next recommended workstream

See `roadmap.md`. The evidence points at **pilot onboarding readiness** — every software gate is closed,
and the remaining blockers are things a first pilot customer would surface faster than more engineering
would.
