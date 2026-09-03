# Phase C0 — Production Performance Baseline

**Branch `phase-c-performance`, cut from `pilot-credibility` @ `2bcf3f3` (clean).** Measured 2026-09-02.

C0 measures. It changes no product behaviour: no auth, query, schema, index, RPC, scan-logging,
notification, polling or loading-UI change was made.

---

## 1. Infrastructure facts

| Fact | Value | Evidence |
|---|---|---|
| Production domain | `https://mulemark.io` | serves 200 |
| **Vercel function region (production)** | **`pdx1` — Portland, Oregon** | `x-vercel-id: pdx1::pdx1::…` on every dynamic route, measured |
| **Vercel function region (staging)** | **`pdx1`** | same header on the Preview deployment |
| Deployed Node | **22.x** | `vercel inspect` → `nodeVersion` |
| Production deployment | `qr-asset-tags-oya1j7hs7…`, Ready, aliased to `mulemark.io` + `www` | `vercel ls --prod`, `vercel inspect` |
| Production Supabase ref | `apeiswnkheiwrpvumder` | `assertTarget` resolved it |
| Staging Supabase ref | `kwserenxwjxozztyigmw` | Preview-scoped env |
| Next / React / supabase-js | 16.2.9 / 19.2.4 / ^2.108.2 | `package.json` |
| Speed Insights | `@vercel/speed-insights` ^2.0.0 present in `app/layout.tsx` — **not collecting** | B1B: the browser never requests the script, verified on both environments |

**Operator verification required** (dashboard-only, not machine-readable — not guessed here):

| Fact | Where to read it |
|---|---|
| Production Supabase **region** | Supabase → project `apeiswnkheiwrpvumder` → Settings → General → Region |
| Supabase **plan / compute size** (both projects) | Supabase → Settings → Compute and Disk |
| Staging Supabase region | Supabase → project `kwserenxwjxozztyigmw` → Settings → General |
| Vercel **plan** and **Fluid Compute** status | Vercel → Project → Settings → Functions |
| Speed Insights enablement | Vercel → Project → Speed Insights |

DNS cannot answer the Supabase region: `apeiswnkheiwrpvumder.supabase.co` resolves to Cloudflare
(`172.64.149.246`, `104.18.38.10`), which fronts every project regardless of region.

**The measurements corroborate co-location behaviourally.** Per-query round trips implied by the route
timings are tens of milliseconds, not the 60–90 ms a cross-continent hop would cost. That is consistent
with the operator's Oregon claim but is *not* a substitute for reading the dashboard.

**The Oregon move remains unattributed.** No controlled before/after exists — there is no pre-move
Production measurement to compare against, and this baseline is the first. The operator's "feels
faster" stays an observation. **This document is that missing before/after's first half.**

---

## 2. Measurement method

Same method for both environments and for every future comparison.

- 2 warm-up navigations, **discarded**; then **10 measured warm** navigations per route per device class.
- Statistics: **median, p75 (nearest-rank), min–max range**. **No p95** — ten samples cannot support one.
- Device classes: mobile = Pixel 7 viewport at **4× CPU throttle**; desktop = 1280×720, unthrottled.
- Fresh page per sample; one signed-in context reused per class so login cost is not folded into route
  timings.
- Raw JSON + Markdown to `qa-artifacts/performance/` (gitignored).
- **Authenticated routes FAIL the run without credentials — they never skip.** The predecessor
  (`qa:staging:vitals`) emitted `skipped: no QA credentials supplied` as an ordinary row, so the routes
  most likely to be slow went unmeasured while the run still looked complete.

### The metric that matters, and the one that misleads

**Shell TTFB (`responseStart`) is not server work.** These pages stream, so the shell flushes almost
immediately: TTFB is **24–32 ms on every route**, including the slowest. Reporting it as "server
latency" would be actively misleading.

**Server stream = `responseEnd − requestStart`** — when the stream closed, i.e. when the server finished
every `await` in the page. That is the server-side number, obtained from Navigation Timing without
instrumenting the application.

Two harness defects were found and fixed **before** these numbers were accepted: navigation time
initially included the collector's fixed 2 s settle wait (inflating every route by ~2 s), and the region
column printed a raw request id for static responses. Both are corrected; the figures below are from the
corrected run.

---

## 3. Production route table — warm, 10 samples

Region `pdx1` on every dynamic route. `/` is `static/edge` (prerendered, no function).

