# Dependency Advisory Ledger — Mulemark

Record of dependency security advisories reported by `npm audit`: which ones reach this app, why, and what was done.
Applicability is judged from each advisory's **stated preconditions** against the code at the named commit. "Does not
apply" means a stated precondition is absent from the app; it is not a claim that the code was fuzzed. Re-check an
entry when the app adopts a feature named in a precondition (for example `next/image`, `next/og`, `'use cache'`, the
Edge runtime, or a self-hosted server).

---

## 2026-11-23 — `next` and `eslint-config-next` 16.2.9 → 16.4.5

| | |
|---|---|
| Branch | `fix/next-security-16-4-5`, cut from the Production commit `8f6c514` (`/api/version` and the GitHub deployments API both reported it live on 2026-11-23) |
| Change | `package.json` (`next` and `eslint-config-next` pinned to `16.4.5`) and `package-lock.json` |
| Status | **In Production** since 2026-11-24 16:00 UTC (the `e4e7e01` Preview, promoted by the operator). The Preview passed the staging smoke and the `after()` scan-logging check, and Production passed `npm run smoke:production` (below). Follow-ups are listed at the end |

### Why

`npm audit` on 2026-11-23 placed `next@16.2.9` inside **25 GitHub advisories**: 5 critical, 6 high, 13 moderate and
1 low. `eslint-config-next` is versioned in lockstep with `next` and moves with it. Production runs on Vercel (Linux),
not on Windows.

### Version choice

| Version | Published | Age on 2026-11-23 | Notes |
|---|---|---|---|
| 16.4.1 | 2026-10-14 | 40 days | First release that clears every advisory that applies here (GHSA-p3m5-59mp-jv5r) |
| 16.4.4 | 2026-11-02 | 21 days | Reverts an SWC minifier regression present in 16.4.0–16.4.3 |
| **16.4.5** | **2026-11-03** | **20 days** | **Chosen.** Security-only release on top of 16.4.4; clears all 25 advisories |
| 16.4.6 | 2026-11-09 | 14 days | Newest; adds route-handler response compression and dev-only Turbopack fixes, none needed here |

The strict rule ("lowest version that clears the applicable advisories, at least two weeks old") gives 16.4.1. The
operator chose **16.4.5** on 2026-11-23 after these later 16.4.x fixes were found:

