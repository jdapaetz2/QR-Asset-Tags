# Phase C0 — Production Performance Baseline

**Branch `phase-c-performance`, cut from `pilot-credibility` @ `2bcf3f3` (clean).** Measured 2026-09-02.

> **Phase C is CLOSED (C10, 2026-09-09).** The verdicts, the Production re-baseline and the honest
> limits are in [`PHASE_C_PERFORMANCE_READINESS.md`](PHASE_C_PERFORMANCE_READINESS.md). This document
> remains the working evidence log for C0–C9.1 and is not superseded as a record.

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

**Not measured in C0 — measured in C6.** See §9h and `scripts/perf/form-action.mjs`. The original C0
text is kept below because the gap it records is what C6 had to close first.

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

## 9c. C1 result — deduplication proven; latency win NOT demonstrated

Deployed to Production as `eurgffcyh` (commit `a5ab581`), then re-measured with the same harness.

### Call counts — the acceptance evidence

| Phase | C0 ratio | C1 ratio |
|---|---|---|
| `auth.session` | 3 | **2** |
| `auth.profile` | 2 | **1** |
| `auth.org_status` | 2 | **1** |
| `nav.submission_count` | 1 | 1 |

Exactly as designed. Sample counts over a comparable window corroborate it independently:
`auth.profile` 16 → **8**, `auth.org_status` 16 → **8** — the same traffic doing half the calls.

**Two database round trips and one auth round trip are removed from every authenticated render.**
The remaining `auth.session` is the Proxy's, which no render-scoped cache can reach.

### Wall-clock — inconclusive, and not claimed

**The control routes moved, which invalidates a straight before/after.** `/login` does no auth and no
data work; the landing page is static. Both got slower between runs:

| Control | C0 | C1 | Δ |
|---|---|---|---|
| `/login` server (desktop) | 62 ms | 102 ms | **+40** |
| landing server (desktop) | 36 ms | 53 ms | **+17** |
| shell TTFB (all routes) | 25–31 ms | 44–51 ms | **+~20** |

Static content cannot have been slowed by an auth change, so the environment itself shifted — network,
machine load, or platform variance. Authenticated routes moved −33 ms to +52 ms, which is inside the
band the controls themselves demonstrate. **No latency improvement is claimed from this run.**

### Why the saving may genuinely be smaller than 146 ms

C0's ≈146 ms assumed the duplicated calls were **serial**. They may not be: Next.js renders the layout
and the page as one React tree, and React can work on them concurrently. If the layout's
`requireActiveOrg()` and the page's `requireOrgContext()` overlapped in time, two 51 ms profile reads
cost ~51 ms of wall-clock, not 102 ms — so removing one halves the *work* while saving little *latency*.

That is a hypothesis, not a measurement, and it is recorded as one. It would explain the result without
requiring the call-count evidence to be wrong.

### What this means for the change

Duplicate reads are **provably** gone: fewer queries, fewer auth calls, less database load per request.
That benefit is real and grows with concurrency and data volume, neither of which this single-client lab
run exercises. What is *not* demonstrated is a faster page for one user on a quiet system.

**DECIDED (operator, 2026-09-03): keep, on resource grounds. The latency claim stays withheld.**

The change removes provably duplicated work with unchanged semantics, and that benefit grows with
concurrency and data volume — neither of which a single-client lab run exercises. Reverting it because
ambient latency drifted would have been the wrong call.

What must not follow from that decision: **C1 may not be cited as a page-speed improvement.** No such
result was measured. If a latency figure is ever needed, it requires a controlled A/B — both
deployments measured in the same minutes on the same machine — not this run.

## 9d. C2 result — Assets parallelization, measured cleanly

C1's comparison was inconclusive because the control routes drifted. C2 was measured in **two deploys
with the same instrument**, which removes that problem: deploy A added the group timer around the
*still-serial* reads, deploy B parallelized them.

### Server-side group duration — the direct measurement

| | `page.primary_queries` median |
|---|---|
| Serial (deploy A, `fa572c3`) | **395.9 ms** (324–730) |
| Parallel (deploy B, `2bd8d87`) | **86.3 ms** (58.7–290) |
| **Change** | **−310 ms, −78 %** |

### Route level, with controls that held this time

| Route | Serial | Parallel | Δ |
|---|---|---|---|
| **assets** (changed) | **627 ms** | **391 ms** | **−236 ms (−38 %)** |
| assets p75 | 665 ms | 409 ms | −256 ms |
| dashboard (control) | 530 ms | 529 ms | −1 ms |
| submissions (control) | 537 ms | 526 ms | −11 ms |
| analytics (control) | 423 ms | 414 ms | −9 ms |
| rentals (control) | 363 ms | 327 ms | −36 ms |
| login (control, no auth) | 66 ms | 59 ms | −7 ms |
| landing (control, static) | 32 ms | 28 ms | −4 ms |

**Unchanged routes moved −1 to −36 ms; Assets moved −236 ms.** That is an order of magnitude outside
the drift the controls demonstrate, so unlike C1 this result is attributable.

LCP was roughly flat (684 → 698 ms), which is expected: LCP is dominated by client rendering after the
stream, and C2 shortens the server half. Request count and row count are unchanged — the same reads
return the same rows.

### Why the group drop exceeds the route drop

−310 ms in the group versus −236 ms on the route. The route total also carries auth, render and network
transit, none of which C2 touches, plus ordinary run-to-run variance. The group number is the cleaner
measurement of what actually changed.

### Error semantics were fixed as part of this

Every read was `const { data } = await …` then `data ?? []`, so a failed `assets` query rendered as
"no assets" — a page confidently stating something false, indistinguishable to an operator from an
organization that owns no equipment. Parallelizing eight silently-failing reads would have made that
worse, so it was fixed here: the essential read throws to a new `assets/error.tsx`, secondary reads
degrade and log route + read + Postgres **code** (never the message, which quotes database internals,
and never row data or search terms).

### A measurement-tool defect worth recording

`perf:timing:production` capped its log query at 200 lines. `auth.session` fires on anonymous traffic
too and produces an order of magnitude more lines than any other phase, so it saturated the limit and
silently dropped `page.primary_queries` — which briefly looked like the instrumentation had failed.
Raised to 1000. A truncating measurement tool that reports nothing looks identical to a broken system.

### Left alone, deliberately

- `getCoveredCount` re-reads `qr_links`, already fetched by the batch. One query out of eight running
  concurrently — no measurable wall clock — against rewiring a commercial number.
- **Unbounded loading**: the route reads every asset, QR link, equipment page, active session and
  unresolved submission in the organization, with no `limit`. A genuine scale risk, but C0 did not
  measure it as the current latency source (production holds 3 organizations and small tables), so no
  pagination was smuggled into C2. It needs its own approved scope.

## 9e. C3 result — Submissions parallelization

Two deploys, one instrument, as in C2. Deploy A (`c3cc059`) wrapped the still-serial group; deploy B
(`839670b`) parallelized six of the seven reads.

### Server-side group duration

| | `page.primary_queries` (submissions) |
|---|---|
| Serial (deploy A) | **248.5 ms** (195.6–407.6, n=12) |
| Parallel (deploy B) | **82.3 ms** (59.5–124.8, n=20) |
| **Change** | **−166 ms, −67 %** |

