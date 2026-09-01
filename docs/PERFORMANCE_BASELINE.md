# Performance Baseline — Mulemark (Phase A6.3, **staging only**)

> ## ⚠️ Read this before quoting any number below
>
> These are **lab measurements from a temporary staging deployment**. They are useful for spotting
> regressions and gross outliers. They are **not**:
>
> - **not** production performance — these are staging numbers; the production domain
>   (`https://mulemark.io`, live since the B3 closeout) has **never** been baselined;
> - **not** field data — no real users, devices, or networks are represented;
> - **not** statistically meaningful — 5 samples per route, one machine, one network, one location;
> - **not** measured with live email — notifications ran in dry-run, so no provider latency is included;
> - **not** a physical-tag or domain validation — that remains deferred (`QR_DOMAIN_STRATEGY.md`).
>
> **The pilot's real performance story requires a re-baseline on the final domain, with Vercel Speed
> Insights field data (p75 across real users).** Treat this document as a starting reference only.

## B6 re-measurement (2026-08-31) — no regression

Re-run on the current staging deployment with `npm run qa:staging:vitals`, same method and sample size,
to answer one question: **did B2's responsive work slow anything down?** It did not. Every route improved
in both classes; the admin tables B2 actually changed improved the most.

| Route | Mobile LCP: A6.3 → B6 | Desktop LCP: A6.3 → B6 |
|---|---|---|
| public scan | 1924 → **644 ms** | not captured → **188 ms** |
| damage form | 1268 → **356 ms** | 732 → **260 ms** |
| renter return checklist | 1472 → **328 ms** | 1448 → **192 ms** |
| login | 592 → **248 ms** | 216 → **208 ms** |
| dashboard | 2860 → **1128 ms** | 1008 → **696 ms** |
| assets | 2552 → **1096 ms** | 880 → **564 ms** |
| submissions | 2700 → **1148 ms** | 940 → **608 ms** |
| rentals | 2320 → **1008 ms** | 1000 → **536 ms** |

CLS stayed 0.000 everywhere. The A6.3 desktop return-checklist outlier (an 11 s LCP tail) did not recur.

**Do not read the improvement as a code win.** Between the two runs the deployment changed, staging moved
to its **own** Supabase project (B1B — no longer contending with production), and the machine and network
were not controlled. The supportable claim is the negative one: **nothing regressed**, and the routes B2
touched are not slower. Attributing the speed-up to any single cause would be guessing.

Authenticated routes are measured again because B6 fixed the runner: it now defaults to
`STAGING_QA_PASSWORD` and the seeded QA admin address, so `npm run qa:staging:vitals` is a fixed command.
Previously those rows silently reported "no QA credentials supplied" — which meant the routes most likely
to regress were the ones never measured.

## What was measured

| | |
|---|---|
| Staging URL | `https://qr-asset-tags-czvqz3pth-jdapaetz2-s-projects.vercel.app` (**test-only**) |
| Commit | `b7884a4` on `pilot-credibility` |
| Method | Playwright + `PerformanceObserver` / Navigation Timing (`scripts/qa/staging-vitals.mjs`) |
| Samples | **5 per route per device class** (median reported, LCP range shown) |
| Mobile class | Pixel 7 viewport, **4× CPU throttling** |
| Desktop class | 1280×720, no throttling |
| Data source | staging Supabase (**shared with production at the time — separated in B1B**), disposable QA org |
| Speed Insights | present in `app/layout.tsx` but **CORRECTED (B1B): not collecting** — the browser never requests the script. Operator must enable it in the Vercel dashboard. |

## Results

### Mobile class (Pixel 7 viewport, 4× CPU throttle)

| Route | n | TTFB | FCP | LCP (median) | LCP range | CLS | INP proxy |
|---|---|---|---|---|---|---|---|
| public scan | 5 | 37 ms | 2108 ms | 1924 ms | 1568–2500 ms | 0.000 | 224 ms |
| damage form | 5 | 34 ms | 1268 ms | 1268 ms | 992–1716 ms | 0.000 | not captured |
| renter return checklist | 5 | 33 ms | 1328 ms | 1472 ms | 1200–1636 ms | 0.000 | 104 ms |
| login | 5 | 34 ms | 592 ms | 592 ms | 392–1156 ms | 0.000 | 104 ms |
| dashboard | 5 | 31 ms | 1232 ms | 2860 ms | 2300–3088 ms | 0.000 | not captured |
| assets | 5 | 28 ms | 1180 ms | 2552 ms | 964–2996 ms | 0.000 | 144 ms |
| submissions | 5 | 29 ms | 1324 ms | 2700 ms | 2588–2980 ms | 0.000 | 144 ms |
| rentals | 5 | 32 ms | 1504 ms | 2320 ms | 1372–2688 ms | 0.000 | 224 ms |
| session evidence (photos) | 5 | 30 ms | 984 ms | 1536 ms | 1368–1652 ms | 0.000 | not captured |

### Desktop class (1280×720, unthrottled)

