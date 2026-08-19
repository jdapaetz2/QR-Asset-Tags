# Pilot Limitations & Blockers — Mulemark

Phase A1 record of what must be fixed before a pilot vs. what is an accepted limitation. Sourced from the approved
Phase A0 audit. Categories: **P0 blocker** (before any production pilot) · **P1 pre-paid-pilot hardening** ·
**Accepted pilot limitation** · **Deferred enhancement** · **Commercial dependency** · **Physical-tag dependency**.

Blockers are kept separate from defects and from accepted limitations, per the roadmap maintenance rules.

---

## P0 — must fix before any production pilot

| Item | Evidence | Owner |
|---|---|---|
| ~~**Migrations verified-applied on the target project.**~~ **RESOLVED (A2, re-verified A6.3 + A7).** `supabase migration list` full match + `db push --dry-run` = "Remote database is up to date". **0001–0033** applied (0032 in A3.1, 0033 in A6.3). | `docs/MIGRATION_LEDGER.md` header | done (re-verified A7) |
| **Stable production domain / QR base URL.** `NEXT_PUBLIC_SITE_URL` must be the final https production host before any tags are printed. **(A2) Enforcement added:** env validation requires https + non-placeholder in production, and the durable-output routes fail closed on an unsafe base URL. **Remaining operator action:** actually set the production domain in Vercel. | `lib/env.ts`, `lib/qr/output-guard.ts` | operator (physical: Phase C) |

## P1 — pre-paid-pilot hardening

| Item | Evidence | Owner |
|---|---|---|
| ~~**Shared-store rate limiting for public forms/media.**~~ **DONE in A4.** Postgres fixed-window limiter (`rate_limit_counters` + `rate_limit_touch`, service_role only) runs preflight on every public write; keys are salted IP + short-code hashes (no raw IP), NAT-friendly, stricter for media; scans stay unlimited. Executed tests prove grant boundary + burst/abuse denial. | `lib/ratelimit/*`, migration 0033, SECURITY_MODEL anti-abuse | done (A4) |
| ~~**Admin/staff separation at the DB.**~~ **FIXED in A3.1** (migration 0032 + admin guards on every administrative server action). The DB backstop is **applied** on the linked remote (operator-verified) and the server-layer guards are active. Also closed a **critical** self-escalation (`profiles.role` was self-writable → platform owner). | `docs/SECURITY_MODEL.md` "Role enforcement at the database" | done (A3.1) |
| ~~**`/dashboard/submissions/export` policy.**~~ **FIXED in A3.1** — customer-admin-only + requires the master and `export_submissions_enabled` flags; button hidden unless both hold. | SECURITY_MODEL #4 | done (A3.1) |
| **Customer-admin profile writes still use the service role.** Narrowed in A3.1 (explicit gate, org-scoped lookups, `setUserRole` off service role, invite compensation). A3.2 audited + allowlisted the remaining service-role use (`scripts/verify-production-config.mjs`, `lib/security/service-role.test.ts`, SECURITY_MODEL inventory). The caller-aware SECURITY DEFINER RPC that would take the invite/status writes off the service role entirely is **still queued** (its own migration; `profiles_insert` is owner-only). | `lib/team/actions.ts`; SECURITY_MODEL "Service-role inventory" | **deferred (own migration)** |
| ~~**Live-RLS + migration-execution tests.**~~ **DONE in A3.2.** Executed suite (`npm run test:security`) proves live RLS, RPC role/org boundaries, storage policies, and fresh migration application against a real local Supabase stack; runs nightly + on PRs. | `docs/SECURITY_TESTING.md`; `docs/CURRENT_ARCHITECTURE.md` | done (A3.2) |
| **Real-device QA is only half done.** A6.3 ran an automated pass on real browser **engines** (WebKit + Chromium) under device emulation against staging — 106/110 checks pass. The **physical-device matrix is not yet executed**: camera QR scan, photo picker/camera capture, real weak signal, iOS Safari and desktop Safari can only be answered on hardware and are recorded as blank rows, not as passes. | `docs/REAL_DEVICE_QA.md` Part 2 | **operator must run the physical-device matrix** |
| **Performance figures are a staging lab baseline, not production.** Small sample (5/route), one machine, one network, a `*.vercel.app` origin. (The shared-database caveat is resolved as of B1B.) **Correction (B1B): Speed Insights is NOT collecting** — `<SpeedInsights />` is in `app/layout.tsx` and `/_vercel/speed-insights/script.js` returns 200, but the browser never requests it, verified identically on production and preview. Earlier phases recorded it as "wired, awaiting traffic"; that was optimistic. | `docs/PERFORMANCE_BASELINE.md`; `docs/STAGING_ENVIRONMENT_SETUP.md` | **operator: enable Speed Insights in the Vercel dashboard**, then re-baseline on the final domain |
| ~~**Browser/E2E golden paths.**~~ **DONE in A6.1 + A6.2.** Playwright runs the real app against a local stack: A6.1 the foundation + smoke, A6.2 the critical public/admin/staff/owner/cross-tenant/failure golden paths + role boundaries (`docs/E2E_TESTING.md`). Bounded `@critical` subset runs on PRs + nightly (`.github/workflows/e2e.yml`); full suite manual/pre-deploy. **Remaining browser gaps (accepted):** live-email delivery is dry-run only (never asserted); the owner disabled-primary QR guard is unit-tested, not driven end-to-end; single browser (Chromium), no visual-regression. | `docs/E2E_TESTING.md`; `.github/workflows/e2e.yml` | done (A6.2) |
| **Notification reliability + observability.** ~~Failures swallowed; no structured logs / provider IDs / retry.~~ **HARDENED in A5:** explicit outcomes (`sent`/`dry_run`/`skipped_*`/`failed_*`), one redacted `[notifications]` structured log per attempt (no full recipient/body/secret/IP), provider message-ID capture, timeout + bounded retry honoring `Retry-After`, and a clear dry-run-vs-live distinction. Submissions are never blocked. **Still deferred (operator):** live domain + verified Resend sender + SPF/DKIM/DMARC + an actual multi-provider deliverability test — live email has **not** been tested. | `lib/notifications/*`; `docs/EMAIL_*` runbooks | A5 done; live sender deferred |
| **Deploy/rollback + incident runbooks; automated prod smoke.** ~~None exist.~~ **Substantially closed:** `PRODUCTION_DEPLOYMENT_RUNBOOK.md` (§9 rollback decision tree), `OPERATIONS_RUNBOOK.md` (incident handling), `STAGING_DEPLOYMENT_RUNBOOK.md` (A6.3). **Still open:** automated post-deploy smoke against a *production* URL — `PRODUCTION_SMOKE_TEST.md` is manual, and the automated suites deliberately never touch production. | runbooks above; `docs/E2E_TESTING.md` | automated prod smoke still open |
| ~~**Staging shares production's Supabase project + env.**~~ **RESOLVED in B1A + B1B.** Staging now runs on its own Supabase project (`kwserenxwjxozztyigmw`), with Preview-scoped Vercel variables; Preview no longer holds production credentials. Isolation proven by a staging-only/production-only short-code pair plus a live form submission that landed in staging while production row counts stayed identical. Enforcement (B1A) remains: target classification by project ref, ambiguity fails closed to production, explicit `MULEMARK_TARGET` on every destructive script, and a Supabase CLI linked-project guard. | `docs/STAGING_ENVIRONMENT_SETUP.md` | done (B1B) |
| ~~**Vercel builds on Node 24.x.**~~ **RESOLVED (B1B).** The Vercel project is now set to **22.x**, matching `.nvmrc`, `engines.node` and all three CI workflows. | Vercel project settings | done (B1B) |
| ~~**Orphaned-media cleanup for failed public submissions + operator sweep path.**~~ **DONE in A4.** Public upload cores clean their own objects on insert/upload failure (`lib/forms/cleanup.ts`); a client idempotency token stops duplicate rows+files; and an owner/operator dry-run-default sweep (`scripts/cleanup-orphan-media.mjs`) removes only row-less objects. | `lib/forms/cleanup.ts`, `docs/ORPHAN_MEDIA_CLEANUP.md` | done (A4) |