### Route level

| Route | Serial | Parallel | Δ |
|---|---|---|---|
| **submissions** (changed) | **531 ms** | **351 ms** | **−180 ms (−34 %)** |
| submissions p75 | 562 ms | 405 ms | −157 ms |
| submissions LCP | 728 ms | 436 ms | −292 ms |
| dashboard (control) | 552 ms | 530 ms | −22 ms |
| assets (control, C2 already applied) | 387 ms | 380 ms | −7 ms |
| analytics (control) | 441 ms | 414 ms | −27 ms |
| login (control, no auth) | 81 ms | 63 ms | −18 ms |
| landing (control, static) | 36 ms | 32 ms | −4 ms |
| **rentals (control)** | 344 ms | **490 ms** | **+146 ms** |

**The group drop (−166 ms) and the route drop (−180 ms) agree to within 14 ms.** They measure the same
thing from opposite ends — one inside the server, one from the browser — so their agreement is the
strongest evidence here, stronger than either number alone.

**One control went the wrong way and is reported, not hidden.** `/dashboard/rentals` rose 146 ms, with
its range widening from 332–504 ms to 400–900 ms. Nothing in C3 touches that route. It is most likely a
slow or contended instance during the second run. It does not undermine the result — the changed route
moved −180 ms while five other controls moved −4 to −27 ms, and the independent group measurement
agrees — but a control moving that much means this run was noisier than C2's, and the conclusion rests
on the group number rather than the route number.

Browser request count moved 43 → 47. No query was added; that count includes client prefetches and
varies run to run.

### What is dependent, and stayed that way

Signed thumbnails cover only the **post-filter visible rows**, so signing cannot start until
search/media/attention filtering has run. Batch of six, then filtering, then signing — the dependency is
real and preserved. This is the structural difference from C2, where all eight reads were independent.

### Export flags fail closed

Every other secondary read may degrade to empty. This one may not: if the flags row is unreadable,
`toExportFlags(null)` yields every flag false, so the button and the route both deny. A read failure
must never grant access it could not confirm. Covered by `lib/export/access.test.ts` and
`lib/export/types.test.ts`.

### Deliberately not done

- **The AppShell double count.** `countNewSubmissions` runs twice per request on this route — once in
  the layout's nav badge, once in the page (46–75 ms). Dedupable with the same `cache()` C1 used, but
  the fix is in shared layout code touching **every** authenticated route. C1 already deferred AppShell
  to C8; widening C3 to save one count would be scope creep. **C8.**
- **In-memory filtering.** `matchesSearch` spans joined asset fields **and the computed
  `SUB-YYYY-XXXXXX` reference**, which is derived in application code and has no column to filter on;
  the media test is a jsonb-array length check. Moving either into PostgREST risks changing which rows
  match. Left alone.
- **Unbounded row loading**, no `limit`. Same scale risk as Assets, same reasoning: not measurable at
  current volume, needs its own scope.

### The measurement's real limit

The Production QA organization holds **effectively no submissions**. So C3 demonstrates round-trip
elimination and nothing else — it says nothing about how this route behaves under real submission
volume, where the unbounded row load and the in-memory filtering are the things that would matter.
**These numbers must not be quoted as evidence that the inbox scales.**

## 9f. C4 result — signed-media URL batching

### What this section can and cannot claim

C2 and C3 each carried a measured latency win because there was real work to parallelize. **C4 does
not, and the reason is stated first so no later reader mistakes silence for a result.** The Production
QA organization holds effectively no submission media and no hosted documents, so at current data
volume there is nothing to sign — the two-deploy method that made C2 and C3 attributable would compare
zero against zero. **No latency number from this environment may be quoted as a C4 speed-up.**

C4 therefore proceeds on the second clause of the C0 gate — "an obvious bounded N+1 risk on visible
lists/evidence pages" — and its claim is structural and test-proven, not measured:
**N Storage round trips per call site become 1.**

### The inventory, and the one that mattered

| Call site | Bucket | Before | After |
|---|---|---|---|
| `lib/submissions/media.ts#signMediaPaths` (4 evidence/detail callers) | `submissions` | N parallel | **1** |
| Submissions inbox thumbnails | `submissions` | N parallel | **1** |
| Dashboard attention thumbnails | `submissions` | N parallel | **1** |
| Asset documents | `documents` | N parallel | **1** |
| **Public documents (`/t/[shortCode]`)** | `documents` | **N SEQUENTIAL, in a `for` loop** | **1** |

The public-documents loop was the only *serial* N+1 in the product, and it sat on the scan page — the
route a renter reaches from a physical tag, measured in C0 at 356 ms server with 294 ms above the
dynamic floor. It was not in the C0 priority list; it was found by taking the inventory rather than
trusting it. Every other site at least issued its N requests concurrently.

`grep -rn "createSignedUrl(" app/ lib/` now returns nothing: no per-path call site remains.

### Security is unchanged, deliberately

`createSignedUrls` (plural) exists in the installed `@supabase/storage-js` **2.108.2** — verified in
`dist/index.d.mts`, not assumed from a different SDK version — and requires the same `objects: select`
permission as the single-path call. The helper takes the caller's **RLS-scoped** client, never the
service-role client, so a path the caller cannot read still does not get signed. The bucket stays
private, the TTL stays at the existing 3600 s, nothing is cached beyond the call, no path is signed
before the visible-row filter, and no raw storage path reaches a response.

**Results are mapped by returned `path`, never by array index.** The response type is
`{ error, path: string | null, signedUrl: string | null }[]` and nothing in its contract promises input
order. Index alignment would have passed every test written against an ordered stub and could have
handed one row the signed URL for another row's private photo — rows that may belong to different
assets. A test asserts correct mapping against a deliberately reordered response.

Logging takes counts and a call site as numbers and a literal, never the values: a storage path
identifies a private object and encodes the owning organization, and a signed URL *is* an access
credential for its TTL. A test asserts no path and no URL fragment appears in the log line.

### A build failure worth recording

Marking the helper `server-only` broke the build — correctly. `lib/public/documents.ts` is imported by
`public-scanner-view.tsx` for `findDocumentHref` and `isDocumentOpenable` as **runtime values**, so it
is part of the scan page's *client* bundle, and the new import pulled a server-only module into a
Client Component graph. The fix was to split the Supabase read and signing into
`lib/public/documents-server.ts` and leave the pure helpers client-safe. Turbopack caught a layering
mistake that no test would have; the split also stops shipping that function's code to the browser on
`/t/`, where the standing rule is no new client JS.

### Evidence

13 unit tests in `lib/storage/signed-urls.test.ts`, including: many paths signed in **exactly one**
call with the per-path method **never** invoked; empty input performs no I/O at all; de-duplication and
trimming before the request; TTL passed through unchanged; stable mapping under a reordered response;
an uninvited response entry ignored rather than widening the map; per-entry error, whole-call error,
thrown transport error and an omitted path each resolving to explicit `null`; and the two logging
assertions above. `lib/submissions/media.test.ts` was updated to the batch contract and now also
asserts the single call.

`null` is the point of the return shape: it renders as "unavailable" and cannot be mistaken for a
usable URL, unlike a raw path or an empty string. A partial signing failure never produces a broken or
unauthorized link, and never takes down an otherwise healthy page.