| Device | Route | Role | Shell TTFB | **Server med** | **Server p75** | LCP med | LCP p75 | Nav med | Reqs |
|---|---|---|---|---|---|---|---|---|---|
| mobile | landing | anon | 28 ms | 35 ms | 39 ms | 210 ms | 460 ms | 420 ms | 21 |
| mobile | public scan | anon | 32 ms | **349 ms** | 374 ms | 646 ms | 744 ms | 401 ms | 19 |
| mobile | login | anon | 30 ms | 66 ms | 71 ms | 200 ms | 212 ms | 399 ms | 18 |
| mobile | dashboard | admin | 32 ms | 538 ms | 672 ms | 1100 ms | 1252 ms | 939 ms | 44 |
| mobile | assets | admin | 30 ms | **735 ms** | 778 ms | 1042 ms | 1116 ms | 940 ms | 45 |
| mobile | submissions | admin | 31 ms | 626 ms | 670 ms | 1020 ms | 1304 ms | 912 ms | **50** |
| mobile | rentals | admin | 32 ms | 402 ms | 410 ms | 828 ms | 948 ms | 782 ms | 32 |
| mobile | analytics | admin | 30 ms | 445 ms | 483 ms | 882 ms | 924 ms | 725 ms | 38 |
| desktop | landing | anon | 29 ms | 36 ms | 41 ms | 118 ms | 124 ms | 100 ms | 21 |
| desktop | public scan | anon | 31 ms | **356 ms** | 384 ms | 438 ms | 464 ms | 363 ms | 18 |
| desktop | login | anon | 30 ms | **62 ms** | 77 ms | 148 ms | 156 ms | 139 ms | 18 |
| desktop | dashboard | admin | 25 ms | 508 ms | 562 ms | 788 ms | 812 ms | 517 ms | 40 |
| desktop | assets | admin | 25 ms | **678 ms** | **793 ms** | 742 ms | 820 ms | 687 ms | 42 |
| desktop | submissions | admin | 24 ms | 542 ms | 575 ms | 726 ms | 744 ms | 549 ms | 45 |
| desktop | rentals | admin | 26 ms | 404 ms | 468 ms | 452 ms | 560 ms | 457 ms | 31 |
| desktop | analytics | admin | 27 ms | 424 ms | 461 ms | 722 ms | 756 ms | 448 ms | 43 |

### The natural experiment inside this table

`/login` is dynamic, renders the same shell machinery, and does **no auth and no data work**: **62 ms**.
That is the floor for a dynamic route in this deployment. Everything above it is auth plus data.

| Comparison | Delta | What it isolates |
|---|---|---|
| login 62 ms → rentals 404 ms | **+342 ms** | the shared authenticated floor **plus** the lightest page's own queries |
| rentals 404 ms → assets 678 ms | **+274 ms** | **Assets' extra queries alone** — the auth floor is identical on both |
| login 62 ms → public scan 356 ms | **+294 ms** | resolve + awaited scan log + documents + `getProfile()` |

The middle row is the cleanest attribution available without instrumentation: **274 ms of Assets' server
time is its own serial query chain**, because every other cost is common to both routes.

The shared authenticated floor is therefore **bounded above by 342 ms** and cannot be isolated more
precisely from the browser alone — both halves happen inside one request behind one response.

---

## 3b. Staging comparison — public routes only, authenticated coverage FAILED

Same harness, same method, same region (`pdx1`).

| Device | Route | Shell TTFB | Server med | LCP med | Nav med | Reqs |
|---|---|---|---|---|---|---|
| desktop | landing | 36 ms | 38 ms | 218 ms | 212 ms | 21 |
| desktop | public scan | 34 ms | **118 ms** | 460 ms | 163 ms | 13 |
| desktop | login | 30 ms | 71 ms | 186 ms | 162 ms | 18 |

**The staging run exited 1 with 4 failures: browser sign-in timed out on both device classes, so no
authenticated staging route was measured.** The harness did exactly what it was built to do — it
**failed** rather than emitting a "skipped" row that would have let the run look complete.

**The credentials are not the cause.** `npm run staging:qa-password -- --verify-only`, run immediately
afterwards, reported **4/4 logins succeeding** through the real anon-key sign-in path, with every profile
and organization active. So the fault is in this harness's browser sign-in against the Preview
deployment — most likely the deployment-protection bypass not carrying through the sign-in POST — and
**not** in staging, the credentials, or the product. It is **not yet isolated**, and is recorded as an
open harness defect rather than explained away.

