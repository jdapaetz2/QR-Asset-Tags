# Pilot Limitations & Blockers — Mulemark

Phase A1 record of what must be fixed before a pilot vs. what is an accepted limitation. Sourced from the approved
Phase A0 audit. Categories: **P0 blocker** (before any production pilot) · **P1 pre-paid-pilot hardening** ·
**Accepted pilot limitation** · **Deferred enhancement** · **Commercial dependency** · **Physical-tag dependency**.

Blockers are kept separate from defects and from accepted limitations, per the roadmap maintenance rules.

---

## P0 — must fix before any production pilot

| Item | Evidence | Owner |
|---|---|---|
| ~~**Migrations verified-applied on the target project.**~~ **RESOLVED (A2).** Operator-verified: `supabase migration list` full match + `db push --dry-run` = "up to date"; 0001–0031 applied. | `docs/MIGRATION_LEDGER.md` header | done (A2) |
| **Stable production domain / QR base URL.** `NEXT_PUBLIC_SITE_URL` must be the final https production host before any tags are printed. **(A2) Enforcement added:** env validation requires https + non-placeholder in production, and the durable-output routes fail closed on an unsafe base URL. **Remaining operator action:** actually set the production domain in Vercel. | `lib/env.ts`, `lib/qr/output-guard.ts` | operator (physical: Phase C) |

## P1 — pre-paid-pilot hardening

| Item | Evidence | Owner |
|---|---|---|
| **Shared-store rate limiting for public forms/media.** Only a honeypot exists; no limiter (must not be instance-local in-memory). Public abuse / storage-cost exposure. | env reconciliation; roadmap A4 | **A4** |
| ~~**Admin/staff separation at the DB.**~~ **FIXED in A3.1** (migration 0032 + admin guards on every administrative server action). The DB backstop is **applied** on the linked remote (operator-verified) and the server-layer guards are active. Also closed a **critical** self-escalation (`profiles.role` was self-writable → platform owner). | `docs/SECURITY_MODEL.md` "Role enforcement at the database" | done (A3.1) |
| ~~**`/dashboard/submissions/export` policy.**~~ **FIXED in A3.1** — customer-admin-only + requires the master and `export_submissions_enabled` flags; button hidden unless both hold. | SECURITY_MODEL #4 | done (A3.1) |
| **Customer-admin profile writes still use the service role.** Narrowed in A3.1 (explicit gate, org-scoped lookups, `setUserRole` off service role, invite compensation). A3.2 audited + allowlisted the remaining service-role use (`scripts/verify-production-config.mjs`, `lib/security/service-role.test.ts`, SECURITY_MODEL inventory). The caller-aware SECURITY DEFINER RPC that would take the invite/status writes off the service role entirely is **still queued** (its own migration; `profiles_insert` is owner-only). | `lib/team/actions.ts`; SECURITY_MODEL "Service-role inventory" | **deferred (own migration)** |
| ~~**Live-RLS + migration-execution tests.**~~ **DONE in A3.2.** Executed suite (`npm run test:security`) proves live RLS, RPC role/org boundaries, storage policies, and fresh migration application against a real local Supabase stack; runs nightly + on PRs. Remaining: **browser/E2E (Playwright)** — no golden path through a real UI yet. | `docs/SECURITY_TESTING.md`; `docs/CURRENT_ARCHITECTURE.md` | **A6.1 (E2E only)** |
| **Notification reliability + observability.** Failures are swallowed; no structured/redacted logs, no provider response IDs; SPF/DKIM/DMARC undocumented; no retry/operator follow-up. | `lib/notifications/*`; roadmap A5 | **A5** |
| **Deploy/rollback + incident runbooks; automated prod smoke.** None exist (only manual doc checklists). | A0 coverage matrix | **A2/A5/A7** |
| **Orphaned-media cleanup for failed public submissions + operator sweep path.** Inspections clean media on RPC failure; a general orphan-cleanup path needs confirmation/build. | roadmap A4 | **A4** |

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