Gates: lint, typecheck, **1213 unit tests**, build, **79 security/RLS tests**, **68 E2E** — all green.
The `media.signed_urls` timing phase now wraps the inbox signing, so the duration will be recorded
once real media exists.

## 9g. C5 result — deferred scan logging, and a corrected estimate

### The headline, stated before the tables

The change works and is safe: the `scan_events` insert no longer blocks the renter's page, the record
still lands, exactly once, correctly attributed. **But the win on Production is much smaller than C0
predicted, because C0's estimate of the write's cost was too high.** §9b put `scan.record` at
71-104 ms. Measured on Production today, with the same instrument, it is **28.9 ms**. Deferring a
29 ms write cannot save 100 ms, and the route measurement agrees that it did not.

### Production, before and after (one promotion, same harness)

| Route | Before | After | Δ | control-adjusted |
|---|---|---|---|---|
| **public scan, desktop** | **307 ms** | **290 ms** | **−17 ms** | **≈ −27 ms** |
| **public scan, mobile** | **347 ms** | **274 ms** | **−73 ms** | **≈ −60 ms** |
| public scan LCP, desktop | 438 ms | 448 ms | +10 ms | flat |
| public scan LCP, mobile | 744 ms | 590 ms | −154 ms | noisy, see below |

Controls (desktop) drifted **+10 ms** on average across the run — dashboard 559→546, assets 398→382,
submissions 368→410, rentals 310→342, analytics 375→397, login 63→58 — which is what the
"control-adjusted" column subtracts.

**The desktop figure is the one to trust.** −27 ms adjusted matches the 28.9 ms the write actually
costs, which is the strongest possible internal consistency check: the route got faster by exactly the
thing that was removed from it. The mobile drop is larger than deferral alone can explain and rests on
n=10 with a visibly wider LCP range; it is reported, not claimed.

### Server phases on Production, after

| Phase | median | on the response path? |
|---|---|---|
| `page.primary_queries` (resolve) | **128.3 ms** | yes — essential |
| `page.secondary_queries` (documents ‖ profile) | **30.4 ms** | yes — essential |
| `scan.record` | **28.9 ms** | **no — now runs after the response** |

### Staging A/B — deploy A serial, deploy B changed, deployment-scoped

| Phase | A (serial) | B (deferred + parallel) |
|---|---|---|
| `page.primary_queries` | 467.3 ms | 463.5 ms |
| `page.secondary_queries` | 252.5 ms | 269.3 ms |
| `scan.record` | 103.8 ms **blocking** | 123.5 ms **after the response** |

Route level (staging desktop): **1042 ms → 960 ms (−82 ms)** against ~+9 ms control drift. Staging's
database is slower, so its insert costs ~104 ms there and the saving is correspondingly larger. **The
size of this win is simply the cost of the write in that environment** — which is the honest general
statement, and the reason the Production and Staging numbers differ without either being wrong.

### The parallelization delivered nothing measurable, and here is why

`page.secondary_queries` did not improve — 252.5 → 269.3 ms on staging, i.e. noise in the wrong
direction. The cause is visible in the data: on `/t/`, `auth.session` runs in **0.1-0.5 ms**. An
anonymous renter carries no session cookie, so `getProfile()` returns without a network call, and
`Promise.all([documents, profile])` is just `documents` with extra syntax.

It is not wasted — a signed-in staff viewer *does* pay for the profile read, and for them the two reads
now overlap. But **for the renter, the population this route exists for, the parallelization is worth
approximately zero**, and no part of the measured improvement should be attributed to it.

### Reliability — 20 scans on a disposable staging QR

`npm run staging:scan-reliability -- --confirm --scans=20`, fail-closed on both the credential target
and the site URL, creating and then removing its own organization:

| Check | Result |
|---|---|
| scans returning a rendered page | **20 / 20** |
| scan events recorded | **exactly 20** — no loss, no duplicates |
| distinct rows | 20 unique ids |
| attribution (asset / QR / organization) | **20 / 20** |
| `ip_hash` hashed-or-absent, never an address | **0 suspect** |
| **appearance delay after the last scan** | **291 ms** |

E2E adds the same guarantee deterministically in CI against a real production build
(`tests/e2e/public/scan-logging.spec.ts`): N scans → exactly N rows, and an unavailable tag records
nothing at all.

### Confirming `after()` actually runs after the response

Three independent signals, because one would not settle it: the `scan.record` phase is still emitted on
Production (the callback executes); the rows land, 20/20, on staging (the work completes); and the
server stream closes ~29 ms sooner (the work is no longer inside the response). Row-level verification
was run on **staging only** — confirming rows on Production would require production database reads
beyond this phase's read-only timing scope.

### Two measurement failures worth recording

**The exactly-once test was vacuous, and a mutation proved it.** The first version reset the module
between "requests" via `vi.resetModules()` — which also resets a module-level `let`, so a global-latch
bug passed cleanly. Replacing the request-scoped latch with `const globalLatch = {…}` was still green.
The mock was rewritten to model request scopes *within one module instance*; the same mutation now fails
three tests. A test that cannot fail is worse than no test, because it is counted as protection.

**`vercel logs --environment preview` blends every preview deployment.** The first deploy-A medians
carried deploy-B traffic. `collect-timing.mjs` now takes `--deployment=<url>` and filters server-side,
so each side of an A/B is measured alone. Separately, the 1000-entry limit **saturates on
`auth.session`** — the C0 lesson recurring one size up: the first Production collection showed *no*
scan phases at all and looked exactly like broken instrumentation, when the phases had simply been
truncated out. Deployment scoping plus a tight window is what made them appear.

### What this leaves as the scan route's real cost

`page.primary_queries` is now **128 ms of the ~290 ms**, and it is the resolver's four sequential
queries: `qr_links` → `assets` → `equipment_pages` → `organizations`. Only the first is a genuine
dependency — the asset id is needed before the rest. **The last three could run together.** That is the
next real bottleneck on this route, and it is recorded here rather than acted on, because it is not C5.

## 9h. C6 result — deferred notification delivery, and what the numbers do and do not support

### The gate was not met, so C6 built the missing measurement first

C6's condition was that C0 had measured notification handling as material. **It had not.** §6 records
action latency as *"Not measured in C0 … the first task of whichever slice runs next"*, §13 defers C6
for that reason, and `notify.send` had sat declared-but-unwired in the `TimingPhase` union since C0.
Deploy 1 wired it and added `scripts/perf/form-action.mjs`, the action harness C0 never built.

### Part A — the live path, measured

| | Staging (Preview → dry-run) | Production (live Resend) |
|---|---|---|
| `notify.send` | **0 ms** (n=11) | **178.7 ms** median, 153.8–287.4 (n=10) |
| outcomes | dry_run | **10 / 10 `sent`** |
| POST, no media | 1720 ms | **1010 ms** |
| click → confirm | 2389 ms | **1261 ms** |

Staging's 0 ms is itself a finding: **Preview makes no provider request at all**, so staging can never
measure this path — the environment rule refuses before a credential is read. The live numbers required
setting the Production QA organization's recipient to Resend's sandbox `delivered@resend.dev`
(operator-approved, reversible, and **cleared again afterwards** — `npm run production:qa-recipient`).