**This does not weaken the Production baseline**, which is the C0 deliverable and completed with
**0 failures and 0 skips** across all 16 route/device groups.

**Do not compare the staging and Production scan numbers.** Staging's public scan is 118 ms against
Production's 356 ms, but the two QA assets hold different content (13 requests vs 18) and sit on
different projects with different data. The gap is a data difference, not an environment finding.

## 4. Request-count table

| Route | Requests (median) | Note |
|---|---|---|
| login | 18 | baseline |
| public scan | 18–19 | zero webfonts by design |
| rentals | 31–32 | |
| analytics | 38–43 | |
| dashboard | 40–44 | |
| assets | 42–45 | |
| **submissions** | **45–50** | highest — per-row signed URLs plus row-link prefetch |

Submissions carries ~30 more requests than login for one page view.

---

## 5. Cold candidates

**Not collected in this run.** The measured samples are all warm, and no idle period was observed or
recorded, so nothing here may be labelled a cold start — not even a candidate. Recorded as a gap rather
than estimated.

## 6. Action latency

**Not measured in C0.** The harness measures navigation; action instrumentation (click → pending →
response → final content, plus background email and scan-event completion) is not built. Acceptance
check 9 is therefore **not met by C0**, and this is stated rather than papered over. It is the first
task of whichever slice runs next.

## 7. Vercel function-duration comparison

**Not collected.** Server time is measured client-side via stream close, which is a good proxy but
includes network transit. Correlating specific requests with Vercel function logs is outstanding; the
harness records `x-vercel-id` per sample precisely so that correlation is possible later.

## 8. Supabase query evidence

**Not collected in C0.** No index was added, no query was restructured.

## 9. Speed Insights field data

**None.** Speed Insights is present in `app/layout.tsx` but **not collecting** (B1B finding, unchanged).
There is no field evidence for any route. Everything in this document is **lab evidence** from one
machine and one network, and must not be quoted as field performance.

---

## 9b. Server-phase attribution — measured on Production

Instrumentation enabled on Production (`MULEMARK_DIAGNOSTIC_TIMING=1`, deployment `as1bfta71`,
commit `9e07773`), then an authenticated pass driven through the baseline harness.
Collected with `npm run perf:timing:production`.

| Phase | samples | median | min | max |
|---|---|---|---|---|
| `auth.session` (`auth.getUser()`) | 216 | **57.0 ms** | 41.0 | 104.5 |
| `auth.profile` (`profiles` select) | 16 | **51.0 ms** | 44.7 | 57.0 |
| `auth.org_status` (`organizations` select) | 16 | **38.4 ms** | 34.1 | 42.6 |
| `nav.submission_count` | 8 | **49.9 ms** | 36.9 | 62.9 |
| `scan.record` (public scan) | — | **71–104 ms** | | |

`auth.session` has far more samples than the others because it also fires on anonymous traffic, where
`getUser()` returns null and no profile query follows.

### The duplication, observed rather than reasoned about

Phase occurrences within a single log entry hold a stable ratio:

| Phase | relative occurrences |
|---|---|
| `auth.session` | **3** |
| `auth.profile` | **2** |
| `auth.org_status` | **2** |
| `nav.submission_count` | **1** |

That is exactly the predicted shape: `getUser()` three times (proxy, layout, page), `profiles` and
`organizations` twice each (layout `requireActiveOrg()` and page `requireOrgContext()`), and the nav
count once.

**One honest qualification.** The raw counts per log entry were 12 / 8 / 8 / 4 — a clean 4× of the
ratio above, which means Vercel batched roughly four requests into each entry. **The ratio is the
finding; the absolute per-request counts are not**, and are not claimed here.

### What C1 could actually recover

The proxy's `getUser()` runs in a **separate invocation** and cannot be deduplicated with the render.
What *is* duplicated is the layout↔page pair:

| Duplicated work | Cost |
|---|---|
| 1 × `auth.session` | 57 ms |
| 1 × `auth.profile` | 51 ms |
| 1 × `auth.org_status` | 38 ms |
| **Recoverable total** | **≈146 ms per authenticated request** |

Against server times of 404–735 ms, that is **20–36 %** of server time on the lighter routes — a real
result, and one C0 could only bound at "≤342 ms including page data" before this measurement.

**Caveats.** Taken with instrumentation enabled, so each phase carries a small `console.info` cost;
absolute route timings from this pass are marginally inflated and the §3 baseline remains the reference.
`auth.profile`/`auth.org_status` rest on 16 samples each. And ~146 ms is what the *duplication* costs —
not a promise that C1 recovers all of it, since `cache()` dedupes within a render but the first call
still pays full price.

