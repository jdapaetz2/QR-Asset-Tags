# Pilot Limitations & Blockers — Mulemark

Phase A1 record of what must be fixed before a pilot vs. what is an accepted limitation. Sourced from the approved
Phase A0 audit. Categories: **P0 blocker** (before any production pilot) · **P1 pre-paid-pilot hardening** ·
**Accepted pilot limitation** · **Deferred enhancement** · **Commercial dependency** · **Physical-tag dependency**.

Blockers are kept separate from defects and from accepted limitations, per the roadmap maintenance rules.

---

## P0 — must fix before any production pilot

| Item | Evidence | Owner |
|---|---|---|
| **Migrations verified-applied on the target project.** Code on `pilot-credibility` assumes all of 0001–0031 (authoritative chain endpoints 0019/0030/0029/0028/0009). If any are unapplied, staff outbound/return, org templates, guided inspections, outbound-attach, reconciliation, and the bounded-history indexes fail at runtime. Remote status is currently **unverified**. | `docs/MIGRATION_LEDGER.md`; design-doc "ships unapplied" notes are historical | **A2** |
| **Stable production domain / QR base URL.** `NEXT_PUBLIC_SITE_URL` is baked into permanent physical tags; it must be the final production host before any tags are printed (localhost / `*.vercel.app` are blocked from tag production by `isProductionBaseUrl`). | env matrix; `lib/qr/production.ts` | **A2** (physical: Phase C) |

## P1 — pre-paid-pilot hardening

| Item | Evidence | Owner |
|---|---|---|
| **Shared-store rate limiting for public forms/media.** Only a honeypot exists; no limiter (must not be instance-local in-memory). Public abuse / storage-cost exposure. | env reconciliation; roadmap A4 | **A4** |
| **Admin/staff separation at the DB.** Route guards enforce it, but same-org RLS distinguishes only `platform_owner`; a `customer_staff` could write some own-org config via direct PostgREST. Team management runs a server-only service-role path with TS-only authorization and no DB backstop for the admin invite path. Intra-tenant, not cross-tenant. | `docs/SECURITY_MODEL.md` "Known security gaps" #2/#3 | **A3.1** |
| **`/dashboard/submissions/export` policy.** Staff-reachable, independent of owner-controlled customer export; needs a product-policy decision so it cannot bypass export gating. Open security decision until fixed. | route matrix; SECURITY_MODEL #4 | **A3.1** |
| **Browser/E2E + live-RLS + migration-execution tests.** 126 tests are unit + source-structural only; node env, no DOM, no Playwright. No golden path is verified through a real UI or the DB. | `docs/CURRENT_ARCHITECTURE.md` test-coverage; A0 coverage matrix | **A6.1/A6.2** |
| **Notification reliability + observability.** Failures are swallowed; no structured/redacted logs, no provider response IDs; SPF/DKIM/DMARC undocumented; no retry/operator follow-up. | `lib/notifications/*`; roadmap A5 | **A5** |
| **Deploy/rollback + incident runbooks; automated prod smoke.** None exist (only manual doc checklists). | A0 coverage matrix | **A2/A5/A7** |
| **Orphaned-media cleanup for failed public submissions + operator sweep path.** Inspections clean media on RPC failure; a general orphan-cleanup path needs confirmation/build. | roadmap A4 | **A4** |

## Accepted pilot limitations

| Item | Evidence | Note |
|---|---|---|
| **`public-assets` cover images are public by URL** regardless of asset `public_status`/`archived_at`. | SECURITY_MODEL #5 | Do not put sensitive info in cover images; low-sensitivity, UUID paths. Optional hardening later. |
| **`SCAN_IP_HASH_SALT` fails soft** — empty salt → weaker IP anonymization, no error. | `lib/env.ts`, `lib/scan/record.ts` | A5 to require it in production. |
| **CI triggers on `main` / PR only** (not `pilot-credibility` pushes); no secret scanning / git hooks; local Node 24 vs CI Node 22. | `.github/workflows/ci.yml` | Tighten in A3.2 / A7. |
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