**Inbox arrival delay was NOT measured.** The sandbox recipient accepts and simulates delivery; no human
inbox is involved. Stated, not estimated.

### The decision, and an honest account of what decided it

The rule was pre-committed **before** any number arrived: choose B if the worst case remains reachable
on the renter's success path. It does, *by construction* — 3 attempts × an 8 s timeout under a 15 s
budget — so **the rule was determinative before the measurement existed**, and the measurement's real
job was to size the win. That is said plainly rather than presenting the numbers as though they made
the choice.

The tail is now **verified rather than asserted**: `lib/notifications/send.test.ts` drives a stalled
provider and shows a single send consuming **≥ 8 s** of the caller's request. Awaited, every one of
those milliseconds was spent in front of a renter whose submission was *already committed*.

**Path C was never on the table.** `EMAIL_DELIVERABILITY_RUNBOOK.md` had already decided against a
durable notification table. Reopening that inside a latency phase is exactly the smuggling Part E
forbids.

### Part F — before and after on Production

| No-media submission | Before | After (2 runs) | Δ |
|---|---|---|---|
| POST duration | **1010 ms** | **577 ms / 488 ms** | **≈ −480 ms** |
| click → confirmation | **1261 ms** | **847 ms / 690 ms** | **≈ −490 ms** |

**How much of that is C6, honestly.** The removed work is `notify.send` (**179–202 ms**, measured) plus
two service-role reads inside `notifySubmission` — the organization's settings and the asset — which
`notify.send` does not cover and which run ~32 ms each on this project. **That accounts for roughly
250–270 ms.** The remaining ≈ 210 ms is **not attributed**: before and after were measured ~40 minutes
apart on shared infrastructure with no interleaved control on this route. **The defensible claim is
≈250–270 ms off the renter's confirmation, not 480 ms**, plus the removal of a ≥ 8 s tail.

**The small-media shape was not measured after the change.** Both attempts were fully rate-limited —
public intake allows only 3 media submissions per minute and 15 per hour, and the before-run had already
spent most of the hour's allowance. It is recorded as not measured; the no-media shape is the
comparable pair.

### Reliability after deferral — the check that mattered most

Re-measured on the promoted deployment: **6 submissions → 6 `notify.send` phases → 6 `sent` outcomes.**
One notification per submission, none lost, none duplicated, provider ids and structured logs intact.
`after()` demonstrably executes post-response on Vercel and the provider is genuinely contacted.

### What changed, and what deliberately did not

Unchanged: the deterministic idempotency key, bounded attempts and the 15 s budget, structured logging
and provider ids, the Preview refusal, and the transaction boundary — rate limit → resolve → validate →
upload → insert → reference → duplicate handling all still precede confirmation, and
`revalidateSubmissionSurfaces()` still runs **before** the redirect. Only *when* the provider attempt
happens changed.

The boundary is no longer only a code-reading claim: tests assert a notification is scheduled **only**
after a successful insert, and **not** on the duplicate (23505), insert-failure, rate-limited, or
unresolvable-asset paths — a duplicate POST yields one submission and one logical email.

**`after()` is not a durable queue, and no delivery guarantee is claimed.** If the invocation dies the
attempt is lost. Both runbooks now say so. Deferring nonetheless *improves* the worst case: the 15 s
budget could always collide with the function limit, and awaited, that collision turned a committed
submission into a failed-looking page. The form routes now set `maxDuration = 60` so the deferred send
has a defined window rather than an inherited default — validated by the deploy accepting it.

### C6.1 — the recorded gap, fixed, and the two blocked items closed

**The revalidation gap is fixed.** `lib/inspections/submit.ts` now calls `revalidateSubmissionSurfaces()`
after a successful insert and before the redirect, matching `lib/forms/submit.ts`. It is independent of
the notification: `scheduleSubmissionNotification` only registers an `after()` callback, so neither the
refresh nor the redirect waits on email.

Two things had let it through, and both are closed: there was **no test file for that core at all**, and
`revalidate.test.ts` listed the staff-return and damage/support paths but **not** this one — a coverage
hole the same shape as the defect. A new behavioural suite asserts revalidate-and-notify exactly once on
a committed insert and **neither** on the duplicate, insert-failure, rate-limited, unavailable-asset,
upload-failure and validation-failure paths. **Verified by mutation:** removing the call fails two tests.

### Staging runtime freshness — the check FAILED, and the reason matters for C7

Run twice on staging with the fix deployed, admin navigating by **clicking in-app links only**:

| | |
|---|---|
| starting badge | 58 |
| after the renter's return checklist, via soft navigation | **58 — unchanged** |
| the new row in the inbox, via soft navigation | **not present** |
| *(diagnostic only, not proof)* after a hard reload | **59, row present** |

**The submission is correct, committed and authorized to that admin** — the reload proves that. What
does not happen is the already-open admin tab noticing. The renter submits from a different browser, and
server-side `revalidatePath()` executed in *the renter's request* cannot invalidate *another browser's*
client-side router cache; the payload the admin's tab holds (including the prefetched nav layout that
carries the badge) predates the submission.

**So C6.1's acceptance check 1 is met in the server-side sense and NOT in the runtime sense.** The fix is
still right — it restores parity with every other submission path and keeps server-side caches
consistent — but it must not be described as making a cross-device submission appear in an open admin
tab. **That is exactly C7's territory** (the visible-idle `router.refresh()`), and it is recorded here
rather than acted on.

The hard reload above was used **only to distinguish "not visible to this admin" from "visible but
stale"**. It is never reported as proof that revalidation works, because a reload passes either way.

### The two C6 items that were blocked

**Small media — now verified**, against the QA asset only, one submission:

| | |
|---|---|
| reference | `SUB-2026-47C13B` |
| files / bytes | **1 file, 70 bytes**, `cleanup: "none"` — the media was retained, so the insert succeeded |
| notification | **exactly one**, `sent`, HTTP 200, `attempts: 1` |
| `notify.send` | 182.1 ms |
| POST / click→confirm | **704 ms / 949 ms** |

**Those two timings are one observation each and are not a performance comparison** — they are recorded
to show the media path behaves, not to compare with anything. *Not directly verified:* that an
authorized admin opened this specific image. The mechanism is covered generically by the storage-policy
suite and the evidence E2E; this particular object was not opened in-session, and that is stated rather
than implied.

**Real mailbox — verified end to end** (send and provider evidence here, arrival confirmed by the
operator from the received message):

| | |
|---|---|
| reference | `SUB-2026-137FCA` (no media, QA asset) |
| recipient | `s***@mulemark.io` — the support mailbox, set and **cleared immediately** afterwards |
| outcome | **exactly one** `sent`, HTTP 200, `attempts: 1` |
| provider id | `635a9335-631a-4703-8cd1-ece54fd09c90` |
| `notify.send` | 207.7 ms |
| sent at | 14:15:47 PT |

**Arrival CONFIRMED by the operator** from the delivered message's own headers:

