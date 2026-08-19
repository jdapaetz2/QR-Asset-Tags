# Real-Device QA — Mulemark (Phase A6.3)

> **TEST-ONLY.** All QA runs against the temporary staging deployment recorded in
> [`STAGING_DEPLOYMENT_RUNBOOK.md`](STAGING_DEPLOYMENT_RUNBOOK.md), using a **disposable test QR code**
> (`stg-qa-public` / `stg-qa-rented`, seeded by `npm run staging:seed`) inside disposable test
> organizations. **No permanent tag may ever be produced from a
> staging URL.**

## How to read this document

A6.3 produced **two different kinds of evidence**, and they are deliberately not mixed:

| | Automated pass | Operator pass |
|---|---|---|
| Who ran it | tooling (`npm run qa:staging:devices`) | a human with real hardware |
| What it proves | real browser **engines** (WebKit, Chromium) at real device viewports | how the product behaves on an **actual phone** |
| What it cannot prove | camera/QR scan, real weak signal, iOS Safari shell, desktop Safari, real touch ergonomics | — |
| Status | ✅ complete (below) | ⬜ **not yet run — rows are blank on purpose** |

Emulation reproduces viewport, device-pixel-ratio, touch flags, user-agent and CPU throttling. It does
**not** reproduce a handset. Anything marked 📱 can only be answered by the operator pass, and A6.3 does
**not** claim it.

---

## Part 1 — Automated emulated pass (complete)

Command: `npm run qa:staging:devices` · 110 checks.

| Run | Result |
|---|---|
| A6.3 (2026-07-30) | 106 pass / **4 fail** — all four the same defect, D-1 |
| **B2 re-run (2026-08-19)** | **108 pass / 0 fail**, 2 N/A |

The two `N/A` are the bulk-action toolbar on the mobile profiles when the seeded inbox happens to have
nothing selectable; the control itself is present and passes on the desktop profiles.