- **Strict mode lost in production builds.** 16.4.0 shipped
  [vercel/next.js#98421](https://github.com/vercel/next.js/pull/98421), which moved `"use strict"` into a shared chunk
  wrapper. That exposed an SWC minifier bug: some functions silently lost strict mode in production builds. 16.4.4
  reverted it on the LTS line ([#100866](https://github.com/vercel/next.js/pull/100866)). 16.2.9 never had it, so
  16.4.1–16.4.3 would have introduced it.
- **Google Fonts builds** ([#100158](https://github.com/vercel/next.js/pull/100158), 16.4.3): Google sometimes returns
  WOFF2 URLs without an extension, which failed the build. `app/fonts.ts` uses `next/font/google`.
- **Proxy cold path** ([#100384](https://github.com/vercel/next.js/pull/100384), 16.4.3): importing `next/server` in
  `proxy.ts` pulled the 688 KB app-page runtime into the proxy function.
- **Turbopack persistent cache** (16.4.2): snapshot-consistency fixes for the filesystem cache, which `next build`
  uses by default since 16.3.0.

`eslint-config-next`, `@next/eslint-plugin-next`, `@next/env` and the `@next/swc-*` binaries 16.4.5 were all published
on 2026-11-03.

### Which advisories apply

Fixed-in versions are the first patched release on the 16.x line.

**Applies to Production**

| Advisory | Severity | Fixed in | Why it applies |
|---|---|---|---|
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) — DoS in App Router using Server Actions | high | 16.4.1 | 21 `'use server'` modules under `lib/` (the `*actions.ts` files), including the anonymous public forms (`lib/forms/actions.ts`) |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) — DoS in App Router using Server Actions | high | 16.2.11 | Same surface |
| [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) — Server Function endpoint IDs disclosed | moderate | 16.2.11 | Same surface. Administrative actions call `requireCustomerAdmin(OrgId)` inside the action and RLS backs every write (`docs/SECURITY_MODEL.md`), so a disclosed action ID grants nothing by itself: reconnaissance only |

**Applies only to local Windows dev and test servers**

| Advisory | Severity | Fixed in | Why |
|---|---|---|---|
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) — RCE on Windows-hosted servers | critical | 16.3.3 | Vercel is Linux. The Playwright web server (`next build && next start`) and `next dev` run on the operator's Windows machine, and `next start` listens on `0.0.0.0` unless `-H` is given. Any checkout still on 16.2.9 keeps this exposure until it takes this upgrade |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) — `next dev` MCP endpoint discloses development data | low | 16.3.8 | Only `next dev`; Production never serves the endpoint |

**Does not apply** (a stated precondition is absent)

| Advisory | Severity | Fixed in | Precondition | This app |
|---|---|---|---|---|
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) — RCE in Image Optimization (AVIF) | critical | 16.3.3 | Image Optimization processes an attacker's image | No `next/image`; no `images` config or `remotePatterns`; Vercel serves `/_next/image` itself |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — RCE in Image Optimization (SVG) | critical | 16.4.1 | Same | Same |
| [GHSA-q8wf-6r8g-63ch](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) — Image Optimization DoS (SVG) | moderate | 16.2.11 | `remotePatterns`, self-hosted ("Vercel: not impacted") | Same |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) — SSRF in Image Optimization | high | 16.3.8 | `images.remotePatterns` configured | None configured |
| [GHSA-7qx7-33qx-rqx2](https://github.com/advisories/GHSA-7qx7-33qx-rqx2) — SVG rejection bypass in Image Optimization | moderate | 16.4.5 | Self-hosted image optimizer | Vercel; no `next/image` |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) — RCE in `next/og` `ImageResponse` | critical | 16.3.6 | Attacker values rendered through Node `ImageResponse` | `next/og` is never imported |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) — RCE in `'use cache'` returning typed arrays | critical | 16.4.1 | Cache Components with such a `'use cache'` function | `cacheComponents` is off; no `'use cache'` anywhere |
| [GHSA-rhh4-g77r-r9qj](https://github.com/advisories/GHSA-rhh4-g77r-r9qj) — `'use cache'` with binary arguments | moderate | 16.4.5 | `'use cache'` | Same |
| [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8) — nested `'use cache'` root-param leak | moderate | 16.4.5 | Cache Components | Same |
| [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) — unbounded Server Action payload | moderate | 16.2.11 | Server Action on the Edge runtime | No Edge runtime anywhere (only `runtime = "nodejs"` on the cron route) |
| [GHSA-f3mh-rxg3-f5g2](https://github.com/advisories/GHSA-f3mh-rxg3-f5g2) — HttpOnly cookie exposed via internal header | moderate | 16.4.5 | Edge runtime route handlers setting cookies | Same; `proxy.ts` runs on Node.js (Next 16 proxies cannot use Edge) |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) — SSRF in Server Actions | high | 16.2.11 | Client-controlled `Host` (custom servers) | Vercel pins the host ("managed hosting is not affected") |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) — SSG/ISR cache poisoning | moderate | 16.3.8 | Self-hosted Pages Router | App Router on Vercel |
| [GHSA-pc58-hwjq-p385](https://github.com/advisories/GHSA-pc58-hwjq-p385) — response desync when forwarding fetched responses | moderate | 16.4.5 | Self-hosted behind a pipelining HTTP/1.1 proxy | Vercel |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) — SSRF in rewrites | high | 16.2.11 | External rewrite destination with a dynamic hostname | `noJsRewrites()` (`lib/public/nojs.ts`) rewrites to internal `/nojs/...` paths only |
| [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) — proxy bypass | high | 16.2.11 | Turbopack build with a single `i18n.locales` entry | No `i18n` config |
| [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) — fetch cache confusion (request bodies) | moderate | 16.2.11 | `fetch(new Request(init), differentInit)` | Not used; supabase-js calls `fetch(urlString, init)` |
| [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) — fetch cache confusion (non-UTF-8 bodies) | moderate | 16.2.11 | Request bodies in a charset other than UTF-8 | supabase-js sends UTF-8 JSON |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) — metadata image routes ignore `dynamicParams` | moderate | 16.3.8 | `opengraph-image` / `twitter-image` routes, webpack builds | None (only a static `app/icon.svg`); builds use Turbopack |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) — SSG/ISR cache poisoning | moderate | 16.3.8 | Root-level catch-all page | No catch-all routes |

Two more advisories, [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h) and
[GHSA-vvgp-ww4w-46vf](https://github.com/advisories/GHSA-vvgp-ww4w-46vf), affect 16.3.0–16.4.4 and 16.4.0–16.4.4.
They did not affect 16.2.9 and do not affect 16.4.5. Both need `'use cache'` / Cache Components, which the app does
not use, so no intermediate version would have exposed the app either.

`next@16.2.9` also shipped a nested `postcss@8.4.31`, which falls in four PostCSS advisories. PostCSS runs at build
time on the app's own CSS only, so they do not apply; `next@16.4.5` pins `postcss@8.5.23`, outside every affected
range.

### Breaking-change review (`node_modules/next/dist/docs/`, 16.2.9 → 16.4.5)

The bundled docs went from 422 to 474 files: 59 added, 7 removed and 182 changed (by content hash, against the 16.2.9
copy in the main checkout). The removals are the `viewTransition` config page and six renumbered Pages Router adapter
pages. Reviewed: the v16 upgrade guide, every 16.3 and 16.4 version-history row, and the pages for what this app uses
— `proxy`, `serverActions`, `rewrites`, TypeScript, ESLint, the `runtime` segment option, `error.js`, `next/font`,
`after()`, `unstable_rethrow`, `redirect()` and `cookies()` / `headers()`.

No change requires a code edit in this app. Behaviour changes worth knowing:

- **Type checking in `next build`** now runs the project's own `tsc` CLI (`experimental.useTypeScriptCli`, on by
  default). It checks the whole project selected by `tsconfig.json`, including tests and `.next/dev/types` when present
  — the same set `npm run typecheck` checks. The Playwright web server already deletes `.next/dev` before building.
- **On by default since 16.3.0:** the Turbopack filesystem cache for `next build`
  (`experimental.turbopackFileSystemCacheForBuild`), prerender source maps (`enablePrerenderSourceMaps`) and prefetch
  inlining (`experimental.prefetchInlining`).
- **Edge runtime deprecated;** `experimental.dynamicIO` and `experimental.useCache` removed. The app uses none of them.
  `export const runtime = "nodejs"` on the cron route stays valid while Cache Components is off.
- **`AGENTS.md`:** `next dev` now creates and updates the `nextjs-agent-rules` block when it detects an AI coding agent
  (`node_modules/next/dist/server/lib/generate-agent-files.js`; switch off with `agentRules: false`). The text differs
  from the block committed here, so the first `next dev` started by an agent will rewrite it; commit that change
  rather than reverting it.
- **`eslint-config-next` 16.4** supports ESLint 10 and needs `typescript-eslint` ^8.56 and
  `eslint-plugin-react-hooks` ^7.1. The lockfile already had 8.61.1 and 7.1.1.
- **Server Actions:** the docs now say `bodySizeLimit` counts the raw request body including multipart overhead. The
  4 MB limit stays; Vercel's 4.5 MB request cap governs uploads anyway (`next.config.ts`).
- **Proxy:** the proxy function may take a second `event` argument (`NextFetchEvent`). Additive only.
- **`error.js`:** `retry()` became stable in 16.3.0 and is now the recommended recovery (it re-fetches). `reset()` is
  still supported, so the two boundaries that use it (`app/forms/[shortCode]/error.tsx`,
  `app/(staff)/staff/t/[shortCode]/error.tsx`) are unchanged.
- **PostCSS:** the new `turbopackLocalPostcssConfig` option defaults to `false`, so the root `postcss.config.mjs`
  still applies to every CSS file.

### Side effect: a second `sharp`

`next@16.4.x` declares `sharp ^0.35.5` as an optional dependency, while the app pins `sharp@0.34.5` for the
email-preview transform (`lib/notifications/preview-image.ts`; `ACTIONABLE_NOTIFICATION_DESIGN.md` §8.3). npm
therefore installs `sharp@0.35.5` under `node_modules/next/` for Next's image optimizer, which this app does not use.
After the upgrade, `npm ls sharp` shows `next@16.4.5 → sharp@0.35.5` next to the app's `sharp@0.34.5`. The lockfile
gained the nested copy with its `@img/sharp-*@0.35.5` and `@img/sharp-libvips-*@1.3.4` platform packages, plus two
wasm-only platform packages hoisted to the root (`@img/sharp-freebsd-wasm32`, `@img/sharp-webcontainers-wasm32`). In
the local build only `.next/next-server.js.nft.json` — the self-hosted `next start` server — traces the nested copy;
the 12 route traces that include sharp all point at the app's 0.34.5.

The pin was deliberately left alone to keep this change to the two packages named. sharp's own advisories
([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) libvips,
[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) libheif,
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) librsvg) name the GIF, TIFF, VIPS, HEIF and
SVG decoders. The preview transform admits only bytes that sniff as JPEG, PNG or WebP and whose decoded container
matches the sniff, so none of those decoders runs on untrusted input. Raising the pin to 0.35.5 would restore a single
install; that is a follow-up, below.

### Verification

**Local**, in a worktree of the branch (Node 24.16.0 and npm 12.0.2, outside the Node 22 baseline, as recorded in
earlier phases). The same commands ran before and after the upgrade; the build used CI's placeholder public env, and
the worktree holds no `.env*` file.

| Check | 16.2.9 (baseline) | 16.4.5 |
|---|---|---|
| `npm run verify:production-config` | 0 fail, 3 warn (local env unset), 5 pass | Same |
| `npm run lint` | Clean | Clean |
| `npm run typecheck` | Clean | Clean |
| `npm test` | 213 files, 2,450 tests passed | Same |
| `npm run build` | Compiled (Turbopack) | Compiled; identical route table; the same 15 brand font files |
| `npm run check:scan-bundle` | OK: 5 photo-adapter chunks, none loaded by the scan pages | Same |
| `npm audit` | `next` critical (25 advisories) | No `next` or `eslint-config-next` entry; 0 critical |

- `package.json` changed by exactly the two pins. The lockfile added 29 entries, changed 17 and removed none: the
  `next`, `@next/*` and `@swc/helpers` versions, next's nested `postcss@8.5.23` and `sharp@0.35.5`, and three
  transitive bumps:
  - `nanoid` 3.3.12 → 3.3.20: required by `postcss@8.5.23` (`^3.3.16`). It also clears
    [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) and
    [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8).
  - `@emnapi/runtime` 1.11.1 → 1.11.3: required by sharp 0.35.5's optional wasm build.
  - `fastq` 1.20.1 → 1.20.3: refreshed within its range in the lint-only `@next/eslint-plugin-next` → `fast-glob`
    chain.
- `next build` rewrote no tracked file (`tsconfig.json` and `AGENTS.md` unchanged).
- npm 12 blocked two install scripts (the `sharp@0.34.5` binary check and `unrs-resolver`'s postinstall). Both packages
  ship prebuilt platform binaries, and Vercel's npm 10 runs the scripts anyway.

**Vercel Preview.** The upgrade commit `352ea6e` built as GitHub deployment `8013779169`: environment **Preview**,
state **success**, 2026-11-23 23:21 UTC, host `qr-asset-tags-o160jrl35-jdapaetz2-s-projects.vercel.app`. Vercel
builds with the project's Node 22.x setting. The docs commit `d340893` built as deployment `8013854013`
(`qr-asset-tags-lvldwde0h-jdapaetz2-s-projects.vercel.app`), also **success**. Every later docs-only commit on the branch
builds its own Preview with identical application code. Pushing the branch deployed nothing to Production.

**Staging smoke.** `scripts/smoke/staging.mjs` ran with `QA_BASE_URL` set to that deployment; a value set in the shell
overrides the env file's own URL, so the `phase-e/showcase-onboarding` alias was not used. Result: **29 checks, 28
pass, 0 fail, 1 skipped**. It covered:
- the staging-only isolation probe;
- the public scan page, and the support and damage forms (anonymous Server Actions);
- the return checklist and the acknowledgement prompt;
- owner, admin and staff logins through `proxy.ts`;
- exports, cross-tenant denials and sign-out.

The skipped check is the notification `dry_run` line, which only the Vercel runtime log shows.

**Work deferred with `after()`.** Scan logging and submission notifications both run in `after()`, which the smoke
cannot observe. On the operator's go-ahead, `scripts/staging/scan-reliability.mjs --confirm` (the
`staging:scan-reliability` script) ran with `QA_BASE_URL` set to the branch-tip Preview (`…-lvldwde0h-…`, `d340893`).
It verified the staging target first. **All checks passed:**
- 20 of 20 scans returned a rendered equipment page;
- exactly 20 `scan_events` rows landed, with no loss and no duplicates, all present 414 ms after the last scan;
- every row is distinct and attributed to the probe asset, QR and organization;
- no row stores anything but a hashed IP.

The script created its own disposable organization and deleted it afterwards. Submission notifications use the same
`after()` mechanism; their `dry_run` log line was not observed separately.

**Production.** On 2026-11-24 the operator promoted the `e4e7e01` Preview (`…-5keqwt47i-…`). Vercel built it as
**Production rebuild of FTkvSamdB** (Ready in 1 min 15 s) and reported it to GitHub as deployment `8033256682`:
environment **Production**, state **success**, 16:00:16 UTC, host
`qr-asset-tags-eqh56bdyh-jdapaetz2-s-projects.vercel.app`. From 16:00:21 UTC, `/api/version` on both `mulemark.io` and
`qr-asset-tags.vercel.app` reported `e4e7e01` with environment `production`. Earlier attempts that day created no
deployment at all. A promotion that registers shows in Vercel's Deployments list as a **Production rebuild of …** row,
and `/api/version` switches once that build is Ready.

**Production smoke.** `npm run smoke:production` ran from the worktree at 16:01 UTC, with no
`.env.production-smoke.local` and `PRODUCTION_SMOKE_SHORT_CODE` unset. Result: **14 checks, 13 pass, 0 fail, 1
skipped**, the same result as the Phase E release smoke. It covered:
- serving: the landing page and login return 200, and the served HTML names no `vercel.app` or `localhost` host;
- the `www` → apex redirect (308, path preserved);
- the staging-only isolation probe, which does not resolve on Production;
- the unknown-tag notice, which gives no reason;
- the anonymous guards: the dashboard, owner console and submissions redirect to `/login`, and the customer export
  download and the owner's production QR SVG and CSV are not served (307).

The skipped check is the scan-page render. Loading a real tag writes a `scan_events` row, so that check runs only
against an operator-designated test asset.

### Not changed here (follow-ups)

- **Align the `sharp` pin** with Next's (0.35.5) for a single native install. That also clears sharp's own advisories
  as defence in depth. Re-run the preview-transform tests, the email gallery and the Phase E media scripts that use
  sharp. **Done in the next entry.**
- **Triage the remaining `npm audit` findings.** After this change the worktree reports 19 entries, none in `next`:
  `sharp` (direct, above); the root `postcss@8.5.15` via `@tailwindcss/postcss`; `zod`; `vite`, `vitest` and
  `@vitest/mocker`; `typescript-eslint` with its `minimatch` and `brace-expansion` chain; `browserslist`,
  `baseline-browser-mapping`, `js-yaml` and `source-map-js`. None was reviewed here. **Done in the next entry; 7
  moderate entries remain until 2026-11-30.** They were cleared on 2026-11-27, in the 2026-11-27 entry.
- **Carry the upgrade into the working branches** (`phase-e/showcase-onboarding`, `fix/public-touch-targets`,
  `fix/public-focus-not-obscured`). **Done.** The two `fix/public-*` branches merged this branch without conflicts on
  2026-11-24 (`d1d6d3a`, `0877538`). `phase-e/showcase-onboarding` was fast-forwarded on 2026-11-25 to `f4db7f1`, a
  merge prepared on `fix/phase-e-next-16-4-5`. There the intake kit's `docx` and `exceljs` made both package files
  conflict: `package.json` took the two pins, and `package-lock.json` is a three-way merge that keeps this upgrade's
  46 entries verbatim. Each merged tree passed lint, typecheck, `npm test`, the build and `check:scan-bundle`, with
  routes and fonts identical to this branch, and each Preview built. Promoting any of the three keeps Production on
  16.4.5, and their local Playwright and dev servers no longer run 16.2.9 (GHSA-p293-qw3h-jr36).
- **CI on Node 22.** `ci.yml` runs on `main`, `pilot-credibility` and pull requests only, so pushing this branch ran no
  workflow. A pull request would run lint, typecheck, test and build, the e2e critical subset and the executed security
  suite.
- **`AGENTS.md`.** Commit the block that `next dev` rewrites the first time a coding agent runs it on 16.4.5.

---

## 2026-11-24 — `sharp` 0.34.5 → 0.35.5, and the other `npm audit` entries

| | |
|---|---|
| Branch | `fix/deps-sharp-audit-triage`, cut from `fix/next-security-16-4-5` at `e4e7e01`. Production was still on `8f6c514` (`/api/version`), so the 16.4.5 branch was the base |
| Change | `package.json`: the `sharp` pin, `0.34.5` → `0.35.5`, and nothing else. `package-lock.json`: the in-range updates below. `lib/notifications/preview-image.ts`: one type line |
| Status | **In Production** since 2026-11-27 00:44 UTC, in the combined release `release/2026-11-26` (`09496a5`, promoted by the operator) together with the 44 px tap targets and the focus fix. Its Preview passed the staging smoke and the sharp runtime check, and Production passed `npm run smoke:production` (below). Follow-ups are listed at the end |

### Why

The 16.4.5 entry left two follow-ups:
- `next@16.4.5` asks for `sharp ^0.35.5` while the app pinned `0.34.5`, so npm kept two native copies.
- `npm audit` listed 19 entries that nobody had reviewed: 8 high, 11 moderate, none critical, none in `next`.

### Where each entry runs

A Vercel function ships only the files in its `.nft.json` trace, so the traces decide what can run in Production. In
the 79 traces of the build, the only flagged package is `sharp`. It appears in 12 page traces, for the email-preview
transform, together with its helpers `@img/colour`, `detect-libc` and `semver`. Until this change, the self-hosted
`next start` trace (`next-server.js.nft.json`) also listed Next's nested copy. No other flagged package appears in any
trace, before or after this change.

**Applies to Production: `sharp` 0.34.5**

| Advisory | Severity | Fixed in | Upstream library |
|---|---|---|---|
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — libvips CVE-2026-33327, -33328, -35590, -35591 | high | 0.35.0 | libvips |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) — libheif GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545 | high | 0.35.4 | libheif (HEIF and AVIF) |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) — librsvg CVE-2026-96889 | high | 0.35.5 | librsvg (SVG) |

The only runtime caller is the preview transform (`lib/notifications/preview-image.ts`). Before any decoder runs:
- it caps the input bytes;
- it admits only bytes that sniff as JPEG, PNG or WebP;
- the decoded container must match the sniff;
- it enforces `limitInputPixels` on the header read.

So none of the decoders named by the 16.4.5 entry ever sees untrusted bytes: GIF, TIFF, VIPS, HEIF/AVIF or SVG. The pin
was raised anyway, for one native install and defence in depth.

**Build, lint and test only: does not apply to Production**

All of these run only on the operator's machine and in CI, and only on the repository's own inputs.

| Entry | Advisories | Pulled in by | Runs in | Why it does not apply |
|---|---|---|---|---|
| `postcss` 8.5.15 (root) | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) high, [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) moderate — a `sourceMappingURL` in the CSS reads `.map` files outside the project | `@tailwindcss/postcss` 4.3.1, which pins `8.5.15` exactly and is therefore flagged too; vite | `next build`, Vitest | PostCSS only processes the repository's own CSS (`app/globals.css` and its imports). The advisories need attacker-controlled CSS |
| `source-map-js` 1.2.1 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) high — event-loop DoS from indexed source-map offsets | postcss, `@tailwindcss/node` | build | Needs an attacker-crafted source map |
| `zod` 4.4.3 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) high — memory exhaustion on oversized arrays | `eslint-plugin-react-hooks`, `zod-validation-error` | `npm run lint` | The app never imports zod. Only the ESLint rule options pass through it |
| `vite` 8.0.16 | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) (launch-editor; one high), [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) low, [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) moderate | vitest | `npm test`, CI | All five need a running Vite dev server: its open-in-editor middleware, `transformIndexHtml` in middleware mode, or a server exposed with `--host`. `vitest run` in the node environment, with no browser mode, `--ui` or `--api`, starts none of these |
| `vitest`, `@vitest/mocker` 4.1.9 | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) moderate | direct dev dependency | `npm test`, CI | Both need a client that can reach the mocker on a dev-server WebSocket: an `interceptorPlugin` exposed by a dev server, or browser mode. Neither is used |
| `typescript-eslint` 8.61.1, its five `@typescript-eslint/*` packages, `minimatch` 10.2.5 | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) moderate — glob amplification | `eslint-config-next` | lint | Glob patterns come from the repository's ESLint config and file tree |
| `brace-expansion` 5.0.6 (under that `minimatch`) and 1.1.15 (under ESLint's `minimatch` 3) | Six DoS advisories, five high: [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | ESLint and its plugins | lint | Same: no untrusted pattern reaches it |
| `browserslist` 4.28.2 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) high | `@babel/core` inside `eslint-plugin-react-hooks` | lint | The queries are fixed and there is no `browserslist-stats.json`. Next uses its own compiled copy |
| `baseline-browser-mapping` 2.10.37 | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) moderate — `process.exit` on invalid input | `next` (its compiled browserslist), browserslist | build | Called only with Next's fixed build targets, and absent from every function trace |
| `js-yaml` 4.2.0 | [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) high — quadratic CPU | `@eslint/eslintrc` | lint | ESLint reads the flat config `eslint.config.mjs`; no YAML is parsed |

