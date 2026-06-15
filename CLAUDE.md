# CLAUDE.md — AssetTag QR

Hosted equipment-info system: a permanent QR tag on rental equipment → a public
mobile page with instructions, manuals, and support → damage/support/return
submissions → a customer admin dashboard. Build the core loop; nothing more.

**Read `docs/` first.** `docs/CODE_HANDOFF.md` (engineering handoff), `docs/PRD.md`,
`docs/MVP_SCOPE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`,
`docs/SPRINT_PLAN.md`, and `docs/OPEN_QUESTIONS.md`.

## ⚠️ Next.js 16 — see AGENTS.md
This project uses **Next.js 16 + React 19 + Tailwind v4**, which differ from
older conventions. `cookies()` is async; Tailwind config is CSS-based (no
`tailwind.config.js`). Check `node_modules/next/dist/docs/` before using an
unfamiliar API. See `AGENTS.md`.

## Stack
- Next.js (App Router) + TypeScript, Tailwind v4 + shadcn/ui
- Supabase — Postgres, auth, storage, row-level security
- Vercel hosting; Stripe deferred (billing fields exist, not implemented)

## Commands
```bash
npm run dev        # local dev server
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # production build
```
Run **lint, typecheck, test, build** after meaningful changes and show output.

## Structure
```
app/                 App Router routes (public /t/[shortCode], admin, platform — added per sprint)
components/ui/        shadcn components
lib/
  env.ts             validated env access (server secrets guarded from the browser)
  constants.ts       product/branding strings (no hard-coded customer branding)
  supabase/          client (browser), server (RLS, cookies), admin (service-role, server-only)
  auth/roles.ts      role constants/types shared with the DB
db/
  migrations/        0001_init.sql (schema + RLS + policies), 0002_storage.sql (buckets + policies)
  seed/seed.sql      Northridge Rentals + 4 demo assets
docs/                planning docs
```

## Security (non-negotiable)
- RLS is **enabled on every tenant-scoped table** in the migration that creates it.
  Policies resolve the caller's org/role via `current_org_id()` / `is_platform_owner()`
  (SECURITY DEFINER, so no recursion through `profiles`).
- Public/anon: read only published public content; insert-only on `form_submissions`
  and `scan_events`; uploads only via form flows; never list storage.
- Never expose `internal_notes`, private documents, billing fields, or submissions
  publicly. Store hashed/truncated IPs only (`scan_events.ip_hash`).
- `lib/supabase/admin.ts` (service role) bypasses RLS — server-only, never client.

## Working agreements
- Build in vertical, demoable slices (see `docs/SPRINT_PLAN.md`). MVP only — no
  premature abstractions, no out-of-scope features (`docs/NON_GOALS.md`).
- Manual external steps (create Supabase project, set `.env.local`, apply
  `db/migrations` + `db/seed`, connect Vercel) are owned by the operator.