| Profile | Engine | Viewport | Notes |
|---|---|---|---|
| iPhone-class | **WebKit** (Safari's engine) | iPhone 15 | closest available proxy for iOS Safari; not iOS Safari |
| Android-class | Chromium | Pixel 7 | |
| Desktop Chrome | Chromium | 1280×720 | |
| Desktop Edge | Chromium (`msedge` channel) | 1280×720 | real Edge binary |

### Public / renter workflows — all profiles

| Workflow | iPhone-class | Android-class | Chrome | Edge |
|---|---|---|---|---|
| Scan page renders (HTTP 200, asset identity) | PASS | PASS | PASS | PASS |
| No horizontal overflow | PASS | PASS | PASS | PASS |
| Quick start expands | PASS | PASS | PASS | PASS |
| Sticky actions reachable | PASS | PASS | PASS | PASS |
| Landscape orientation (no overflow) | PASS | PASS | n/a | n/a |
| Damage form renders / no overflow | PASS | PASS | PASS | PASS |
| Damage form keyboard entry | PASS | PASS | PASS | PASS |
| Photo picker present (`accept=image/jpeg,image/png,image/webp`) | PASS | PASS | PASS | PASS |
| Damage submit → success + `SUB-YYYY-XXXXXX` | PASS | PASS | PASS | PASS |
| Support submit → success + reference | PASS | PASS | PASS | PASS |
| Return checklist stage 1 → 2 → review | PASS | PASS | PASS | PASS |
| Acknowledgement prompt appears | PASS | PASS | PASS | PASS |

### Staff workflows — all profiles

| Workflow | iPhone-class | Android-class | Chrome | Edge |
|---|---|---|---|---|
| Login | PASS | PASS | PASS | PASS |
| Scan recognition (`/staff/t/<code>`) | PASS | PASS | PASS | PASS |
| Existing active rental session state | PASS | PASS | PASS | PASS |
| Staff return checklist reachable | PASS | PASS | PASS | PASS |

### Admin workflows — all profiles

| Workflow | iPhone-class | Android-class | Chrome | Edge |
|---|---|---|---|---|
| Login | PASS | PASS | PASS | PASS |
| Assets list | PASS | PASS | PASS | PASS |
| Submissions list | PASS | PASS | PASS | PASS |
| Bulk-action toolbar | PASS | PASS | PASS | PASS |
| Rentals list | PASS | PASS | PASS | PASS |
| Export **disabled** → redirects to settings | PASS | PASS | PASS | PASS |
| Assets — no horizontal overflow | ~~FAIL~~ **PASS** (B2) | ~~FAIL~~ **PASS** (B2) | PASS | PASS |
| Submissions — no horizontal overflow | ~~FAIL~~ **PASS** (B2) | ~~FAIL~~ **PASS** (B2) | PASS | PASS |
| Rentals — no horizontal overflow | PASS | PASS | PASS | PASS |

---

## Ranked findings

Severity: **S1** blocks the pilot · **S2** fix before pilot · **S3** fix when convenient · **S4** cosmetic.

### D-1 · S3 · Page overflow at phone widths — **RESOLVED in Phase B2 (2026-08-19)**

> **The root cause recorded here in A6.3 was wrong, and the affected-route list was incomplete.**
> Corrected below from live measurement.

**What A6.3 recorded.** "Admin data tables overflow horizontally", offender `TABLE.w-full text-sm`,
recommendation "wrap the two `<table>`s in an `overflow-x-auto` container".

**Why that was wrong.** Both tables *already had* that wrapper, and it works — the scroll container
measures `clientWidth 378` around `scrollWidth 675`. Walking the ancestor chain, every ancestor is clean
at 412 px, and a full-document scan finds **zero unclipped overflowing elements**. `window.scrollTo(9999, 0)`
leaves `scrollX` at **0**: the page could never be dragged sideways. The A6.3 probe flagged the table
because its bounding rect extends past the viewport, but that rect is *inside a working scroller*.

**The actual cause.** Bisecting by hiding subtrees, `table { display: none }` drops
`documentElement.scrollWidth` from 622 straight back to 412. A wide table pushes its **min-content width
into the document's intrinsic width** even when an ancestor clips it. Under `isMobile`, `window.innerWidth`
then expands to match (504 / 622) — Chromium **shrink-to-fits**, so a real Android phone renders the page
**zoomed out** (~66 % on the submissions inbox) instead of scrolling. That is why no wrapper could cure it.

**Fixes tested live before choosing one:**

| Attempt | Result |
|---|---|
| `min-width: 0` on the scroll container | no effect |
| `contain: inline-size` on the container | no effect |
| `max-width: 100%` / `width: 100%` on the container | no effect |
| `table-layout: fixed` on the table | fixes the metric, but compresses columns — rejected, weakens desktop density |
| removing the table from layout below `md` | **fixes it** |

**Second, separate cause — a shared primitive.** `components/ui/page-header.tsx` rendered its actions as
`flex items-center gap-2` with **no `flex-wrap`**, giving a ~450 px action row. This was the non-table
half of the overflow and had gone unrecorded; fixing the primitive cleared `/owner` at every mobile width.

**Affected routes — six, not two:**

| Route | Before (412 px) | After |
|---|---|---|
| `/dashboard/assets` | 92 px | **0** |
| `/dashboard/submissions` | 210 px | **0** |
| `/dashboard/templates` | 63 px | **0** |
| `/owner` | 294 px | **0** |
| `/owner/tag-requests` | 52 px | **0** |
| `/owner/production` | 43 px | **0** |

Eight further routes contain tables and were already clean, so this was never "all tables" — only tables
wider than the viewport. Those were left untouched.

**The fix.** Below `md`, a purpose-built card list (`components/ui/list-card.tsx`); at `md`+, the existing
compact table, unchanged. Both map the **same already-fetched rows** — no second query, no duplicated
business logic. On submissions the per-row derivation was extracted into one `viewRows` pass consumed by
both presentations so they cannot drift. Bulk selection keeps working because `BulkSelectionProvider` is a
context provider: table and cards sit inside it and share selection state, and the card list carries its
own **"Select all visible"** control since the table's copy lives in a `<thead>` that does not render on
mobile. `/owner/tag-requests` needed 6 px more at the `md` switch point, reclaimed from that one table's
cell padding.

**Verified** — `npm run qa:overflow`, all 14 admin + owner routes at **360 / 390 / 430 / 768 / 1024 /
1280 px**: every cell 0 px.

### D-2 · S4 · Quick Start auto-expand can race a fast tap

Quick Start auto-expands after mount on the first scan of a session. A tap landing in that window
toggles it **closed** instead of open. Observed while building the automated check (which had to wait
for the effect to settle). Harmless — the user taps again — but worth a look if the section ever feels
"sticky" on a real device.

### Non-findings (investigated, ruled out)

Recorded so a future reader does not re-chase them:

- **Export-disabled redirect on WebKit** — initially read as a failure. It is correct: the final URL is
  `/dashboard/settings`, with no Export heading and no Download link. The first check raced the redirect.
- **Acknowledgement prompt "missing"** — the prompt is deliberately delayed ~4 s; the check used
  `locator.isVisible()`, which resolves immediately and ignores its `timeout` option. The prompt appears
  reliably at ~6 s. The harness now uses an explicit wait.

---

## Request-loop verification (Part D) — complete

`npm run qa:staging:loops` · **90 s visible, then 90 s hidden, fully idle (no interaction).**

| Route | Requests (visible) | Bursts (visible) | Requests (hidden) | Verdict |
|---|---|---|---|---|
| public scan | 0 | 0 | 0 | ✅ no polling |
| dashboard | 0 | 0 | 0 | ✅ no polling, no repeated `/dashboard` fetches at idle |
| submissions (the one polling page) | ~76 | **3** | **0** | ✅ correct 30 s cadence; ✅ hidden-tab pause |
| assets | 0 | 0 | 0 | ✅ no polling |

**Raw counts are misleading here, so both are reported.** Request timestamps clustered into exactly three
bursts — seconds `0, 27–29, 57–59, 87–89` — i.e. one refresh per 30 s, matching the
`MIN_POLL_INTERVAL_MS` floor in `lib/ui/polling.ts`. There is **no tight loop and no runaway refresh**.

Each burst is ~25 requests because one `router.refresh()` re-fetches the page's RSC payload *and* Next.js
re-prefetches every visible row `<Link>` (`/dashboard/submissions/<id>`, 4 requests each). All were
`resourceType: fetch` — no images or scripts re-downloaded.

- **Hidden-tab pause verified:** 0 requests across a full 90 s hidden window, confirming
  `shouldPoll(document.hidden) === false` in `components/refresh-controls.tsx`.
- **Scan-log writes bounded:** a controlled test (count → exactly one scan → count) gave
  `before=30 after=31, delta=1`. One `scan_events` row per scan, no write storm. IP stored as a salted
  hash only (`ip_hash` = `bcdffea8ac41…`), never raw.
- **No notification retry loop:** dry-run mode performs no provider call, so there is nothing to retry.

### D-3 · S3 · Auto-refresh fan-out scales with visible rows

Correct but wasteful: 3 refreshes cost ~76 requests with a handful of rows, and that grows with list
length. On a metered mobile connection with a long inbox this is real traffic for an idle tab.
**Recommendation:** `prefetch={false}` on inbox row links, or make the 30 s refresh manual-only.
Not changed in A6.3.

## QR safeguards (Part E) — complete

Two independent layers, both verified:

| Layer | Check | Result |
|---|---|---|
| 1 — auth | `GET /owner/production/qr.svg`, `qr-sheet.svg`, `export.csv` unauthenticated | **307 → `/login`** for all three; an anonymous caller cannot obtain tag artwork at all |
| 2 — base-URL guard | `*.vercel.app` base URL | `productionBaseUrlIssue()` returns *"is a Vercel preview host"* (`lib/qr/production.ts:49`), so `productionOutputBlock()` refuses durable output unless `?unsafe=1`. Unit-tested at `lib/qr/production.test.ts:33` |

- **Only a disposable test code was used** — `qa-a63-test`, inside the disposable QA org. No production
  or customer short code was touched.
- **Short-code durability across a domain change:** tags encode `NEXT_PUBLIC_SITE_URL + short_code`, and
  the app always *computes* the URL rather than trusting the stored `qr_links.public_url`
  (`lib/qr/url.ts`). `qa-a63-test` therefore stays valid when the domain changes — verified in practice
  during this phase, since the stored `public_url` is a placeholder (`https://qa.invalid/...`) while the
  live scan resolved correctly on staging.
- **No permanent tag was produced, and no artwork was exported from the staging base URL.**

## Notification QA (Part F) — complete, dry-run

| Check | Evidence |
|---|---|
| Provider not configured | `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` absent from the Vercel project (`vercel env ls`) → dry-run by configuration |
| Records persist | **24 `form_submissions`** created in the QA org across damage / support / return during the device passes |
| Renter sees success | every submit reached the thanks page with a `SUB-YYYY-XXXXXX` reference; **no user-facing failure** |
| Dry-run is logged, not sent | `logNotificationEvent` emits `"outcome":"dry_run"` (`lib/notifications/log.test.ts:42`); the outcome flows through the notifier (`notify.test.ts:90`) and `dry_run` explicitly does **not** count as delivered (`outcome.test.ts:21`). 42 notification unit tests pass. |
| No inbox delivery required | none attempted, none claimed |

**Limitation:** the live `[notifications]` line was **not** captured from staging runtime logs — the
`vercel logs` CLI returns a bounded snapshot that did not cover the submission window. Dry-run behaviour
is established by configuration + unit coverage above, not by a staging log line. The operator can
confirm in the Vercel dashboard if a first-hand log is wanted.

---

## Part 2 — Operator real-device matrix ⬜ NOT YET RUN

Everything below needs actual hardware. **Do not fill these in from the automated pass.**

### Setup (once)

1. Get the staging URL + protection-bypass link from `STAGING_DEPLOYMENT_RUNBOOK.md`.
2. On the device, open the bypass link once (`?x-vercel-protection-bypass=…&x-vercel-set-bypass-cookie=true`).
3. Generate a **test** QR pointing at `<staging>/t/qa-a63-test`. Print it on **paper** and write
   "TEST — NOT A REAL TAG" on it. Never on metal, never on equipment.
4. QA logins are in the seed output (`npm run qa:staging:data seed`).

### Device coverage

| # | Device | OS version | Browser | Tester | Date |
|---|---|---|---|---|---|
| 1 | iPhone (current) | | Safari | | |
| 2 | Android (current) | | Chrome | | |
| 3 | Desktop | | Chrome | | |
| 4 | Desktop | | Edge | | |
| 5 | Mac (if available) | | Safari | | |

### Public / renter — per device

| # | Step | Expected | Result | Severity | Notes |
|---|---|---|---|---|---|
| P1 📱 | **Scan the paper QR with the phone camera** | camera recognises the code and offers the link | | | |
| P2 📱 | Follow the link | equipment page loads, tenant name + asset visible | | | |
| P3 | Quick start | expands and is readable without zoom | | | |
| P4 | Documents | "Open" opens the document in a new tab | | | |
| P5 | Acknowledgement | prompt appears; completing it suppresses on re-scan; a new session re-prompts | | | |
| P6 | Damage form | fields reachable; required-field error is clear | | | |
| P7 📱 | **Photo picker / camera capture** | camera + library both offered; captured photo attaches | | | |
| P8 | Damage submit | success page with `SUB-…` reference | | | |
| P9 | Support form | submits, reference shown | | | |
| P10 | Renter return checklist | 3 stages; Back preserves answers; submits | | | |
| P11 📱 | **Weak signal** (1 bar / throttled) | no data loss; submit either succeeds or fails with a clear retry | | | |
| P12 📱 | On-screen keyboard | does not cover the focused field or the submit button | | | |
| P13 📱 | Orientation | rotate mid-form — no layout break, no lost input | | | |
| P14 | Sticky action bar | stays reachable; safe-area respected (notch/home bar) | | | |

### Staff — per device

| # | Step | Expected | Result | Severity | Notes |
|---|---|---|---|---|---|
| S1 | Login | lands on dashboard | | | |
| S2 📱 | Scan the test QR while signed in | "Open staff workflow" appears | | | |
| S3 | Outbound inspection | completes; asset becomes rented | | | |
| S4 | Existing active rental session | attach/blocked state shown correctly | | | |
| S5 | Staff return checklist | completes; asset available, session closed | | | |
| S6 | Session evidence | photos + sections render; print control present | | | |
| S7 | Sign out | returns to `/login`; back button does not restore the session | | | |

### Admin — per device

| # | Step | Expected | Result | Severity | Notes |
|---|---|---|---|---|---|
| A1 | Assets | list loads, filters apply | | | |
| A2 | Submissions | list loads; open a detail | | | |
| A3 | Rentals | list loads; open session evidence | | | |
| A4 | Bulk actions | select-all → resolve works | | | |
| A5 | Export disabled | `/dashboard/export` redirects to settings | | | |
| A6 | Export enabled (org B) | download returns a CSV | | | |
| A7 | Print evidence | print preview is legible and paginated | | | |
| A8 | Navigation | back from a detail returns to the **filtered** list | | | |

### Known issue to confirm on real hardware

D-1 (admin table overflow) was measured under emulation. Confirm how bad it actually feels on a real
phone — that judgement should set its final severity.

---

## Cleanup

When QA is finished: `npm run qa:staging:data cleanup`, then revoke the protection-bypass token and
destroy the paper test QR.