### Version choice

The rule: take the lowest version that clears the entry and fits the existing dependency ranges, as long as it is at
least two weeks old. Every version npm resolved was capped with `--before=2026-11-09T00:00:00Z`.

| Package | Was | Now | Published | Age on 2026-11-24 | Notes |
|---|---|---|---|---|---|
| `sharp` (direct, exact) | 0.34.5 | **0.35.5** | 2026-09-27 | 58 days | First release that clears all three advisories. Next's `^0.35.5` now dedupes onto it |
| `tailwindcss`, `@tailwindcss/postcss` (direct, `^4`) | 4.3.1 | **4.3.2** | 2026-06-29 | 148 days | 4.3.1 pins `postcss` to `8.5.15` exactly; 4.3.2 is the first release that accepts a range (`^8.5.15`). lightningcss stays 1.32.0 |
| `postcss` | 8.5.15 | **8.5.23** | 2026-07-24 | 123 days | First fixed release. It is also Next's exact pin, so one copy remains |
| `source-map-js` | 1.2.1 | **1.2.2** | 2026-09-30 | 55 days | First fixed release |
| `zod` | 4.4.3 | **4.6.6** | 2026-10-11 | 44 days | First fixed release |
| `vite` | 8.0.16 | **8.1.6** | 2026-10-06 | 49 days | First fixed release after 8.0. Versions 8.2.0–8.2.3 are also affected |
| `vitest`, `@vitest/*` (direct, `^4.1.9`) | 4.1.9 | **4.1.12** | 2026-10-15 | 40 days | First release that fixes both mocker advisories |
| `brace-expansion` | 1.1.15 / 5.0.6 | **1.1.21 / 5.0.12** | 2026-09-14 | 71 days | First fixed release on each line |
| `browserslist` | 4.28.2 | **4.28.7** | 2026-07-21 | 126 days | First fixed release |
| `baseline-browser-mapping` | 2.10.37 | **2.11.0** | 2026-07-21 | 126 days | First fixed release |
| `js-yaml` | 4.2.0 | **4.3.2** | 2026-08-26 | 90 days | First release that fixes all three |
| `typescript-eslint` → `minimatch` | 8.61.1 → 10.2.5 | **unchanged** | — | — | No `minimatch` 10.x is fixed. The first fix is `typescript-eslint` 8.73.0 (2026-11-16, 8 days old), which moves to `minimatch ^11.0.1`. Eligible from **2026-11-30**; taken on **2026-11-27** as a one-time exception (the 2026-11-27 entry) |