| Checked | Result |
|---|---|
| delivered to | `support@mulemark.io` |
| `From` | `Mulemark <notifications@notify.mulemark.io>` — exactly as specified |
| `Reply-To` | `support@mulemark.io` |
| subject | *New damage report — PROD-QA-PERF* |
| reference in the body | `SUB-2026-137FCA` — **matches the provider log exactly** |
| link | `https://mulemark.io/dashboard/submissions/…` — correct host, and the id's first six hex characters are the reference, so the two are consistent by construction |
| duplicates | **none** — one message, one `Message-ID` |
| **provider → inbox** | **≈ 3 s** (provider accepted 14:15:47.9 PT; the receiving server logged it at 14:15:51 PT) |

**Authentication passed on every mechanism**, which is the first live confirmation of what
`EMAIL_DELIVERABILITY_RUNBOOK.md` describes: `dkim=pass` with **`d=notify.mulemark.io`** (strict
alignment with the From domain), a second `dkim=pass` from the sending infrastructure, `spf=pass` on the
return path under `send.notify.mulemark.io`, and `dmarc=pass`.

DMARC remains `p=NONE` — monitoring only. The runbook's stated precondition for even *considering*
enforcement is consistent alignment evidence over a meaningful period; **this is one message, which is
not that.** No policy change is proposed here.

**This is an operator verification of one message. It is NOT a claim that inbox delivery is guaranteed** —
`after()` is not a durable queue, and a lost invocation still loses the attempt silently.

**The QA recipient is cleared.** The Production QA organization is back to sending nothing.

### A rate-limiter behaviour worth knowing before the next QA run

The action harness kept reporting media submissions as rate-limited. The cause is not a bug: public
intake keys its bucket on `(action, ip, short code)` — **one bucket shared by both shapes** — while
applying the stricter media rules (3/min, 15/hour) whenever a file is attached. Running both shapes
therefore spends the scarce media allowance on no-media samples. The harness gained `--shape` and
`--no-warmup` so a single deliberate event can be issued without consuming four. **The limiter itself was
not touched.**

### Unchanged by C6.1

Email remains **best-effort**; `after()` remains **not a durable queue**, so a dead invocation loses the
attempt; the **committed row remains the system of record** and the admin inbox reads it. Idempotency,
retry limits, provider logging, the rate limiter, media limits, schema and RLS are untouched, and the
`after()` architecture is unchanged.

**The C6 performance claim is unchanged: ≈250–270 ms attributable off confirmation, plus removal of the
provider-failure tail. C6.1 adds no performance claim of its own.**

### Recorded, not fixed — *resolved in C6.1, see above*

`lib/inspections/submit.ts` does **not** call `revalidateSubmissionSurfaces()`, though a return
inspection also creates a `status='new'` submission. If that is a real gap the admin nav badge goes
stale after a return checklist. Noticed while wiring C6; changing it is a behaviour fix, not a latency
one, so it is recorded here rather than folded in.

**Resolved in C6.1.** The call was genuinely missing and is now in place. The C6.1 section above also
records what the fix does *not* buy: it restores server-side consistency, but it cannot refresh an admin
tab that is already open on another device — which turned out to be a client-router-cache matter, and
belongs to C7.

## 9i. C7 result — efficient submission freshness

### The gate, and what was actually costing the requests

C0 §11 recorded the behaviour without counting it: the inbox *"polls a full-page `router.refresh()`
every 30 s while visible whether or not anything changed"*. §13 scoped C7 to exactly that. Measured on
staging over **90 idle seconds**, with every request classified:

| Tab state | total | rsc | prefetch | freshness | other |
|---|---|---|---|---|---|
| **visible, before** | **81** | 3 | **63** | 0 | 15 |
| hidden, before | **0** | 0 | 0 | 0 | 0 |

The three RSC requests are the three 30-second refreshes — the configured interval, confirmed by
observation rather than by reading the prop. **The other 78 requests are their consequence**: each
full re-render re-primed every row link (~21 prefetches) and re-ran the client's Supabase work. The
hidden zero confirms C0's claim that hidden-tab polling was already correct, so that machinery was kept
rather than rewritten.

### After

| Tab state | total | rsc | prefetch | freshness | other |
|---|---|---|---|---|---|
| **visible, after** | **1** | **0** | **0** | 1 | 0 |
| hidden, after | **0** | 0 | 0 | 0 | 0 |

**81 → 1 request** in 90 idle seconds. One tiny JSON read per minute replaces three full page renders and
the 78 requests they dragged behind them.

*Transferred bytes are not quoted.* `content-length` is absent on most of these responses, so the
harness's byte total is not trustworthy and reporting it would be inventing precision.

### Part E — answered by the measurement, and the answer was "change nothing"

Row links were the obvious suspect: the inbox renders an `Open` link per row on **both** the desktop
table and the mobile card, so a 25-row page can prime ~50 targets. The instinct was to set
`prefetch={false}`.

**The measurement said not to.** Prefetch went **63 → 0 with no prefetch change at all**, because the
prefetch storm was never independent — it was downstream of the refresh. Disabling row prefetch now
would slow the first click into every submission and save nothing, so **prefetch is untouched**, and it
is untouched on evidence rather than on preference.

### Part B — why the token has two fields

| Candidate | What it misses |
|---|---|
| `max(created_at)` alone | every status change — a row moving `new → reviewed` in another tab |
| `count(status='new')` alone | an arrival that coincides with a resolution: the count is identical while a new row sits unseen |

The token is **both**: `{ newCount, latest }`. Each covers the other's blind spot, and both values are
already on screen for the same admin, so it discloses nothing new. `countNewSubmissions()` is reused, so
the badge, the pill and the token cannot disagree.

### Part C — the endpoint

`GET /api/submissions/freshness`, `no-store`, RLS-scoped client, **service role never imported** (a test
asserts it). It returns exactly two fields and never a row. **Every refusal returns the identical
`{ ok: false }`** — signed-out, platform owner, org-less and suspended are indistinguishable, so the
endpoint cannot be used to probe whether an organization exists or is suspended.

### Part D — notify, don't reload

Unchanged token → **nothing happens at all**. Changed → a quiet `N new — Load` beside Refresh; rows
reload only on click. Interval 60 s, hidden pause, one timer, capped backoff, and polling stops after
four consecutive failures rather than hammering a broken endpoint.

**The bulk-selection hazard is removed by construction, not by detection.** Nothing reloads without a
click, so a poll cannot land mid-selection — which is a stronger guarantee than trying to notice a
pending mutation and skip that tick.

### Testing the behaviour rather than the source

This project has no jsdom or testing-library, and the local habit for component tests is asserting on
source text — which cannot show that a timer stopped. The poll loop was therefore extracted to
`lib/ui/freshness-poller.ts` with its timers and fetch **injected**, and the component reduced to a thin
adapter over it, so the acceptance properties are exercised: zero polls while hidden, never a second
timer across toggles, unchanged token → no callback, no overlapping requests, backoff, give-up, and a
late response after teardown changing nothing.

### Runtime verification — and this is what closes C6.1

C6.1 ended on a real limitation: server-side revalidation cannot refresh an admin's already-open tab.
C7 is the mechanism that can. Verified end to end on staging, with the admin sitting on the inbox and
**no reload and no navigation**:

> `[PASS] an open inbox surfaces a new submission by itself` — offered **"1 new — Load"**
> `[PASS] clicking Load brings the new row into the inbox`

