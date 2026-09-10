# Phase C — Performance Readiness (Engineering Phase C closeout)

**Branch `pilot-credibility` @ `b41cdcd`** (closeout commit adds this document).
Production `jswtabswl` → `mulemark.io`. Measured 2026-09-09/10. **31 commits** since `2bcf3f3`.

> **This is Engineering Phase C (performance).** It is *not* the business roadmap's
> "Phase C — Physical product readiness", which concerns tag materials and durability and is untouched
> by this work.

---

## 1. Executive verdict

**Mulemark is responsive enough for a limited software pilot.** Every approved C0 budget is met, the
renter-facing surfaces are the fastest in the product, and no security or regression gate failed at any
point across ten slices.

**The single most important caveat, stated first:** the honest attributable evidence in this document is
the **within-session A/B measurements**, not the cross-day route tables. Two independent effects make
absolute before/after comparison across the phase unreliable, and both push in the same direction:

1. **Host load.** Five Production runs tonight, on essentially identical code, measured the dashboard at
   **663 / 699 / 681 / 717 / 727 ms** desktop. That ~64 ms band is the measurement floor, on one laptop.
2. **The dataset grew during the phase, substantially because of the measurement itself.** Every
   Production baseline run writes ~24 `scan_events` rows to the QA asset, and the C6/C6.1 probes added
   submissions. The dashboard reads a 7-day scan window unbounded, so the harness inflated its own input.

Where cause cannot be isolated, this document says so rather than inventing an attribution.

| Verdict | Result |
|---|---|
| Renter scan responsiveness | **GO** |
| Public form responsiveness | **GO** |
| Authenticated navigation | **CONDITIONAL GO** |
| Admin action responsiveness | **GO** |
| Request efficiency | **CONDITIONAL GO** |
| Limited-pilot scalability | **CONDITIONAL GO** |

---

## 2. Infrastructure

| Fact | Value | How known |
|---|---|---|
| Production domain | `https://mulemark.io` | smoke, 13/13 |
| Vercel region | **pdx1** on every dynamic route | measured header |
| Production deployment | `jswtabswl` (`dpl_AHM9fWoE…`) | `vercel inspect` |
| Deployed Node | **22.x** (`engines`) | package + C0 §1 |
| Local dev Node | **v24.16.0** — differs from `engines: 22.x` | measured; builds pass, recorded not fixed |
| Production Supabase ref | `apeiswnkheiwrpvumder` | `verify:production-target` |
| Staging Supabase ref | `kwserenxwjxozztyigmw` | `verify:staging-target` |
| **Supabase regions, plan tiers, Fluid Compute** | **NOT VERIFIED — dashboard-only** | unchanged from C0 §1; **not guessed** |
| Speed Insights | installed, **not collecting** | script absent from served HTML |

**Environment isolation was verified, not assumed.** The git-branch alias appears in the *production*
deployment's alias list, which would be alarming if staging scripts were therefore driving production.
They are not: `smoke:staging` resolves the **staging-only probe (200)** and 27 staging-fixture checks
pass, while `smoke:production` confirms that same probe does **not** resolve on `mulemark.io`. The alias
entry is Vercel bookkeeping; live routing still serves the staging-env build.

---

## 3. C0 baseline (2026-09-02, Production, desktop)

landing 36 · **public scan 356** · login 62 · **dashboard 508** · **assets 678** · submissions 542 ·
rentals 404 · analytics 424 (ms, server stream median).

C0's three named bottlenecks: the Assets serial chain (274 ms isolated), repeated identity work
(≈146 ms), and the awaited scan write on the public route (71–104 ms).

---

## 4. Slices run

| Slice | Retained? | Evidence and honest size |
|---|---|---|
| **C1** identity dedupe | ✅ | Phase ratio 3:2:2:1 → **2:1:1:1**, observed in logs. Latency win **not** demonstrable against ambient drift; kept on the resource argument, which the operator approved explicitly. |
| **C2** Assets parallelization | ✅ | 8 serial awaits → one `Promise.all`. **The largest retained improvement:** assets **678 → ~486 ms desktop (−192 ms, −28 %)**, **735 → 473 ms mobile (−262 ms, −36 %)**, consistent across every run tonight. |
| **C3** Submissions parallelization | ✅ | A/B: `page.primary_queries` **248.5 → 82.3 ms (−67 %)**. Route-level gain has since been masked by data growth — see §6. |
| **C4** signed-URL batching | ✅ | N Storage round trips → **1** per call site; the only *serial* N+1 (public documents) removed. **No latency claim** — the QA org holds no media. |
| **C5** deferred scan logging | ✅ | Write moved off the response path. **Corrected the estimate downward:** C0 predicted 71–104 ms; measured **28.9 ms**, so the saving is ≈**27 ms** adjusted, not ≈100. Reliability 20/20, 291 ms appearance. |
| **C6** deferred notification | ✅ | Provider call (178.7 ms median, 15 s worst case) off the renter's confirmation path. **≈250–270 ms** attributable plus removal of the provider-failure tail. |
| **C6.1** return-checklist revalidation | ✅ | Real defect: the guided return committed a row and never revalidated. Mutation-verified. **Limitation recorded:** server-side revalidation cannot refresh another browser's open tab. |
| **C7** inbox freshness | ✅ | **81 → 1 request per 90 idle seconds (−99 %)**, hidden stayed 0. Prefetch **63 → 0** as a *consequence*, so no prefetch change was made. Closes C6.1's open-tab limitation. |
| **C8** truthful feedback | ✅ | Sign-in had **no acknowledgement at all** (1.7–4.6 s of unchanged screen); now **121 ms**. Action ack 67–99 ms. 22 of 30 submit components were already correct and were left alone. |
| **C9.1** dashboard trial | ❌ **reverted** | Per-read attribution rejected both authorized candidates. See §14. |

