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
| Status | Pushed. The Preview built and passed the staging smoke. Waiting on the `after()` check below, then operator review and promotion (Vercel → the Preview → **Promote to Production**), then `npm run smoke:production` |

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
builds with the project's Node 22.x setting. Pushing the branch deployed nothing to Production.

**Staging smoke.** `scripts/smoke/staging.mjs` ran with `QA_BASE_URL` set to that deployment; a value set in the shell
overrides the env file's own URL, so the `phase-e/showcase-onboarding` alias was not used. Result: **29 checks, 28
pass, 0 fail, 1 skipped**. It covered:
- the staging-only isolation probe;
- the public scan page, and the support and damage forms (anonymous Server Actions);
- the return checklist and the acknowledgement prompt;
- owner, admin and staff logins through `proxy.ts`;
- exports, cross-tenant denials and sign-out.

The skipped check is the notification `dry_run` line, which only the Vercel runtime log shows.

**Not verified here: work deferred with `after()`.** Scan logging and submission notifications both run in `after()`,
and the smoke cannot observe either. Confirm it on this Preview before promoting, with either:
- the deployment's runtime log: the `dry_run` / `preview_environment` notification line (Hobby keeps runtime logs for
  one hour);
- `npm run staging:scan-reliability -- --confirm` with `QA_BASE_URL` set to the Preview. It creates its own disposable
  asset and deletes it afterwards. An attempt to run it from this session was stopped by the agent's permission
  guard, because it writes to staging with the service-role key.

### Not changed here (follow-ups)

- **Align the `sharp` pin** with Next's (0.35.5) for a single native install. That also clears sharp's own advisories
  as defence in depth. Re-run the preview-transform tests, the email gallery and the Phase E media scripts that use
  sharp.
- **Triage the remaining `npm audit` findings.** After this change the worktree reports 19 entries, none in `next`:
  `sharp` (direct, above); the root `postcss@8.5.15` via `@tailwindcss/postcss`; `zod`; `vite`, `vitest` and
  `@vitest/mocker`; `typescript-eslint` with its `minimatch` and `brace-expansion` chain; `browserslist`,
  `baseline-browser-mapping`, `js-yaml` and `source-map-js`. None was reviewed here.
- **Carry the upgrade into the working branches** (`phase-e/showcase-onboarding`, `fix/public-touch-targets`,
  `fix/public-focus-not-obscured`), so local Playwright and dev servers stop running 16.2.9
  (GHSA-p293-qw3h-jr36).
- **CI on Node 22.** `ci.yml` runs on `main`, `pilot-credibility` and pull requests only, so pushing this branch ran no
  workflow. A pull request would run lint, typecheck, test and build, the e2e critical subset and the executed security
  suite.
- **`AGENTS.md`.** Commit the block that `next dev` rewrites the first time a coding agent runs it on 16.4.5.