## Accepted pilot limitations

| Item | Evidence | Note |
|---|---|---|
| **`public-assets` cover images are public by URL** regardless of asset `public_status`/`archived_at`. | SECURITY_MODEL #5 | Do not put sensitive info in cover images; low-sensitivity, UUID paths. **A3.2 confirmed safe by construction:** executed storage test asserts it is the only public bucket; structural test asserts only cover/logo helpers write there — no submission/document media. Optional hardening later. |
| ~~**`SCAN_IP_HASH_SALT` fails soft.**~~ **RESOLVED (A2):** now fails closed (≥ 32 chars) in Vercel production/preview; fail-soft only in local/test. | `lib/env.ts` | done (A2) |
| ~~**Node 24 vs CI 22 mismatch; CI not on the pilot branch.**~~ **RESOLVED (A2):** canonical Node 22 (`.nvmrc` + engines); CI runs on main/PR/`pilot-credibility`. **Secret scanning DONE (A3.2):** gitleaks release binary in `ci.yml` (`--redact`, allowlist in `.gitleaks.toml`). Git hooks intentionally not added. | `.github/workflows/ci.yml`, `.gitleaks.toml`, `.nvmrc` | done (A2/A3.2) |
| **Timezone is fixed to `America/Vancouver`** for analytics day buckets (no `organizations.timezone` column yet). | `docs/DATA_MODEL.md` analytics RPCs | Deferred until a multi-tz customer. |

## Deferred enhancements

Per the roadmap trigger-based backlog: storage quotas/lifecycle, multi-recipient notifications, SMS, notification
center, out-of-service/hold state, checklist customization, fine-grained staff permissions, multi-yard, API/webhooks,
RMS integration, offline/PWA, in-app scanner, SSG/ISR, video evidence, customer self-service actions, complete
offboarding package (with media), automated billing, custom domains, i18n. Build only when the trigger is met.

## Commercial dependencies (Phase B)

Trademark/name clearance (CIPO/USPTO/common-law/domain/social), final production domain + continuity story, pricing
and packaging decisions, sales/pilot collateral.

## Physical-tag dependencies (Phase C)

Material/finish testing, QR size/contrast/quiet-zone/scan-angle/damage tolerance, environmental + mounting tests,
production traveler / first-article / scan QA / serialization / warranty.