| Route | n | TTFB | FCP | LCP (median) | LCP range | CLS | INP proxy |
|---|---|---|---|---|---|---|---|
| public scan | 5 | 31 ms | 664 ms | — (not captured) | — | 0.000 | 64 ms |
| damage form | 5 | 39 ms | 732 ms | 732 ms | 692–904 ms | 0.000 | 16 ms |
| renter return checklist | 5 | 75 ms | 1448 ms | 1448 ms | **960–11148 ms** | 0.000 | not captured |
| login | 5 | 31 ms | 216 ms | 216 ms | 204–292 ms | 0.000 | 16 ms |
| dashboard | 5 | 28 ms | 1008 ms | 1008 ms | 924–1128 ms | 0.000 | 56 ms |
| assets | 5 | 27 ms | 880 ms | 880 ms | 828–952 ms | 0.000 | 48 ms |
| submissions | 5 | 28 ms | 940 ms | 940 ms | 848–1532 ms | 0.000 | 24 ms |
| rentals | 5 | 27 ms | 1000 ms | 1000 ms | 876–1056 ms | 0.000 | not captured |
| session evidence (photos) | 5 | 28 ms | 844 ms | 844 ms | 808–1016 ms | 0.000 | 56 ms |

## Reading the numbers

**TTFB is uniformly 27–39 ms.** Vercel's edge is serving quickly and the shared Supabase is not a
bottleneck at this (single-user, tiny-dataset) scale. This says nothing about behaviour under real load.

**CLS is 0.000 everywhere.** No layout shift was observed on any route in either class — consistent with
the explicit image ratios and skeletons added in earlier waves.

**The renter-facing routes are the fastest**, which is the right priority: the scan page, damage form and
return checklist all land well under the admin surfaces on mobile.

**Admin list routes are the slowest on mobile** (LCP ~2.5–2.9 s under 4× CPU throttle). These are
data-dense, desktop-primary screens; the same routes are ~0.9–1.0 s on desktop.

### Anomalies — recorded, not smoothed over

- **Desktop "public scan" LCP was never captured** across all 5 samples (mobile captured it fine). Most
  likely the largest element paints at FCP with no later candidate, so no `largest-contentful-paint`
  entry follows. Reported as "not captured" rather than substituted with FCP.
- **One 11.1 s LCP outlier** on desktop renter return checklist (range 960–11148 ms, median 1448 ms).
  Almost certainly a cold serverless start. With n=5 a single outlier badly distorts a mean — which is
  exactly why medians and full ranges are reported here instead.
- **INP is "not captured" on several routes.** INP is fundamentally a *field* metric. This harness fires
  one synthetic click and reports an `event`-entry duration only when one actually exists. Where no
  qualifying interaction occurred, nothing is claimed. **Do not treat the "INP proxy" column as INP.**

## Request efficiency (measured alongside — see `REAL_DEVICE_QA.md` / Part D)

`/dashboard/submissions` auto-refreshes on a 30 s floor. Over a 90 s idle window it produced **3 activity
bursts** (correct cadence) totalling **~76 requests**, because each `router.refresh()` re-fetches the page
RSC payload *and* re-prefetches every visible row link. Bounded and correct, but it scales with rows on
screen — noted as an efficiency item, not a loop. Hidden-tab: **0 requests**.

## What would change these numbers

| Factor | Direction | Note |
|---|---|---|
| Final production domain | unknown | different origin, DNS, possibly different region |
| Real user devices | **slower** | 4× CPU throttle is a guess, not a device population |
| Real networks | **slower** | this ran on a wired connection; a yard is not |
| Production data volume | **slower** | QA org has 1 asset and ~25 submissions |
| Live email (Resend) | slightly slower | notifier is best-effort and never blocks a submit, but is untimed here |
| Concurrent load | unknown | never tested; single-session only |

## Phase B2 responsive fix — performance impact

The mobile card layout was checked against the constraints that matter here, not assumed harmless:

- **No new dependency.** `components/ui/list-card.tsx` is plain JSX; nothing added to `package.json`.
- **No extra data query.** The card list maps the *same* rows the table already receives. On the
  submissions inbox the per-row derivation was pulled into a single `viewRows` pass that both
  presentations consume, so the work happens once, not twice.
- **No duplicate page render.** One server render emits both branches; CSS decides which is displayed.
  The hidden branch costs a little markup, not a second data fetch or a client round-trip.
- **No layout shift.** Visibility is decided by static Tailwind breakpoints at first paint — there is no
  JS measurement, no post-hydration swap, so nothing moves after load. CLS on the public scan route is
  unaffected: `/t/*` was never in scope and is untouched.
- **No request loop.** Nothing polls; the 30 s inbox refresh (D-3) is unchanged.
- **Public scan metrics unaffected.** No public route was modified.

## Re-baseline checklist (before quoting performance to anyone)

- [ ] Final production domain live, `NEXT_PUBLIC_SITE_URL` set to it.
- [ ] Speed Insights showing **field** p75 for LCP / INP / CLS over ≥ 1 week of real traffic.
- [ ] Realistic data volume in the target org.
- [ ] Re-run `npm run qa:staging:vitals` against production for a lab comparison point.
- [ ] Record device/network mix of the actual pilot users.