**A limitation that remains, stated plainly:** this makes the **inbox page** self-aware. The nav badge
lives in the shared layout, and in a tab parked on a *different* page it still shows a stale count until
navigation or reload. C7 did not fix that and does not claim to.

### A flaky assertion, and why it is recorded

The "clicking Load" check failed, passed, failed, passed. The tempting reading was a product defect. A
diagnostic settled it instead: on every passing run the stamp moved `Updated 1 min ago → just now` and
reference-shaped rows went `120 → 122`. The refresh was working every time — the inbox renders each
reference **twice** (desktop table plus mobile card, one hidden by CSS), so `.first()` was resolving to
the hidden copy and waiting for it to become visible. Filtering to a visible match made it deterministic;
two consecutive clean runs confirm it. **An intermittent test is not evidence of an intermittent
product**, and the difference is worth the diagnostic it took to establish.

## 9j. C8 result — truthful progressive feedback

### The audit came back mostly clean, and that shaped the slice

C0 §11 left this unmeasured and §13 deferred C8 for it. The operator reported **no specific screen that
feels inert**, so the scope came from an audit instead of a hunch — and the audit found **22 of 30**
client components with a submit button already carrying both action-specific pending wording and a
disabled state. **Those were left alone.** Changing them would have been churn dressed as a phase.

Three `loading.tsx` files already existed, `/dashboard/loading.tsx` already covered every dashboard child
route, and there was **no `Suspense` anywhere** in the codebase.

### Measured before touching anything

| | before | after (warm) |
|---|---|---|
| **login: click → acknowledgement** | **none — nothing changed on screen** | **121 ms** |
| login: click → dashboard | 4566 ms | 1711–1946 ms |
| hard load `/dashboard/assets`: skeleton → content | 806 → 1157 ms | 1092 → 1281 ms |
| soft nav → Assets: skeleton → content | 105 → 1446 ms | 226 → 1052 ms |
| public damage form: interactive | **1660 ms**, no loading file | 1092 ms, skeleton first |
| status action acknowledgement | 57 ms | 67–99 ms |

**Sign-in was the worst defect in the product** and the only action with no pending state whatsoever:
between 1.7 and 4.6 seconds of an unchanged screen after the click. A user with no feedback for that
long reasonably concludes the click missed and clicks again — a duplicate authentication attempt.

**C8 did not make sign-in faster and does not claim to.** It made the wait *acknowledged*, at 121 ms.
The login-duration improvement in the table is run-to-run variance on a shared environment, not a C8
effect; a pending label cannot speed up authentication.

### Part B — verified, not assumed, and the answer was "do nothing"

The authenticated layout awaits `requireActiveOrg()` before any child route's loading UI can render, so
the obvious hypothesis was that it blocks the loading file. **It does not.** The skeleton leads content
on a cold load (806 → 1157 ms) *and* on soft navigation (105 → 1446 ms).

So no Suspense restructuring was performed, and — per the operator's "only if measured" instruction —
**the nav submission badge was left exactly as it is.** At 34–50 ms it is not what delays anything, and
streaming it would have risked the layout shift the brief explicitly prohibits, in exchange for nothing.

### What actually changed

**Loading UI, only where a wait was measured.** `/forms/[shortCode]/*` had none and sat at 1660 ms to
interactive on the rank-1 renter surface — a renter at a machine who has just tapped "Report damage".
The three form routes now have a skeleton whose dimensions match `PublicFormLayout` exactly, so the real
form replaces it in place. **Their `/thanks` children deliberately did not get one**: they render no
remote data, and a skeleton on an instant route is a flash of furniture.

**Per-button pending on status actions.** Acknowledgement was already prompt but indiscriminate —
pressing Resolve greyed out Resolve, Mark reviewed and Archive identically. `useFormStatus` exposes the
submitted `FormData`, so the pressed button is identifiable by its `name="status"`; only it takes the
wording, the rest merely disable.

**Bulk actions** gained the same verb plus the scope ("Resolving 12 submissions…" rather than
"Working…"). **`ActionButton`** gained an optional `pendingLabel` defaulting to its existing children, so
no current caller changes behaviour.

### The rule that keeps this truthful

Every pending label is **present continuous**, and a test enforces it across all of them: "Resolving…",
never "Resolved". The server has not answered yet, and **a pending label that states the outcome is a
false optimistic success wearing a spinner**. Nothing renders success before the server returns, no
authorization path was touched, and failed actions still surface their `role="alert"` error unchanged.

### A latent test race the loading file exposed

The full E2E came back with one flaky spec on the return form. Rather than accept a flake, it was
isolated: **14/14 clean with the new `return/loading.tsx` removed, 13/1 with it present.** The cause was
in the shared helper, not the product — `answerConditionStage` counted visible fieldsets *immediately*
after navigation, so anything standing between `goto` and the form made it find **zero groups, answer
nothing, and fail later somewhere else**. The assumption was always unsafe; the skeleton only made it
visible. Fixed where it lived, in the helper. 39/39 public specs stable on repeat, full suite 75/75 clean.

### No regression

The C7 inbox measurement was re-run because C8 touches the same page: **still 1 request visible per 90 s,
0 hidden.** Route completion times are equal or better than the before column, and status acknowledgement
stays inside the 100 ms lab budget (67–99 ms). Login acknowledgement at 121 ms sits just above it — that
figure includes click dispatch, React re-render and the harness observing visibility, and it is reported
as measured rather than rounded down.

## 9k. C9 decision — NOT RUN, and why

C9 is conditional: *"Run C9 only if the approved C0 budgets remain unmet after all justified low-risk
slices."* Reconfirmed on Production on 2026-09-09, that condition was **not satisfied**, and Part A's own
escape clause applies. **No index, RPC, cache, migration or paid-plan change was made.**

### The five reasons

**1. Three finished slices were not deployed.** C6.1, C7 and C8 were committed and pushed while
Production still ran the C6-era build (`rlai68sx6`). The gate says "after all justified low-risk slices";
they existed and were unapplied, so C9 was premature by its own terms. **They have now been promoted**
(`es2w09ieu`) — see below.

**2. The index option had no target.** Every hot dashboard query already has a matching composite
index: `scan_events_org_scanned_at_idx`, `form_submissions_org_created_at_idx`,
`asset_rental_sessions_org_started_idx` (migrations 0020, 0031). Adding one without a measured query is
prohibited, and there was no unindexed query to point at.

**3. The RPC option failed its own precondition.** Part E permits one only when "existing TypeScript
composition cannot meet the target". `app/(admin)/dashboard/page.tsx` already issues **all 16 reads in a
single `Promise.all`** (C9 said 17; recounted and corrected in §9l) — it is not a serial chain, so there was nothing for an RPC to collapse that C2's
and C3's pattern had not already done.

**4. The cheaper hypothesis was untested.** Two of those reads are **unbounded** (and the count is
**16**, not 17 as first written — recounted in §9l): a 7-day
`scan_events` select, and the unresolved-submissions select pulling full `submission_data_json` +
`media_urls` with no `.limit()`. Bounding them is a small code change and must be tried before anything
reaches for infrastructure.