`package.json` changed only on the `sharp` line. The direct dev dependencies keep their ranges (`^4`, `^4.1.9`), and
the lockfile carries the newer versions.

The lockfile added 2 entries, changed 82 and removed 27. Every new version was published before 2026-11-09.

The changes, by reason:
- **Targets and their lockstep packages:**
  - `@img/sharp-*` 0.35.5 and `@img/sharp-libvips-*` 1.3.4;
  - `@tailwindcss/node`, `@tailwindcss/oxide` and its platform packages at 4.3.2;
  - `@vitest/*` at 4.1.12.
- **Required by a target's own ranges:**
  - vite 8.1.6 needs rolldown 1.0.3 → 1.1.5, its `@rolldown/binding-*` packages, `@oxc-project/types` 0.139.0, and
    its nested `picomatch` 4.0.4 → 4.0.7.
  - browserslist 4.28.7 needs `caniuse-lite` 1.0.30001799 → 1.0.30001823, `electron-to-chromium` 1.5.372 → 1.5.478
    and `node-releases` 2.0.47 → 2.0.63.
  - sharp 0.35.5 needs its nested `semver` 7.8.4 → 7.8.6.
  - The wasm-only helpers under rolldown's wasm32 binding: `@napi-rs/wasm-runtime` 1.2.7, `@tybys/wasm-util` 0.10.4
    and `@emnapi/*`. They are never installed on x64.
