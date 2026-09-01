# Phase A Pilot Readiness — Mulemark

**Phase A7 closeout, revised through the B4 final evidence sync (2026-08-31).** Branch
`pilot-credibility`. Verdicts 3, 4 and 5 carry updates from B1–B4; each says which phase changed it.

> **Superseded for Phase B.** Engineering Phase B closed on 2026-08-31 and its verdicts are re-derived
> from freshly executed gates in
> [`PHASE_B_ENGINEERING_READINESS.md`](PHASE_B_ENGINEERING_READINESS.md) @ `dc260cc`. **Read that first**
> — this document is the Phase A record and the historical reasoning behind each gate.

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
| 4 | Permanent-tag live customer pilot | **NO-GO** (narrowed to physical QA) | domain live + software gate closed; **only** the real-phone scan test and physical tag process remain |
| 5 | Live notification delivery | **CONDITIONAL GO** (narrowed) | all 4 event types verified; 2 conditions remain — replay/idempotency unproven against the live provider, cold-mailbox placement unmeasured |
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
- **GitHub CI green on `3ec5da8`** — `checks` PASS, `secret-scan` PASS. The two gitleaks findings that
  went red on `a71dcf4`/`0aa205a` were **synthetic idempotency-key fixtures, not credentials**: nothing
  to rotate. The current-tree fixture was rewritten to use the real runtime generator, and the two
  historical matches are accepted in `.gitleaksignore` by **exact fingerprint**
  (`commit:path:rule:line`) — no path, directory or regex allowlist, and no history rewrite. The scan
  now runs `--redact --verbose`, so a future failure names the rule and location without printing the
  value.

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
| Device QA on staging | 110 checks — **106 pass at A6.3; 110/110 after B2 closed D-1** (`REAL_DEVICE_QA.md`) |

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
3. **Email is live for all four notification types** (B4 final evidence sync), authenticated and
   delivering at Gmail and Outlook. Two caveats still bind the customer promise: duplicate protection is
   unproven against the live provider, and inbox placement is not guaranteed anywhere. So the admin
   inbox UI remains the system of record — **no commitment may depend on an email arriving**. See
   verdict 5.
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
| Real-device QA | ⚠️ automated matrix complete (110/110, B2); **physical-device matrix not executed** |

**Residual risks the customer inherits** (documented, accepted, not blockers): ~~admin data tables
overflow horizontally on phones (D-1)~~ — **closed in B2**, automated matrix now 110/110; the 30 s inbox
auto-refresh re-prefetches row links (D-3, S3); customer-admin profile writes still use the service role
(P1, deferred to its own migration); and the **physical-device matrix is still unexecuted**, so camera
scan and real iOS Safari behaviour are unverified.

---

## 4. Permanent-tag live customer pilot readiness — **NO-GO** (narrowed to physical QA)

**Update (B3 + its operator closeout).** The canonical host is decided and **live**:
**`https://mulemark.io`** serves the product over HTTPS, `/t/{shortCode}` resolves from Production,
`www` redirects path-preservingly to the apex, and Production `NEXT_PUBLIC_SITE_URL` is the apex.
Production-generated QR output and public URLs use `mulemark.io/t/*` with no `localhost` or
`vercel.app` host. Staging isolation was re-proven with a staging-only short code that does not resolve
on Production. `getmulemark.com` and `mulemark.ca` are reserved and documented as never being QR
destinations.

The *software* half was already closed in B3: the tag-safety guard is a denylist, so the real domain
needed no code change; path preservation, the `*.vercel.app` block and the localhost block are pinned
by tests; and canonical metadata derives from the environment.

**Why this is still NO-GO.** Everything that software and DNS can settle is settled. What remains is
**physical**, and no amount of correct code substitutes for it:

| # | Condition | State |
|---|---|---|
| 1 | Stable production domain exists and serves `/t/*` | ✅ **live** |
| 2 | `verify:tag-config` passes against Production | ✅ against the Production value (it still exits 1 locally, by design, on the unset/localhost value) |
| 3 | Path-preserving `/t/*` redirect obligation documented + owned | 🟡 documented in `QR_DOMAIN_STRATEGY.md`; **owner still to be named** |
| 4 | Physical QR scan tests pass on real phones | ⬜ **not run** — needs hardware |
| 5 | Tag material, marking, durability, contrast, scannability | ⬜ separate gate — `TAG_PRODUCTION_READINESS.md` (verdict 6) |