**5. The number is partly an artefact of measuring it.** Dashboard desktop read **530 / 559 / 546 ms**
across three Sept 4 runs and **663 ms** on Sept 9 — outside the earlier cluster. Every production
baseline run writes ~24 `scan_events` rows to the QA asset, and it has run repeatedly, so a plausible
150–250 rows now sit inside the very 7-day window the dashboard reads unbounded. **Production row counts
were not enumerated**, so this is a supported inference, not a measured fact.

### The deployment, and what it did and did not change

`12daf5c` promoted to Production. Both slices verified live rather than assumed: the C7 freshness
endpoint answers **401** to an anonymous caller (a 404 would mean absent), and C8's `"Signing in…"` label
is present in the deployed client bundle. Production smoke: 13 pass, 0 fail, 1 documented skip.

| Route (desktop) | before (C6-era) | after (C8-era) |
|---|---|---|
| public scan | 285 ms | **242 ms** |
| dashboard | 663 ms | 699 ms |
| assets | 438 ms | 435 ms |
| submissions | 512 ms · **69.5 req** | 581 ms · **71 req** |
| rentals | 409 ms | 402 ms |
| analytics | 442 ms | 446 ms |

**A correction to what this document expected.** The C9 plan predicted the submissions *request count*
would fall from ~69.5 once C7 shipped. **It did not — it is 71.** That prediction was wrong, and the
reason matters: **C7 reduced IDLE traffic (81 → 1 request per 90 seconds of sitting still), never
initial page load.** The ~70 requests here are the first render plus its link prefetches, which C7 never
targeted and never claimed. C7's verified claim stands exactly as §9i records it; the expectation set
against it in the C9 plan was mistaken.

Nothing else moved cleanly. Public scan improved on desktop (285 → 242 ms) but worsened on mobile
(295 → 310 ms), so even that is not a clean win — **run-to-run variance dominates at n=10 on shared
infrastructure**, and no line in that table should be read as an attributable effect of this deployment.

### Budget status after the deployment

| Approved budget | Status |
|---|---|
| Public scan server stream < 500 ms | **Met** — 242 ms desktop / 310 ms mobile |
| Public scan LCP < 1.5 s | **Met** — 448 / 702 ms |
| Warm route navigation < 1.0 s | **Met desktop** (max 962 ms); **missed mobile** — 1201 / 1116 / 1589 ms |
| No warm route > 2.0 s | **Met** on navigation (max 1589 ms); mobile submissions **LCP p75 2168 ms** exceeds it |
| Hidden tabs: zero polling | **Met** |
| Visible idle: no unconditional full refresh | **Now met** — C7 live |
| No repeated profile/org query per render | **Met** — C1 |
| Pressed feedback < 100 ms | **Now met** — C8 live (67–99 ms measured) |
| *Recommended, never ratified:* server stream < 500 ms on every authenticated route | **Missed** — dashboard 699/684 ms, submissions 581/624 ms |

**On the mobile misses, stated with their caveat.** The mobile class runs at **4× CPU throttle**, which
makes it sensitive to load on the measuring host — and this host had been running builds, test suites
and browser automation throughout the session. Mobile navigation is worse than C0 recorded (939 → 1201 ms
on dashboard), but **that is not attributable to the product without a controlled re-run on an idle
machine.** It is recorded as an open question, not as a regression.

### What comes next, and what it is not

The one substantive remaining gap is **dashboard (~700 ms) and submissions (~580 ms) against the
recommended 500 ms server-stream addition** — a target that was proposed in §12 and **never ratified**.

The next step is a **candidate code slice, explicitly not C9**: bound the two unbounded dashboard reads
and re-measure on an idle host. Only if that fails to close the gap does Part E's "dashboard briefing"
RPC acquire the evidence it requires — and it would still need the `EXPLAIN` work of Part C first.

## 9l. C9.1 result — bounded dashboard trial, NO change retained

An optional, time-boxed launch-polish pass. It produced the per-read attribution C9 lacked, and that
attribution **rejected both of the candidates C9.1 was authorized to try**. No dashboard code was
changed, no migration, index, RPC, cache or plan change was made.

### Corrections to what this document previously said

- **The dashboard makes 16 concurrent reads, not 17.** §9k said 17; recounted from
  `app/(admin)/dashboard/page.tsx`. Corrected here rather than left standing.
- **The two reads §9k called "potentially wasteful" are not on the critical path.** That hypothesis was
  reasoned from row counts and payload shape without measurement. Measurement disagreed.

### Clean dashboard-only baseline

`npm run perf:dashboard:production` — a `--routes` filter added to the existing harness. The filter
applies to the **public** route list as well as the authenticated one and skips the anonymous block
entirely when nothing survives, so a dashboard run **cannot** view `/t/` and **cannot** write a
`scan_events` row. That matters because those rows are an input the dashboard reads back over a 7-day
window: an unfiltered benchmark would inflate the very thing it measures, a little more each run.

| Device | n | Server med | Server p75 | LCP med | Nav med | Reqs |
|---|---|---|---|---|---|---|
| desktop (no throttle) | 10 | **674 ms** | 761 ms | 840 ms | 880 ms | 43.5 |
| mobile (4× CPU throttle) | 10 | 779 ms | 991 ms | 1362 ms | 1395 ms | 44 |

Emulation: mobile = Pixel 7 descriptor + **4× CPU throttling**, no network shaping; desktop = Desktop
Chrome, **no throttling**. Desktop is the engineering comparison; mobile is a stress indicator.

### Per-read attribution — two independent runs

| Phase | run 1 | run 2 |
|---|---|---|
| **`recent_scans`** — `scan_events … order(scanned_at desc).limit(20)` | **304.7 ms** | **249.7 ms** |
| `count_scans_30d` | 180.7 | 149.4 |
| `count_submissions` | 136.7 | 129.4 |
| `count_photo_backed` | 149.4 | 107.2 |
| **`scan_7d`** — *C9.1 candidate 1* | 156.9 | **99.2** |
| `signed_thumbnails` *(sequential, after the group)* | 144.5 | 87.7 |
| `count_resolved` / `count_returns` | 134.4 / 132.6 | 88.0 / 88.9 |
| `recent_submissions` / `open_tag_requests` | 125.7 / 125.3 | 82.5 / 81.7 |
| `assets` / `recent_rentals` / `qr_links` | 126.1 / 127.1 / 109.3 | 69.5 / 66.0 / 63.9 |
| **`unresolved_submissions`** — *C9.1 candidate 2* | 127.9 | **63.4** |
| `equipment_pages` / `recent_tags` / `org` | 130.1 / 104.5 / 109.1 | 61.9 / 60.2 / 43.5 |

**A limitation, stated because the numbers would otherwise be over-read.** The collector reports
"20 samples" per phase, but `min == median == max` on every row means it is counting **one distinct log
line** repeated, not twenty independent observations. Each figure is effectively a **single sample**.
Confidence comes from **two independent runs agreeing on the ranking**, not from the sample label.

### Why both candidates were rejected

**Candidate 1 — the 7-day scan trend — fails on semantics *and* materiality.** `analytics_daily_activity`
buckets by **`America/Vancouver` calendar day** over 7 calendar days; `scanTrend`
(`lib/dashboard/briefing.ts`) buckets by **UTC day** — its own comment calls that *"a viz approximation,
not a reporting figure"* — over a rolling `now − 7×86 400 000` window. Those disagree at every day
boundary, so the swap would change the displayed 7-day total and trend, which C9.1 forbids. PostgREST
cannot express a same-semantics daily aggregate without a new RPC, also forbidden. And at 99–157 ms it
is not the slowest read anyway.

