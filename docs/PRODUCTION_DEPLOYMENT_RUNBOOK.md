# Production Deployment Runbook — Mulemark

Repeatable, memory-free deploy for the Vercel + Supabase + Resend stack. Companions:
`docs/PRODUCTION_SMOKE_TEST.md`, `docs/MIGRATION_LEDGER.md`, `docs/CURRENT_ARCHITECTURE.md`. **The operator owns every
external step** (Supabase project, Vercel env, DNS, Resend domain). This runbook never applies migrations, rotates
secrets, or changes DNS automatically.

## 0. Canonical toolchain
- **Node 22 LTS** (`.nvmrc` = `22`, `package.json` `engines.node` = `22.x`, CI on Node 22). Local Node 24 is outside
  the tested baseline — use `nvm use` before release verification.
- Package manager: npm (committed `package-lock.json`); install with `npm ci`.

## 1. Pre-deploy verification (local, read-only)
1. `git fetch && git status` — confirm the intended **branch + commit** and a clean tree.
2. `nvm use` (Node 22).
3. `npm ci`.
4. `npm run verify:production-config` — static config check (var names, migrations 0001–0031 present, Node version,
   server-only boundaries). Must be green.
5. `npm run lint && npm run typecheck && npm test && npm run build` — all must pass.

## 2. Environment checklist (Vercel → Project → Settings → Environment Variables)
Set for **Production** (and Preview where noted). Names only — never commit values.

| Var | Scope | Production | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | required | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | required | anon key (RLS-gated) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret (server) | required | never client; bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | Public | required | **canonical https production origin**, no trailing slash, no `*.vercel.app`, no localhost. Baked into permanent QR tags. |
| `SCAN_IP_HASH_SALT` | Secret (server) | required (≥ 32 random chars) | fails closed in production/preview |
| `RESEND_API_KEY` | Secret (server) | set to send email; unset = intentional dry-run | document the choice |
| `NOTIFICATION_FROM_EMAIL` | Server | set with a Resend-verified sender | e.g. `Mulemark Alerts <alerts@yourdomain>` |

`VERCEL_ENV` is set by Vercel automatically (production/preview/development) and drives fail-closed validation — do not
set it manually.

## 3. Supabase project link + migration verification (read-only; approval-gated)
1. Confirm the Supabase CLI is linked to the **target** project (`npx supabase projects list` / `supabase link`).
2. `npx supabase migration list` — Local and Remote must both list 0001–0031 with no unmatched versions.
3. `npx supabase db push --dry-run` — expect **"Remote database is up to date."**
4. **If anything is pending:** stop. Show the dry-run output, identify the affected workflows (see the ledger), and get
   **explicit operator approval before** running `npx supabase db push`. Never edit an applied migration — fix forward
   with a new migration.
5. **Backup recommendation:** before any schema change, take a Supabase backup / `db dump` (or confirm PITR is on).

Current state (Phase A2): 0001–0031 are **operator-verified applied**; no push is required.

## 4. Deploy (Vercel)
- Deploy the verified commit (Vercel Git integration builds on push, or `vercel --prod` from the verified commit).
- Vercel uses Node 22 (from `engines`/`.nvmrc`). Build must succeed with the production env set.
- **CI does not deploy and does not apply migrations** — deployment is Vercel's Git build; migrations are the manual,
  approval-gated step above.

## 5. Post-deploy smoke
Run `docs/PRODUCTION_SMOKE_TEST.md` against the production URL. Do not announce the release until the smoke matrix
passes.

## 6. QR domain verification (durability)
- Confirm `NEXT_PUBLIC_SITE_URL` is the final production host and resolves over https.
- Owner → Production shows **no** "not production-safe" warning; the durable-output routes (`qr.svg`, `qr-sheet.svg`,
  `export.csv`) return files without `?unsafe=1`.
- **Domain-change / redirect obligation:** printed tags encode this origin permanently. If the domain ever changes,
  the old origin must keep 301-redirecting `/t/*` to the new host indefinitely, or previously printed tags die. Record
  any domain move here with the redirect owner.

## 7. Resend verification
- Sending domain verified in Resend; SPF/DKIM/DMARC configured (details are Phase A5).
- `NOTIFICATION_FROM_EMAIL` is a verified sender. With the key unset, email runs in dry-run (logged, never sent) — that
  is an intentional, documented state, not a failure.

## 8. Speed Insights + logs
- `@vercel/speed-insights` renders from `app/layout.tsx` (no env var); confirm data appears in the Vercel dashboard.
- **Log locations:** Vercel → Deployment → Runtime/Function logs (server actions, route handlers, notifier `[…]`
  lines); Supabase → Logs (Postgres/Auth/Storage). Structured, redacted notification logging is Phase A5.

## 9. Rollback decision tree
1. **Build/config bad, no migration applied** → redeploy the previous good commit in Vercel (instant). No DB action.
2. **App regression, schema unchanged** → redeploy previous commit; migrations stay (they are forward-only and
   backward-compatible with the previous app).
3. **A newly applied migration is implicated** → **do not** delete/edit it. Roll the app back to the previous commit
   first (schema is additive/forward-compatible), then author a **forward-fix migration** and re-verify with
   `migration list` + `db push --dry-run` before pushing (approval-gated).
4. **Data incident** → restore from the pre-change Supabase backup / PITR; treat as an incident (Phase A5 runbook).

## 10. Sign-off
Record commit, deployer, env-checklist done, migration `dry-run` result, smoke result, and any manual Supabase/Vercel/
Resend/DNS actions taken.