- **Removed by deduplication:**
  - Next's nested `sharp`, its 23 `@img` platform packages, its `postcss` and its `semver`;
  - the old `@img/sharp-wasm32@0.34.5`.

npm also refreshed `chai` and `tinyrainbow`, which no range required, so they were put back to their base versions. A
fresh `npm ci` reproduces the tree.

### `sharp` 0.35 breaking-change review

Sources: the changelog for v0.35.0–v0.35.5 (lovell/sharp, `docs/src/content/docs/changelog/`) and a side-by-side
comparison of the two versions' type definitions. libvips goes from 8.17.3 to 8.18.7 (sharp-libvips 1.3.4).

| Change | Effect here |
|---|---|
| ESM build with an `exports` map; ESM typings with a default export plus named exports | **One code change.** Under `moduleResolution: "bundler"`, `typeof import("sharp")` now resolves to the ESM module namespace, which is not callable: two TS2349 errors in `preview-image.ts`. The factory type is now `typeof import("sharp").default`. Runtime is unchanged: the loader already took `mod.default ?? mod`, and Turbopack loads the CJS entry (`dist/index.cjs`) through its external link |
| Node ≥ 20.9; the `install` script is removed | Vercel runs Node 22. The binaries come prebuilt from the lockfile's `@img/*` packages. npm 12 no longer has a sharp install script to block |
| `limitInputChannels` now defaults to 5 | Every input is JPEG, PNG, WebP, SVG, or raw with 3–4 channels |
| Removed `failOnError`, `paletteBitDepth` and the positional `sharpen()`; `jp2k` renamed to `jp2`; lossy AVIF tuned with `iq`; TIFF `bitdepth` limited to 1, 2 or 4 | None of these is used anywhere |
| 0.35.3: tighter checks on `text` and `extend` values, background colours, and create/raw sizes | Every value passed is an integer, a number or a hex string. Every caller below still works |
| 0.35.4: palette bit depth rounds up | `png({ palette: true, colours: 64 })` used to produce 4-bit PNGs (at most 16 colours). It now produces 8-bit. This changes the email logo on a re-run (below) |

