# Staging Deployment Runbook — Mulemark

> ## ⚠️ TEST-ONLY URL — NEVER PRINT ON A PHYSICAL TAG
>
> Every URL in this document is a **temporary Vercel deployment**. A physical QR tag is permanent; a
> preview host is not. Producing tags from any URL here would create tags that die when the deployment
> is removed. The final Mulemark production domain **does not exist yet** — see
> [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md) and [`TAG_PRODUCTION_READINESS.md`](TAG_PRODUCTION_READINESS.md).
>
> The app enforces this itself: durable-output routes (`qr.svg`, `qr-sheet.svg`, `export.csv`) refuse a
> `*.vercel.app` base URL unless the caller explicitly acknowledges an unsafe TEST export with
> `?unsafe=1` (`lib/qr/output-guard.ts`).

Deployment mechanics are the same as production — this runbook records only what is **different** for a
staging/QA target. Production steps live in
[`PRODUCTION_DEPLOYMENT_RUNBOOK.md`](PRODUCTION_DEPLOYMENT_RUNBOOK.md); QA procedure in
[`REAL_DEVICE_QA.md`](REAL_DEVICE_QA.md); measurements in
[`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md).

## Why staging exists (Phase A6.3)

Real-device QA and a performance baseline need a URL a phone can reach. The operator decision for this
phase was explicit: **no final domain, no DNS, no live email, no permanent tags** — a temporary Vercel
URL is acceptable *for testing only*.

## A6.3 staging record

| Field | Value |
|---|---|
| Branch | `pilot-credibility` |
| Commit | `b7884a4` (A6.2 — golden-path + role-boundary browser tests) |
| Vercel project | `qr-asset-tags` (`jdapaetz2-s-projects`) |
| Deployment type | **Preview** (never `--prod`) |
| Preview URL | `https://qr-asset-tags-czvqz3pth-jdapaetz2-s-projects.vercel.app` |
| Supabase project ref | `apeiswnkheiwrpvumder` (**shared with production** — see warning below) |
| Environment mode | `preview` (`VERCEL_ENV=preview`) |
| Migrations | `0001`–`0033` local **and** remote (0033 applied during A6.3) |
| Notifications | **Dry-run** — `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` are not set on the project |
| Speed Insights | Wired (`app/layout.tsx` renders `<SpeedInsights />`); **field data requires real traffic** |
| Node (repo) | `22` (`.nvmrc`, `engines.node` = `22.x`) |
| Node (Vercel project setting) | **`24.x` — drift, see findings** |

### ⚠️ Staging shares production's database

Vercel `env ls` shows every variable scoped `Production, Preview` — a preview deployment therefore reads
and writes the **same Supabase project as production**. Consequences:

- All QA data must be created inside the single disposable QA organization seeded by
  `scripts/qa/staging-qa-data.mjs` (fixed id `a6300000-…-0000000a63a0`, name
  `"ZZ QA TEST ORG — A6.3 (disposable)"`). That script's writes and deletes are scoped to that one id.
- **Run `npm run qa:staging:data cleanup` when QA finishes.** Leaving QA rows behind means test data
  sitting in the same tables as real data.
- Before a paid pilot, give staging its **own** Supabase project. Tracked in
  [`PILOT_LIMITATIONS.md`](PILOT_LIMITATIONS.md).

### Findings raised by this deployment

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | **Migration 0033 was missing on the remote database.** The rate limiter fails *open* (`lib/ratelimit/limiter.ts`), so public forms kept working but abuse control was silently inactive and every submit logged a `failopen` event. | High | **Resolved in A6.3** — applied via `supabase db push` with operator authorization; `migration list` now matches 0001–0033. |
| 2 | **Vercel project Node is `24.x`; the repo's tested baseline is Node 22** (`.nvmrc`, `engines`, CI). Deployments are therefore not built on the version the suite is verified against. | Medium | Set the Vercel project's Node version to 22.x before the pilot deploy. |
| 3 | **Preview and Production share environment variables**, including the Supabase service-role key and `NEXT_PUBLIC_SITE_URL`. | Medium | Separate Preview env (own Supabase project + preview-scoped site URL) before a paid pilot. |
| 4 | Preview deployments are **SSO-protected**, so an anonymous phone cannot open them. A protection-bypass token is required for device QA. | Low (expected) | Token is provisioned per QA session and **revoked afterwards** (below). |

## Deploying a staging build

```bash
npx vercel deploy --project qr-asset-tags --yes
```

Never `--prod` — that promotes the build to the public production URL.

## Reaching an SSO-protected preview during QA

Preview deployments sit behind Vercel Deployment Protection. For device QA, enable
**Protection Bypass for Automation** (Vercel → Project → Settings → Deployment Protection), then:

- **Automation:** send header `x-vercel-protection-bypass: <secret>`. The QA scripts read it from
  `VERCEL_AUTOMATION_BYPASS_SECRET` and never print or persist it.
- **A real phone:** open the URL once with
  `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`; the cookie then lets the
  tester browse normally.

**Revoke the bypass token when QA is finished** — it grants anonymous access to every preview.

## Cleanup checklist (run at the end of every QA session)

- [ ] `npm run qa:staging:data cleanup` — removes the QA org, its rows, and the two QA logins.
- [ ] Revoke the deployment protection bypass token.
- [ ] Confirm no tag artwork was exported from a staging base URL (see `REAL_DEVICE_QA.md` Part E).