## 10. Top three measured bottlenecks

**1. The Assets serial query chain — 274 ms, isolated.**
`app/(admin)/dashboard/assets/page.tsx` has **8 sequential awaits and zero `Promise.all`**. The
rentals→assets delta attributes 274 ms to it with the auth floor held constant. Highest-confidence
finding in this document.

**2. Repeated identity work on every authenticated render — ≈146 ms recoverable, NOW ISOLATED (§9b).**
There is **no `cache()` anywhere in the repo**, so one authenticated render performs roughly
**3 × `auth.getUser()`** (proxy, layout, page), **2 × `profiles`**, **2 × `organizations`**, plus the
AppShell submission count — largely serial, before the page's own queries. `getProfile()` and
`ownOrgActive()` each run twice: once in `(admin)/layout.tsx` via `requireActiveOrg()`, once in the page
via `requireOrgContext()`. Layout↔page duplication is dedupable; the proxy call is a separate runtime
invocation and is not.

**3. The public scan path — 294 ms above the dynamic floor, of which `scan.record` is 71–104 ms (§9b).**
`app/t/[shortCode]/page.tsx` runs resolve → **`await recordScan`** → documents → `getProfile()`, all
serial. Scan logging is `await`ed before the page renders, on the product's most latency-sensitive
route, and now measures **71–104 ms** — roughly a third of the excess, and entirely off the critical
path if it were not awaited.

## 11. Top three perceived-responsiveness issues

1. **Mobile authenticated LCP 1.02–1.10 s** against a 1.0 s target — at the line, and every route hits
   the same shared floor first.
2. **Submissions issues ~50 requests** for one view, and polls a full-page `router.refresh()` every 30 s
   while visible **whether or not anything changed**. Hidden tabs already stop cleanly, so the
   "zero requests when hidden" budget is **already met** — the gap is the visible-idle case.
3. **Action feedback is unmeasured**, so "feels inert" cannot currently be confirmed or denied.

---

## 12. Provisional budgets — confirmed or revised

| Budget | Provisional | Measured | Verdict |
|---|---|---|---|
| Public scan warm TTFB < 500 ms | ✓ | 31 ms shell / **356 ms server** | **Revise the metric.** TTFB is meaningless here; restate as **server stream < 500 ms** — currently met. |
| Public scan LCP < 1.5 s | ✓ | 438 ms desktop / 646 ms mobile | **Met.** Keep. |
| Warm route navigation < 1.0 s | ✓ | 100–940 ms | **Met**, but mobile authenticated sits at 782–940 ms — little headroom. Keep. |
| No warm route > 2.0 s | ✓ | max 940 ms | **Met.** Keep. |
| Hidden tabs: zero polling | ✓ | already implemented | **Met.** Keep. |
| Visible idle: no unconditional full refresh | ✓ | **not met** — 30 s unconditional `router.refresh()` | Keep as a target. |
| No repeated identical profile/org query per render | ✓ | **not met** — 2× profile, 2× org | Keep as a target. |
| Immediate visual response < 150 ms / pressed feedback < 100 ms | ✓ | **unmeasured** | Keep; measure before judging. |

**Recommended budget addition:** *server stream median < 500 ms on every authenticated route.* Assets
(678 ms) and, at p75, dashboard and submissions currently exceed it. It is measurable with the harness
that exists, unlike a "page speed" number.

---

## 13. Slices recommended, by the Part I decision rules

| Slice | Rule | Decision |
|---|---|---|
| **C2 — Assets serial path** | recommend only if materially serial | **RUN FIRST.** 8 serial awaits, 274 ms isolated. Highest confidence, smallest blast radius. |
| **C1 — repeated auth/profile/org** | recommend only if material | **RUN — now isolated (§9b): ≈146 ms per authenticated request is duplicated layout↔page work, and the 3:2:2:1 phase ratio was observed directly. Material by any reading. Ranks alongside C2.** |
| **C3 — Submissions serial path** | recommend only if materially serial | **RUN.** 7 serial awaits, 542–626 ms, highest request count. |
| **C5 — awaited scan logging** | only if it materially delays the public page | **RUN — now isolated (§9b): `scan.record` is 71–104 ms, awaited before render on the scan route. Material.** |