**The other sharp users**

A scratch probe outside the repository replayed all 27 distinct sharp call patterns on both versions, with the
repository's exact options.
- All 27 pass, with the same formats, dimensions and channels.
- 24 of 27 outputs are byte-identical. These include every preview-transform case and its refusal message, `Input image
  exceeds pixel limit`, which the code matches.
- The three differences: the email logo, and two PNGs whose size is unchanged but whose bytes differ.

| File | Sharp use | Checked by | Result on 0.35.5 |
|---|---|---|---|
| `lib/notifications/previews.test.ts`, `lib/media/consumer-photo/prepare-photos.test.ts`, `scripts/phase-e/packs/packs.test.mjs` | Generated inputs, the real preview transform, metadata of the committed media | `npm test` | Pass |
| `tests/email/email.gallery.test.ts` | The real preview transform on generated photos, rendered in Chromium | `npm run email:gallery`, before and after | 15 of 15 both times. All 76 non-screenshot outputs are byte-identical, including the HTML, the text and each preview's recorded size |
| `scripts/phase-e/packs/photo-derivatives.mjs` | Raw input, resize, extend, extract, a Pango credit label, `withExif`, JPEG (mozjpeg) and WebP | `npm run phase-e:packs:photos` from the source vault, before and after, then restored | Byte-identical to the committed media under both versions |
| `scripts/phase-e/packs/guide-build.mjs` | SVG at density 144 → palette PNG and lossless WebP; Chromium PDFs | `npm run phase-e:packs:guides`, before and after, then restored | Byte-identical to the committed guides under both versions |
| `scripts/phase-e/showcase/make-media.mjs` | Pango text tags, composite, extract, resize (lanczos3), PNG and WebP | `npm run phase-e:showcase:media -- --preview=<outside the repo>`, before and after | All 11 images render at the same sizes. 8 are byte-identical; the other 3 illustrations are pixel-identical (only their PNG encoding differs) |
| `scripts/brand/export-email-logo.mjs` | SVG → `png({ palette: true, colours: 64 })` | `npm run brand:email-logo`, before and after, then restored | 0.34.5 reproduces the committed logo byte for byte. 0.35.5 writes an 8-bit palette PNG instead: 246 colours, 3,768 bytes, against the committed 4-bit one with 16 colours and 2,176 bytes. 7% of pixels differ, by at most 31 levels per channel. The committed logo is unchanged |
| `scripts/phase-e/packs/pack-review.mjs` | Resize and WebP thumbnails, only for the private gallery inside the source vault | Probe (a real run would write into the vault) | Same output |
| `scripts/production/lib/qa-forms.mjs`, `scripts/qa/admin-upload-verify.mjs`, `scripts/qa/direct-upload-verify.mjs`, `tests/e2e/support/actions.ts` | `create`, raw input with an SVG `composite`, `withMetadata({ orientation })`, JPEG, PNG and WebP, `metadata()` | Probe (they need staging, Production or the local Supabase stack); `actions.ts` also passes typecheck | Same formats and sizes |