**Candidate 2 — the unresolved submission payload — fails on materiality.** At **63.4 ms** in run 2 it
sits essentially at the floor (`org` 43.5 ms, `recent_tags` 60.2 ms). Trimming its columns could recover
perhaps 10–20 ms of a 674 ms route. C9.1's own instruction — *"if this query is not a material
contributor, leave it unchanged"* — applies directly.

**The structural reason neither could ever have worked.** The 16 reads run **concurrently** in one
`Promise.all`, so the group's duration is its **slowest** member. Neither candidate is that member.
Making either one instantaneous would have improved the route by **zero milliseconds**. This is the
finding per-read measurement exists to produce, and it is why C9's row-count reasoning was not enough.

### What the measurement did find, and deliberately did not pursue

The route decomposes roughly as auth (~100 ms) + the concurrent group (**bounded by `recent_scans`**)
+ sequential thumbnail signing (88–145 ms) + render.

Two genuine opportunities are **recorded and handed forward, not started** — pursuing either would mean
query-plan analysis or restructuring, which is C9 territory and a second architecture iteration, both
explicitly out of scope here:

1. **`recent_scans` is 2.4× slower than any sibling** while reading the same table as `scan_7d`, which
   is faster despite matching more rows. The difference is the `ORDER BY scanned_at DESC` with `limit(20)`.
   Whether the `(organization_id, scanned_at)` index is being used for that ordering under the RLS
   policy's `is_platform_owner() OR …` predicate is **unverified** — establishing it needs `EXPLAIN`.
2. **Thumbnail signing is sequential after the whole group**, though it depends on only two of the
   sixteen reads. Starting it once those two resolve would overlap it with the other fourteen.

### Outcome

No change retained; the retention threshold (≥100 ms or ≥15 %) was never reachable by either authorized
candidate, so no implementation was written to be measured against it. The diagnostic instrumentation
has been **removed** — the temporary `dash.*` phase names are gone and `lib/diagnostics/server-timing.ts`
is back to its prior union. The `--routes` filter and the accurate per-run write disclosure are kept as
measurement tooling.

**`MULEMARK_DIAGNOSTIC_TIMING` remains set in the Production environment.** The code is default-off, so
acceptance is satisfied, but the variable is still live from C0 — removing it (and redeploying) is the
operator step §16 describes, and it is left as an explicit open item rather than silently dropped.

### Final state, measured after the revert

Production `jswtabswl` (instrumentation removed), same command, same host, same account:

| Device | Server med | Server p75 | LCP med | Nav med | Reqs |
|---|---|---|---|---|---|
| desktop (no throttle) | **681 ms** | 721 ms | 812 ms | 897 ms | 44 |
| mobile (4× throttle) | 688 ms | 787 ms | 982 ms | 1061 ms | 44 |

Unchanged from the instrumented baseline within variance (desktop 674 → 681 ms), confirming the revert
cost nothing. Production smoke after the revert: 13 pass, 0 fail, 1 documented skip.

**Worth noting against the "mobile is over a second" concern**: this run measured mobile navigation at
**1061 ms and LCP at 982 ms**, against 1395 ms and 1362 ms an hour earlier on the same code. The
throttled mobile figure swings by ~30 % between runs on the same build, which is itself the argument
for not treating it as a launch gate.

### Launch limitation, stated precisely

**The >1 s mobile figure is synthetic.** It is Pixel-7 emulation under **4× CPU throttling** on a
developer laptop, and it has **never been observed on a real device**. It is not evidence that a real
user waits that long, and it is not a launch blocker. The dashboard at ~674 ms desktop server stream,
with the loading skeleton appearing first (C8), is the honest current state.

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

### Post-Phase-C status, measured on Production 2026-09-09 (`es2w09ieu`, C1–C8 all live)

| Budget | Then (C0) | Now | Verdict |
|---|---|---|---|
| Public scan server stream < 500 ms | 356 ms | **242 ms** desktop / 310 ms mobile | **Met** |
| Public scan LCP < 1.5 s | 438 / 646 ms | 448 / 702 ms | **Met** |
| Warm route navigation < 1.0 s | 100–940 ms | desktop ≤ 962 ms; **mobile 1116–1589 ms** | **Met desktop, missed mobile** — see the CPU-throttle caveat in §9k |
| No warm route > 2.0 s | max 940 ms | nav max 1589 ms; mobile submissions **LCP p75 2168 ms** | **Met on navigation, exceeded on one mobile LCP p75** |
| Hidden tabs: zero polling | met | 0 requests / 90 s | **Met** |
| Visible idle: no unconditional full refresh | **not met** | 1 request / 90 s | **Now met (C7)** |
| No repeated identical profile/org query | **not met** (3:2:2:1) | 2:1:1:1 | **Now met (C1)** |
| Immediate response < 150 ms / pressed < 100 ms | **unmeasured** | 67–99 ms actions; 121 ms sign-in | **Now met, and now measured (C8)** |
| *Recommended, never ratified:* server stream < 500 ms every authenticated route | assets 678 ms | assets 435, rentals 402, analytics 446 — **dashboard 699, submissions 581** | **Partly met.** The two misses are the open item §9k hands to a future code slice. |

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
| **C5 — awaited scan logging** | only if it materially delays the public page | **RAN — see §9g. Done, and the estimate was corrected downward: the write costs 28.9 ms on Production, not 71–104 ms, so the measured saving is ≈27 ms (desktop, control-adjusted), not ≈100 ms.** |

| Slice | Decision |
|---|---|
| **C4 — per-row signed URLs** | **DEFER.** Submissions' request count implicates it, but the per-row cost was never isolated. Fold the measurement into C3; run C4 only if it survives. |
| **C6 — notification in the form path** | **RAN — see §9h.** The measurement C0 lacked was built first: the live provider call was 178.7 ms median with a ≥8 s verified tail on the renter's success path. Deferred via `after()` (path B); ≈250–270 ms attributable off confirmation, tail removed. |
| **C7 — polling** | **RAN — see §9i.** Visible-idle traffic **81 → 1 request** per 90 s; hidden stayed at zero. Prefetch fell 63 → 0 as a consequence of removing the refresh, so no prefetch change was made. An open inbox now notices a new submission by itself. |
| **C8 — perceived inertness** | **RAN — see §9j.** Audit found 22 of 30 submit components already correct and left them alone. Sign-in had no pending state at all and 1.7–4.6 s of unchanged screen; it now acknowledges in **121 ms**. Loading UI added only to `/forms/*` (1660 ms measured). The layout does **not** block the loading file, so no Suspense and no nav-badge change. |
| **C9 — database/indexes** | **NOT RUN — decision recorded in §9k.** C1–C8 all shipped and the condition still was not met: every hot query already has a matching composite index (0020, 0031), the dashboard is already one `Promise.all` of 16 reads (§9l corrects the 17 stated here) so an RPC has nothing to collapse, and the cheaper untested hypothesis (bound two unbounded reads) comes first. No index, RPC, cache, migration or plan change was made. |

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