**Do not produce permanent metal tags yet.** Conditions 4 and 5 are the whole remaining risk, and they
are the expensive kind to get wrong: a tag that does not scan in the field is scrap.

**Defence in depth already in place:** durable-output routes are auth-gated (307 for anonymous) *and*
base-URL-guarded (`lib/qr/output-guard.ts`), the `*.vercel.app` rule is unit-tested
(`lib/qr/production.test.ts`), and short codes are domain-independent (`lib/qr/url.ts` computes from
`NEXT_PUBLIC_SITE_URL`), so a later domain change needs no data migration.

---

## 5. Live notification readiness — **CONDITIONAL GO** (conditions narrowed)

**Update (B4 final evidence sync, 2026-08-31).** The verdict label is unchanged, but the evidence
behind it moved a long way: **all four notification events are now verified end-to-end on Production**,
and the staging hard-stop is observed rather than inferred. Two conditions remain, and both are named
rather than waved past.

### Verified — operator-executed on Production

| Check | Result |
|---|---|
| Support request → live email | **PASS** |
| Damage report → live email | **PASS** |
| Return checklist → live email | **PASS** |
| Tag-request status → live email | **PASS** |
| Exactly one email per tested event | **PASS** |
| Provider message IDs captured | **PASS** |
| Links use `mulemark.io` | **PASS** |
| Reply-To reaches `support@mulemark.io` | **PASS** |
| Gmail SPF / DKIM / DMARC | **PASS** |
| Outlook SPF / DKIM / DMARC | **PASS** |
| Outlook delivery | **delivered** (placement caveat below) |
| Resend API key scope | **confirmed** — sending-only, restricted to `notify.mulemark.io` |

Event coverage now matters more than the count suggests: the return checklist enters through
`lib/inspections/submit.ts` rather than the damage/support forms, and the tag-request notification uses
a different orchestrator, a different subject builder, and the only idempotency key that carries a
status. Those were the two paths the previous closeout refused to mark as passing on inference, and
they have now been run for real.

### Verified — the staging hard-stop, first-hand

The previous closeout could only produce `skipped_no_recipient`, which returns *before* the send layer
and therefore proved nothing about the environment rule. With a recipient configured on a staging org,
the rule itself was captured:

```
outcome: "dry_run"   reason: "preview_environment"   deploymentContext: "preview"
attempts: 0          providerId: null                recipientRedacted: "s***@mulemark.io"
```

A real recipient was resolved, the send layer **was** entered, and nothing was sent — with the
environment named as the cause rather than missing credentials. Preview also holds no Resend
credentials, and unit tests configure a key deliberately and still expect `dry_run`. Three independent
safeguards, one of them now observed under production conditions.

### Remaining conditions to reach GO

**1. Replay/idempotency is unproven against the live provider.** "Exactly one email per event" is a
different measurement. Duplicate protection depends on **Resend honouring the `Idempotency-Key` header**
— taken from their documentation and verified only in unit tests against a mocked API. Nothing has yet
confirmed the live endpoint accepts and dedupes on it. Trigger the same event twice within 24 hours and
confirm one message arrives, with the second request returning the original `providerId`. This is the
highest-value check left, because a duplicate notification reaches a real customer.

**2. Cold-mailbox placement is unmeasured.** Outlook delivered with authentication passing, but that
mailbox carries an allow/safe-sender rule added after the first Junk result. The standing evidence is
"delivers to a recipient who has allowlisted the sender" — real, but not the case that matters at pilot.
The allowlist cannot be un-taught there, so this can only be closed from a different address, or by
recording a decision that `EMAIL_ALLOWLIST_GUIDE.md` goes out at onboarding.

Also not yet exercised live, and unit-tested only: the provider-failure path and the
disabled-notification path. Neither risks a wrong email reaching a customer, which is why they sit below
the two conditions above.

**Open/click tracking status is deliberately unrecorded.** It is a Resend dashboard setting the app
cannot assert. Writing an unverified "off" into a runbook would be worse than an admitted unknown,
because it would stop anyone looking.

### What may and may not be said today

**May:** all four Mulemark notification types deliver live, authenticated (SPF/DKIM/DMARC passing at
Gmail and Outlook), with correct sender, Reply-To, references and `mulemark.io` links; replies reach a
human; and staging provably sends nothing.

**May not:** that duplicate protection is proven in production; that open/click tracking is off; or that
any message will land in an Inbox. **Inbox placement is never guaranteed.**

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