### Verification

**Local**, in a worktree of the branch. The environment is Node 24.16.0 and npm 12.0.2, outside the Node 22 baseline.
- **Baseline:** `e4e7e01`, installed with `npm ci`.
- **After:** this change, tested after deleting `node_modules` and running `npm ci` again.
- **Builds:** CI's placeholder public env. The worktree holds no `.env*` file.

| Check | Baseline (`e4e7e01`, sharp 0.34.5) | After |
|---|---|---|
| `npm run verify:production-config` | 0 fail, 3 warn (local env unset), 5 pass | Same |
| `npm run lint` | Clean | Clean |
| `npm run typecheck` | Clean | Clean. Without the type fix: two TS2349 errors in `preview-image.ts` |
| `npm test` | 213 files, 2,450 tests passed | Same |
| `npm run build` | Compiled (Turbopack) | Compiled from an empty `.next`; identical route table |
| Built CSS | 2 files | Byte-identical: the same 2 files with the same SHA-256. Tailwind 4.3.2 and PostCSS 8.5.23 change nothing |
| `npm run check:scan-bundle` | OK: 5 photo-adapter chunks; the scan page and its no-JavaScript copy load none | Same |
| `npm audit` | 19: 8 high, 11 moderate | 7 moderate: `typescript-eslint`, its five `@typescript-eslint/*` packages, and `minimatch` |
| `npm ls sharp` | `sharp@0.34.5`, plus `next → sharp@0.35.5` | `sharp@0.35.5` only; Next's dependency dedupes onto it |
| Function traces (79) | `sharp@0.34.5` in 12 page traces; Next's nested `sharp@0.35.5` in `next-server.js.nft.json` | `sharp@0.35.5` (`dist/*.cjs`, `@img/sharp-win32-x64@0.35.5`) in the same 12 traces. No nested copy, and no other flagged package |
| Install scripts blocked by npm 12 | `sharp@0.34.5`, `unrs-resolver` | `unrs-resolver` only (sharp 0.35 has no install script) |

**The sharp runtime path.** The build externalizes sharp as `require("sharp-20c6a5da84e2135f")`, which resolves through
`.next/node_modules/` to `node_modules/sharp/dist/index.cjs` (0.35.5, libvips 8.18.7).
- A transform with the preview options, run through that same link, returned a 640×480 JPEG with no EXIF or ICC data.
- `import("sharp")` from the project returns the factory as its default export.
- In `npm test`, the preview tests run `loadSharp()` itself on real 0.35.5.

**Vercel Preview.** The dependency commit `5307abc` built as GitHub deployment `8021049754`: environment **Preview**,
state **success**, 2026-11-24 07:03 UTC. The host is `qr-asset-tags-pr3e9tfh8-jdapaetz2-s-projects.vercel.app`, behind
Vercel Authentication. Vercel builds with the project's Node 22.x setting. Production still served `8f6c514`
afterwards. The docs commit on top builds its own Preview, with identical application code.

**Sharp inside the Vercel runtime.** The Preview build proves the install and the trace, but no automated check runs
the preview transform on Vercel: the staging smoke uploads no photo. The check is manual, before promoting:
1. Submit a damage report with a photo on the Preview.
2. In the deployment's runtime log, find the notification line (`dry_run` / `preview_environment`).
3. Read its preview fields. `previewAttachedCount` 1 means sharp loaded. `previewFailureClass`
   `transformer_unavailable` would mean the binary failed to load.

Hobby keeps runtime logs for one hour.

**It passed on 2026-11-26,** on the combined release's Preview: branch `release/2026-11-26` at `09496a5`, GitHub
deployment `8091823788`, host `qr-asset-tags-3fx56hc3s-jdapaetz2-s-projects.vercel.app`. At 21:25 UTC the operator
sent one damage report with a 1.79 MB photo on the staging QA tag. Its notification line read:
- `previewRequestedCount` 1, `previewAttachedCount` 1, `previewFailureClass` null;
- `previewTransformMs` 1371, `previewBytesBucket` `lt_250kb`;
- outcome `dry_run`, reason `preview_environment`, so no email was sent.

**Production.** The operator promoted that Preview at 2026-11-27 00:44 UTC. Vercel built it as **Production rebuild
of 5SDDN2e53** (Ready in 51 s) and reported it to GitHub as deployment `8098905539`:
- environment **Production**, state **success**, 00:44:07 UTC;
- host `qr-asset-tags-qd0bt41ns-jdapaetz2-s-projects.vercel.app`.

By 00:45 UTC, `/api/version` on both `mulemark.io` and `qr-asset-tags.vercel.app` reported `09496a5` with
environment `production`.

**Production smoke.** `npm run smoke:production` ran from the release worktree at 00:45 UTC, with no
`.env.production-smoke.local` and `PRODUCTION_SMOKE_SHORT_CODE` unset. Result: **14 checks, 13 pass, 0 fail, 1
skipped** (the scan-page render, which would write a `scan_events` row). `phase-e:health:production` passed 5/5 on
both hosts; it makes scan-free `/nojs/t/` checks. The release is recorded in full in `docs/phase-e/WORK_LOG.md`,
"Release (2026-11-26)".

### Not changed here (follow-ups)

- **`typescript-eslint` 8.73.0 from 2026-11-30.** It is the first release that leaves `minimatch` 10.x, and it clears
  the last 7 entries. It is an in-range, lockfile-only update: `eslint-config-next` asks for `^8.56.0`. Re-run lint
  afterwards. **Done on 2026-11-27**, three days early, as a one-time exception the operator approved. Lint is clean.
  See the 2026-11-27 entry.
- **The email logo.** `npm run brand:email-logo` now writes the 8-bit palette PNG (3,768 bytes). The committed 4-bit
  logo (2,176 bytes) stays until someone regenerates it on purpose. If you do, re-check the email size budgets and
  `lib/notifications/email-components.test.ts`.