---

## 5. Slices skipped, and why

| Slice | Decision |
|---|---|
| **C9** — database / indexes / RPC / cache / paid plan | **NOT RUN.** Every hot query already has a matching composite index (migrations 0020, 0031); the dashboard is already one `Promise.all`, so an RPC has nothing to collapse; and three finished slices were still undeployed when the gate was evaluated. |
| **C9.1 candidate 1** — compact scan trend | **Rejected.** `analytics_daily_activity` buckets by **America/Vancouver calendar day**; `scanTrend` buckets by **UTC day** over a rolling window. They disagree at every day boundary, which would change the displayed total. |
| **C9.1 candidate 2** — unresolved payload trim | **Rejected on measurement.** 63.4 ms, within 20 ms of the cheapest read on the page. |
| Prefetch disabling | **Not done, on evidence.** Prefetch fell 63 → 0 as a consequence of C7; disabling it would now slow every first click into a submission and save nothing. |
| Scale fixtures / load testing | **Not built.** C9 declined; no tenant has that data volume. |

---

## 6. Route before/after (Production, desktop, server-stream median)

| Route | C0 | C10 | Δ | Read this as |
|---|---|---|---|---|
| landing | 36 | 37 | ~0 | static |
| **public scan** | 356 | **357** | ~0 | flat overall; C5 removed a 29 ms write from the path |
| login | 62 | 67 | +5 | noise |
| **assets** | **678** | **486** | **−192 (−28 %)** | **the clearest retained win (C2)** |
| rentals | 404 | 385 | −19 | noise |
| analytics | 424 | 482 | +58 | within the noise band |
| **dashboard** | **508** | **722** | **+214** | **worse in absolute terms — not attributed, see below** |
| **submissions** | **542** | **669** | **+127** | **worse in absolute terms — not attributed** |

**On the two that got worse.** Both are read-heavy pages over data that grew during the phase, and the
measurement band tonight was ±64 ms on identical code. Dashboard was never optimised by any slice — C2
targeted Assets, C3 targeted Submissions — and C9.1 measured its critical path as a single read
(`recent_scans`, 250–305 ms) that no authorized change touched. **I cannot separate data growth, host
load and any real regression retrospectively, and this document does not pretend to.** What is certain:
no dashboard or submissions code shipped that would plausibly slow them.

Mobile is reported separately and carries the 4× CPU-throttle caveat — see §15.

---

### Staging, same method, same night — reported but NOT comparable

| Route (desktop) | Production | Staging |
|---|---|---|
| public scan | 330 ms | 793 ms |
| dashboard | 727 ms | 828 ms |
| assets | 479 ms | 865 ms |
| submissions | 661 ms | 1172 ms |
| rentals | 384 ms | 744 ms |

Staging is uniformly slower — roughly 2× on the public scan. **Do not read this as a regression or as a
second opinion on Production.** They are different Supabase projects with different compute and very
different data (staging's QA org holds ~120 submissions against Production's handful), which is exactly
why C0 §3b already forbade comparing the two. Staging's value is trend-over-time within staging, and as
the environment where destructive QA is allowed to run.

## 7. Action before/after

| Action | Before | After |
|---|---|---|
| Public form POST (no media) | notification inline on the path | **575 ms**, notification deferred |
| Public form POST (1 image) | — | **704 ms**, confirmation 949 ms (single observation) |
| Click → confirmation | — | **834–949 ms** |
| **Sign-in acknowledgement** | **none — 1.7–4.6 s unchanged screen** | **121 ms** |
| Status-action acknowledgement | 57 ms, but indiscriminate | **67–99 ms**, names the pressed action |
| `notify.send` (provider) | 178.7 ms **on** the path | 165–207 ms **off** the path |

---

## 8. Request efficiency before/after

| Measure | Before | After |
|---|---|---|
| **Submissions inbox, 90 s idle** | **81 requests** (3 full refreshes + 63 prefetches + 15 client calls) | **1** |
| Hidden tab, 90 s | 0 | 0 |
| Submissions **initial load** | 45 (C0) | **72** |
| Signed-URL requests per media list | N | **1** |

**The initial-load count went up, and that is not a regression from C7.** C7 targeted idle polling and
never claimed to change first render. The growth is per-row link prefetch against an inbox that now
holds more rows than it did at C0 — the same data growth described in §6.