| Slice | Decision |
|---|---|
| **C4 — per-row signed URLs** | **DEFER.** Submissions' request count implicates it, but the per-row cost was never isolated. Fold the measurement into C3; run C4 only if it survives. |
| **C6 — notification in the form path** | **DEFER.** Structurally real (`await notifySubmission` before redirect) but **action latency was never measured**, so the rule's condition is unproven. Measure first. |
| **C7 — polling** | **NARROW.** Hidden-tab polling is already correct. Only the visible-idle unconditional refresh is in scope. Low value; run after C1–C3. |
| **C8 — perceived inertness** | **DEFER** until action latency exists. |
| **C9 — database/indexes** | **SKIP.** C1–C3 have not been attempted; no hot query has been shown. Adding indexes now would be speculative — explicitly forbidden. |

---

## 14. Risks and unknowns

- **Lab only, one machine, one network.** No field data exists anywhere.
- **Server time is measured at stream close**, which includes network transit; it is a proxy for
  function duration, not function duration itself.
- The **shared auth floor is bounded, not isolated** — the ≤342 ms figure includes rentals' own queries.
- **Cold behaviour is entirely unmeasured.**
- **Action latency is entirely unmeasured**, which is why C6 and C8 are deferred rather than ranked.
- Production carries only **3 organizations** (2 demo + the QA fixture) and small tables. **These
  timings are a floor; they will not hold at customer data volume.**

## 15. Production QA fixtures (operator-approved)

Created by `npm run production:seed-qa` — additive and idempotent; it never deletes or updates anything
it did not create. A second run confirmed it creates nothing.

| | |
|---|---|
| organization | `c0000000-0000-4000-8000-00000000c0a1` — "Mulemark Production QA — test data, not a customer" |
| asset | `c0000000-0000-4000-8000-00000000c0a2` — `PROD-QA-PERF` |
| short code | `prod-qa-perf-probe` → `https://mulemark.io/t/prod-qa-perf-probe` |
| QA login | `qa.perf@mulemark-production.invalid` (password in the ignored `.env.production-perf.local`, never printed) |

**Retention:** permanent, so the baseline stays repeatable across C1–C9. To remove: delete the
organization row (children cascade) and the auth user.

**Two consequences, stated not buried:** the QA asset has QR coverage so it **counts as a covered asset**
in the commercial model; and each measured scan writes a `scan_events` row — **to this asset only**.

## 16. Instrumentation — ENABLED on Production

`lib/diagnostics/server-timing.ts` is **disabled by default in code** and is now **switched on in the
Production runtime** (`MULEMARK_DIAGNOSTIC_TIMING=1`, operator-approved) so §9b could be measured.
It is wired into six phases: proxy session, `getProfile`'s session + profile read, `ownOrgActive`'s
org read, the nav badge count, and the awaited scan write. Assets is deliberately not instrumented —
its 274 ms is already isolated by the rentals→assets delta, and per-query wrapping belongs to C2.

**To retire it:** remove `MULEMARK_DIAGNOSTIC_TIMING` from Production and redeploy (env changes need a
redeploy to reach the runtime). The code then goes inert with no further change.

### A failure worth remembering

The flag was set, every listing showed it present, and nothing was emitted. The value had been piped in
from a shell, which appends a newline — CRLF on Windows — and the check was a strict `=== "1"`. A stored
`1
` fails that silently: no error, no warning, just a diagnostic that does nothing while appearing
configured. It cost a deploy cycle. Fixed with `.trim()` plus a regression test over `"1
"`, `"1
"`,
`" 1 "`, `"	1"` (and `"11"` still false, so trimming did not loosen the check), and the variable
re-added as `--type config` so its value can be read back — a write-only diagnostic flag cannot be
debugged when it misbehaves.

Also confirmed during deployment, because it was a real hazard: `vercel promote` on a Preview reports
*"A new deployment will be built using your production environment"* — it **rebuilds** rather than
aliasing, so a Preview build's inlined `NEXT_PUBLIC_*` (staging Supabase, staging site URL) never
reaches `mulemark.io`. Aliasing one would have been an incident.

The original description follows.

`lib/diagnostics/server-timing.ts` was added and is **disabled by default**. It
logs one structured line per phase, carries a closed union of phase names, accepts no ids/names/emails/
form text/URLs, returns its wrapped value unchanged, and propagates rejections untouched. Enabling it
needs `MULEMARK_DIAGNOSTIC_TIMING=1` and a redeploy — **an operator decision, not taken in C0**.

It exists because the browser evidence bounded the auth-versus-page-data split but could not isolate it,
and C1 should not begin by guessing.