- **Committed Phase E media.** Re-rendered under 0.35.5, the photo derivatives and guides are byte-identical. In
  `--preview` mode, three showcase illustrations re-encode to different PNG bytes with identical pixels. The committed
  WebP files are hashed in `docs/phase-e/showcase/media.json` and are re-rendered only with `--replace`, so nothing
  changes unless someone does that on purpose.
- **Carried into the working branch.** `phase-e/showcase-onboarding` took the release in `2cbcd47` (2026-11-27). The
  three fix branches (`fix/deps-sharp-audit-triage`, `fix/public-touch-targets`, `fix/public-focus-not-obscured`)
  are retired: never promote them again, because each one lacks the others' changes. **They were deleted on
  2026-11-27**, with their worktrees, on the operator's OK. Every commit on them is in phase-e.
- **CI on Node 22** runs only on a pull request.

---

## 2026-11-27 — `typescript-eslint` 8.61.1 → 8.73.0 (`minimatch` 10 → 11)

| | |
|---|---|
| Branch | `phase-e/showcase-onboarding`, as `9992b2f`. It was prepared in a temporary detached worktree of `436881f`, then phase-e was fast-forwarded to it. It is a lint-only tool: the build does not run lint, so no release is needed and the website does not change |
| Change | `package-lock.json` only, 13 entries. `package.json` unchanged (`eslint-config-next` asks for `typescript-eslint` `^8.56.0`) |
| Status | **Done** on phase-e. It reaches Production with the next release from phase-e; nothing there runs it |

### Why

These are the last 7 entries of the 2026-11-24 triage: `typescript-eslint` 8.61.1, five of its `@typescript-eslint/*`
packages, and the `minimatch` 10.2.5 under them.
- **The advisory:** [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate, globparts
  amplification. Its first fixed `minimatch` is 11.0.1.
- **The fix:** `typescript-eslint` 8.73.0 is the first release that moves to `minimatch ^11.0.1`.
- **It never applied to Production:** it runs only in `npm run lint`, on the repository's own patterns (see the
  2026-11-24 table).

### Version choice

The 14-day rule allowed 8.73.0 from 2026-11-30. **The operator approved a one-time exception on 2026-11-27**, when it
was 11 days old. Every other version kept the rule: nothing else that was added or changed is newer than 2026-11-13.

| Package | Was | Now | Published | Notes |
|---|---|---|---|---|
| `typescript-eslint` and its 10 `@typescript-eslint/*` packages | 8.61.1 | **8.73.0** | 2026-11-16 | The exception. The packages pin each other exactly |
| `minimatch` (under `@typescript-eslint/typescript-estree`) | 10.2.5 | **11.0.1** | 2026-10-27 | The advisory's first fixed version, and the lowest that fits `^11.0.1` |
| `@isaacs/nonrecursive-glob-match` | — | **1.1.0** (new) | 2026-11-05 | A `minimatch` 11 dependency |

- **How:**
  1. A temporary `overrides` block: `typescript-eslint` at `8.73.0`, and `minimatch` at `11.0.1` under `typescript-estree`.
  2. `npm install --before=2026-11-16T18:00:00Z`.
  3. `package.json` was restored byte for byte.
- **npm also moved three entries that nothing required:**
  - `ignore` 7.0.5 → 7.0.14, under the ESLint plugin;
  - `brace-expansion` 5.0.12 → 5.0.13 and `semver` 7.8.4 → 7.8.6, under `typescript-estree`.
  - Their entries were restored verbatim from the previous lockfile, and npm then accepted the file unchanged.
- **Not installed:** `@typescript-eslint/typescript-estree` 8.73.0 adds `@typescript/native` as an optional peer, so npm
  leaves it out. TypeScript 5.9.3 is inside the new peer range (`>=4.8.4 <6.1.0`).

### Verification

| Check | Result |
|---|---|
| `npm install` after the pins were removed | Both package files byte-identical |
| A fresh `npm ci`, then `npm install` | The same. `npm ls --all` exits 0; its only notes are unmet optional peers |
| Lockfile diff against `436881f` | 13 entries: the 11 `typescript-eslint` packages, `minimatch` and the new helper. Publish dates checked for each |
| `npm run lint` | Clean, with no new findings |
| Typecheck, `npm test` | Pass; 220 files, 2,604 tests |
| Build (CI's placeholder env), `check:scan-bundle` | Pass; ok. Route table and static media identical to `09496a5` |
| `phase-e:intake:build -- --check` | 31 files match |
| `npm audit` (phase-e) | 9 moderate before, **2** after (below) |
| phase-e Preview | GitHub deployment `8118694557` (Preview, success, 2026-11-27 20:24 UTC) |

### The 2 entries left on phase-e: `uuid` under `exceljs` (does not apply)

| Entry | Advisory | Pulled in by | Runs in | Why it does not apply |
|---|---|---|---|---|
| `uuid` 8.3.2 (and `exceljs`, flagged for depending on it) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) moderate: a missing buffer bounds check in `v3`, `v5` and `v6` when a `buf` is passed. Fixed in 11.1.1, 12.0.1 and 13.0.1 | `exceljs` 4.4.0, a dev dependency of the intake kit (kit 2.0) | `phase-e:intake:build` and `onboard:*`, on the operator's machine | `exceljs` only calls `v4()`, without a buffer (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`). Production has no `exceljs` |

- **Not in the 2026-11-24 count of 7:** that count was taken on the sharp branch, before kit 2.0 added `exceljs`.
- **No in-range fix:** `exceljs` 4.4.0 is the latest release and asks for `uuid ^8.3.0`, and `npm audit fix --force` would
  *downgrade* it to 3.4.0.
- **Forcing `uuid` 11 in** with `overrides` is possible. It would need the intake kit's 31-file `--check` to prove that
  nothing changes. Revisit when `exceljs` moves to a fixed `uuid`.
