# E2E / Browser Testing — Mulemark (Phase A6.2)

Playwright browser tests that run the **real app** against the **local Supabase stack**. A6.1 built the
foundation + a smoke set; **A6.2 adds the critical golden-path + role-boundary suite** across public,
admin, staff, owner, cross-tenant, and failure/idempotency surfaces.

> **Production prohibition.** These tests are non-production only. `playwright.config.ts` resolves the
> Supabase credentials from `supabase status` via `getStackConfig()`, which **refuses any non-loopback
> host**, and `baseURL` is always `http://127.0.0.1:3100`. Never point E2E at a production or shared
> database.
>
> **Phase B1A addition.** The E2E and security suites were already loopback-guarded; the gap was the
> A6.3 **QA scripts** (`scripts/qa/staging-*.mjs`), which read the Supabase URL and service-role key from
> the environment with no target check. They now require an explicit `MULEMARK_TARGET` and verify it
> against the resolved project ref before writing anything —
> see [`STAGING_ENVIRONMENT_SETUP.md`](STAGING_ENVIRONMENT_SETUP.md). Check a shell with
> `npm run verify:local-target` / `verify:staging-target` / `verify:production-target`.
>
> **Phase B1B.** Staging now has its own Supabase project, so staging QA no longer risks production.
> The Playwright suites still run **against the local stack only** — deliberately. `assertLocal` refuses
> non-loopback and `seedFixtures()` tears down and recreates organizations, so pointing them at any
> hosted project would reintroduce the hazard Phase B1 removed. Staging workflow coverage instead comes
> from `npm run staging:verify` (`scripts/staging/verify-staging-workflows.mjs`) — 23 golden-path checks
> driven against the deployed Preview using the deterministic staging fixtures.

## Prerequisites

- **Docker Desktop** running, and the local Supabase stack up: `npx supabase start`.
- **Chromium** for Playwright: `npx playwright install chromium` (one-time).
- Canonical **Node 22** (`.nvmrc`).

## Environment variables

The E2E web server's env is injected by `playwright.config.ts` from the local stack — you do **not** set
Supabase vars by hand for local runs:

| Var | Local source | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `supabase status` | local stack only |
| `NEXT_PUBLIC_SITE_URL` | `http://127.0.0.1:3100` | the E2E origin |
| `SCAN_IP_HASH_SALT` | fixed local non-secret | scan logging works |
| `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` | **unset** | notifications dry-run → **no email dependency** |
| `E2E_PASSWORD` | optional | fixture-user password. Defaults to a local, non-secret throwaway. **Supply this via env for any non-local target** — never commit a real one. |

## QA data & reset

The dataset is the **reused A3.2 fixtures** (no duplication). `tests/e2e/global-setup.ts` applies local
grant parity and seeds: orgs A (active) / B (active + export-enabled) / C (suspended); a platform owner,
customer admin + staff in org A, an admin + staff in org B, a disabled user; public/private/archived
assets; active QR links (`a3-a-pub`, `a3-b-pub`) + a disabled QR link; public + private documents; an
active rental session; open submissions; templates and tag requests. Seeding is idempotent
(teardown-then-reseed) and re-runs safely.

- Reset migrations + seed to a clean baseline: `npm run test:e2e:reset` (`supabase db reset`).
- Fixture seeding runs automatically in global setup on every E2E run.

## Auth fixtures & security

- `tests/e2e/auth.setup.ts` (the Playwright `setup` project) performs a **real password login through the
  UI** for each role and saves the session to `tests/e2e/.auth/<role>.json`. **No magic-link email is
  used.** This doubles as the login-helper test — it runs every time.
- `tests/e2e/.auth/` is **gitignored** — session state is never committed.
- The password comes from the shared, env-overridable `E2E_PASSWORD` (default is a local throwaway); no
  real credential lives in tracked source.
- Absent/expired auth is handled cleanly — an unauthenticated protected route redirects to `/login`
  (`auth-required.spec.ts`).

## Run commands

```bash
npx supabase start            # once, Docker up
npm run test:e2e:smoke        # build the app + seed + run the A6.1 smoke suite (Chromium)
npm run test:e2e:critical     # the bounded @critical subset (what CI runs)
npm run test:e2e              # the FULL golden-path suite (all specs)
npm run test:e2e:ui           # Playwright UI mode
npm run test:e2e:reset        # supabase db reset (clean migrations + seed)
```

The web server runs a **production build** (`next build && next start`), not `next dev`: dev-mode HMR left
client components (e.g. the Radix account menu) intermittently non-interactive, causing flaky clicks. The
build also strips any stale `.next/dev` types first for a deterministic type-check. First run builds
(~1 min); locally, a server already listening on 3100 is reused.

## Golden-path suite (A6.2)

Automated browser coverage, by persona directory under `tests/e2e/`:

- **public/** (`viewport 390×844`, anon) — scan page (active / unavailable-without-disclosure / Quick
  Start / documents / no horizontal overflow), damage + support forms (required block, optional media,
  `SUB-YYYY-XXXXXX` reference), the 3-stage guided **return checklist** (answers survive Back, no-photo
  omission dialog, damage-without-photo path), and the once-per-rental **acknowledgement** prompt
  (delayed show, transient Dismiss, completion suppression, staff never sees it).
- **admin/** (org A) — dashboard settle + active nav, asset search/filter → detail with `returnTo`,
  submissions status transitions + bulk toolbar, rental-session **evidence** disclosures + print +
  acknowledgements + RNT-reference search, the customer-export boundary (org A disabled → redirect; org B
  enabled → CSV), settings/team reachability + wordmark + "Return checklist" terminology.
- **staff/** (org A) — nav omits Settings + every admin route 302s to `/dashboard`; outbound inspection's
  three session states (create / attach / blocked) verified via a service read; staff return closes the
  rental and frees the asset.
- **owner/** — org list + subnav, always-available owner export CSV, the customer-export toggle control,
  QR code-alias creation, and a customer bounced off `/owner`.
- **cross-tenant/** — an org-B customer sees no org-A record through any admin URL, an org-B export never
  contains org-A rows, `/owner` redirects a customer, and a wrong-org **staff** short code 404s.
- **failure/** — a double-fired submit creates exactly one row, a rejected upload preserves values and
  writes nothing, a rate-limited submit shows the generic message and writes nothing, and an
  unauthenticated protected route redirects.

**Disposable-fixture pattern (critical).** The shared baseline (A3.2 fixtures + `seedE2eExtras()`
enrichment) is seeded ONCE by `global-setup` and is **read-only** — reseeding would delete/recreate the
fixture users and invalidate the saved auth storage state. So every state-mutating test creates its OWN
disposable entities (unique ids + short codes) via the service-role helpers in
`tests/e2e/support/seed.ts` (`createAsset`, `createRentedStaffAsset`, `createSubmission`, …), acts, and
asserts on those — never disturbing the baseline or another test. `seedE2eExtras()` adds only read-only
enrichment (equipment-page content, a resolvable return template, one rich rental-session evidence graph)
and never touches the A3.2 security fixtures.

**`@critical` subset.** ~20 highest-value tests are tagged `@critical`; `npm run test:e2e:critical`
(`playwright test --grep @critical`) is what CI runs. The full suite runs manually / nightly / pre-deploy.

**Manual-only (not automated here).** Live Resend email delivery (deliberately dry-run — `RESEND_*`
unset); the owner disabled-primary QR guard end-to-end (create-alias is automated, the production-primary
disable guard is exercised by unit tests in `lib/qr`); real magic-link email login (password login is
used instead); multi-browser / visual-regression.

## Smoke tests

1. `public-scan.spec.ts` — the public `/t/<shortCode>` scan page loads for anon.
2. `roles.spec.ts` — admin (fresh UI login) → Dashboard; staff (storage state) → operational nav; owner
   (storage state) → Organizations.
3. `cross-org.spec.ts` — a second-org admin cannot open a first-org asset URL (RLS denial in the browser).
4. `sign-out.spec.ts` — account menu → Sign out → `/login`.
5. `auth-required.spec.ts` — unauthenticated `/dashboard` → `/login`.

## Deployment smoke is a different tool (Phase B5)

`npm run smoke:staging` and `npm run smoke:production` are **not** part of this suite and must not be
confused with it.

| | E2E (`test:e2e`) | Smoke (`smoke:*`) |
|---|---|---|
| Target | local stack, loopback-guarded | a deployed environment |
| Question | "does the behaviour hold?" | "is *this deployment* serving, with its guards closed?" |
| Fixtures | reseeded every run (destructive) | reused; staging writes are bounded and repeatable |
| Retries | yes (2 in CI) | **none** — a retry could duplicate a form write |
| Production | never | read-only, credential-free |

This suite stays loopback-only on purpose: `tests/security/setup/stack.ts#assertLocal` refuses a
non-loopback host, and `global-setup.ts` tears down and recreates organizations. Pointing it at a hosted
project would reintroduce exactly the hazard Phase B1 removed. Smoke exists so a deployed environment can
be checked *without* that seeder.

## Artifacts

On failure Playwright writes to `test-results/` (screenshots, `trace.zip`, `error-context.md`) and an
HTML report to `playwright-report/`. Both are gitignored. Open a trace with
`npx playwright show-trace test-results/<...>/trace.zip`.

## Preview execution

**Don't.** This suite is loopback-only by design and there is no longer a reason to point it elsewhere:
`npm run smoke:staging` (B5) covers a deployed preview, with a target gate, bounded repeatable writes and
no destructive seeding. Use that instead. Pointing this suite at a hosted project would run
`global-setup.ts`, which deletes and recreates organizations.

## CI behavior — deferred to A6.2 (documented blocker)

CI E2E is **not enabled in this phase.** The Supabase-in-CI capability exists
(`.github/workflows/security.yml` starts Docker + Supabase on `ubuntu-latest`), but a full
`supabase start` + production build + Chromium run could not be validated from the local dev machine, and
pushing an unverified browser job risks a flaky/red build. A6.2 should add a **separate, bounded** job
(not on every push — nightly + PR), scoped secrets, artifact upload on failure, Chromium only. Recipe:

```yaml
# .github/workflows/e2e.yml (A6.2)
on: { schedule: [{ cron: "37 6 * * *" }], pull_request: {}, workflow_dispatch: {} }
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx supabase start
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:smoke
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report }
      - run: npx supabase stop --no-backup
        if: always()
```

## Troubleshooting

- **"refusing to run … non-local"** — the stack isn't up or `supabase status` points elsewhere; run
  `npx supabase start`.
- **web server fails to start / type error in `.next/dev/types`** — a prior `next dev` polluted `.next`;
  the config strips `.next/dev` before building, but you can `rm -rf .next` to be sure.
- **auth setup fails to log in** — reseed (`npm run test:e2e:reset`) and confirm `E2E_PASSWORD` matches the
  seeded users (default local password when unset).
- **client control won't respond** — E2E uses the production build for hydration determinism; don't switch
  the web server to `next dev`.

## Known limitations for A6.2

- Only Chromium; smoke-level only (no full golden path, no visual regression).
- CI E2E deferred (recipe above).
- Single worker (`workers: 1`) because the whole suite shares one seeded DB — the full suite will need
  either per-worker data isolation or to stay serial.
- `next build` per run adds startup latency; A6.2 may cache the build or split build/serve.