---

## 9. Scan reliability

20 scans against a disposable staging QR: **exactly 20 events, no loss, no duplicates**, correct
asset/QR/organization attribution on every row, every `ip_hash` hashed-or-absent, **291 ms** appearance
after the last scan. E2E asserts the same invariant in CI against a production build, and that an
unavailable tag records nothing at all.

---

## 10. Notification reliability

One real email verified end to end to `support@mulemark.io`: correct `From`
(`Mulemark <notifications@notify.mulemark.io>`), correct `Reply-To`, reference matching the provider log,
working `mulemark.io` link, **no duplicate**, **≈3 s** provider→inbox. Authentication passed on every
mechanism, with **DKIM `d=notify.mulemark.io`** strictly aligned. DMARC remains `p=NONE` and **no policy
change was made** — one message is not the alignment history the runbook asks for.

**`after()` is not a durable queue.** A lost invocation loses the attempt silently. The committed row
remains the system of record; **inbox delivery is not guaranteed and is not claimed.**

---

## 11. Security and regression gates

| Gate | Result |
|---|---|
| `lint` · `typecheck` | pass |
| `test` | **1309 passed / 150 files** |
| `build` | pass |
| `test:security` | **79 passed / 8 files** |
| `test:e2e` | **75 passed**, 0 flaky |
| `smoke:staging` | **27 pass, 0 fail, 1 documented skip** |
| `smoke:production` | **13 pass, 0 fail, 1 documented skip** |
| `verify:staging-target` | **6 pass, 0 fail** |
| `verify:production-target` | 4 pass, **1 warn** (artifact — see below) |
| `perf:dashboard:production` | ran; no scan events written |
| **Secret scan** | **CI-only — gitleaks is not installed locally and CI downloads the binary. It runs on push; I did not run it and do not claim to have.** |

**No RLS, role or tenant-isolation regression at any point.** Cross-tenant denial, suspended-user denial
and staff/admin separation are covered by the security suite and E2E and passed on every slice.

Two gate defects were found and fixed in this closeout: `verify:staging-target` and
`verify:production-target` were registered **without `--env-file`**, so as written they could never pass.
A gate that cannot pass is worse than no gate. The production verifier's remaining WARN
(`site-url: http://localhost:3000`) is an artifact of running it against `.env.local`, which carries a
local dev site URL — production smoke independently proves `mulemark.io` serves with no localhost host
in the HTML.

---

## 12. Field-data status

**PENDING.** Speed Insights is installed but **not collecting** — the script is absent from the served
HTML, unchanged since C0/B1B. There is no field p75 for LCP, INP or CLS, and **no lab number in this
document should be read as field performance.** This does not block closeout; it is resolved by real
pilot traffic.

---

## 13. Plan and cost changes

**None. No recurring cost changed during Phase C.** No Vercel or Supabase plan change, no new service,
no cache infrastructure, no queue. The **Vercel Hobby → Pro** upgrade noted in the roadmap remains a
*commercial* prerequisite for a paid pilot, not a performance one — nothing measured here requires it.

---

## 14. Remaining bottlenecks

1. **`recent_scans` bounds the dashboard.** `scan_events … order(scanned_at desc).limit(20)` measured
   **250 ms and 305 ms** in two runs, against a 43–150 ms field. Because the 16 reads are concurrent,
   this single read sets the group's duration. **Why it is slower than `scan_7d` on the same table is
   unverified** — it needs `EXPLAIN`, which is C9 territory.
2. **Thumbnail signing is sequential after all 16 reads**, though it depends on only two of them.
3. **Two unbounded dashboard reads** — the 7-day scan window and the unresolved payload — will grow with
   tenant age.
4. **Dashboard ~722 ms** against the §12 *recommended, never ratified* 500 ms addition.

---

## 15. Accepted pilot limitations

- **No field data.** Lab only, one laptop, one network, one location.
- **The >1 s mobile figure is synthetic.** Pixel-7 emulation under **4× CPU throttling**, never observed
  on a real device, and it swung **1395 → 1061 ms** between two runs of identical code.
- **No load or scale testing.** The largest dataset exercised is the staging QA org (~120 submissions).
  Scalability beyond a small pilot is **not evidenced**.
- **Email is best-effort.** `after()` is not durable; the admin inbox is the system of record.
- **The nav badge does not self-refresh** in a tab parked on another page (C6.1); the inbox does (C7).
- **The measurement harness inflates its own inputs** on Production by writing `scan_events`.
- **Supabase regions and plan tiers remain operator-verified**, not machine-checked.

---

## 16. Next recommended workstream

**Pilot onboarding.** No software performance blocker remains, and the two things this document most
lacks — field data and real scale — are by-products of a pilot rather than of further engineering.

If engineering time is spent here first, the single highest-value item is **one `EXPLAIN` on
`recent_scans`** (§14.1): it is the measured critical path, it is one query, and the answer either
justifies a small C9 slice or closes the question permanently.

**Do not** start a general optimization pass. Every remaining candidate has been measured and found
immaterial, unauthorized, or dependent on data no tenant yet has.
