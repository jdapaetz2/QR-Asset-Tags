# AssetTag QR

Hosted equipment-info system for equipment rental. A permanent QR tag on a piece
of equipment resolves to a public, mobile-first page with instructions, manuals,
and support — and lets renters file damage/support/return submissions that land in
a customer admin dashboard. The tag is printed once; the content stays live.

## Stack

- Next.js (App Router) + TypeScript, Tailwind v4 + shadcn/ui
- Supabase — Postgres, auth, storage, row-level security
- Vercel hosting (Stripe deferred — billing fields exist, not implemented)

See [AGENTS.md](AGENTS.md) for Next.js 16 / React 19 / Tailwind v4 specifics.

## Getting started

1. Set environment variables in `.env.local` (see
   [docs/ONBOARDING_RUNBOOK.md](docs/ONBOARDING_RUNBOOK.md) §1):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_SITE_URL`,
   `SCAN_IP_HASH_SALT`.
2. Apply migrations `0001`–`0006` and (optionally) `supabase/seed.sql` for the
   Northridge Rentals demo data.
3. Run the dev server.

```bash
npm run dev        # local dev server
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run build      # production build
```

## Documentation

- [docs/CODE_HANDOFF.md](docs/CODE_HANDOFF.md) — engineering handoff
- [docs/ONBOARDING_RUNBOOK.md](docs/ONBOARDING_RUNBOOK.md) — manually onboard a pilot customer
- [docs/PILOT_DEMO_SCRIPT.md](docs/PILOT_DEMO_SCRIPT.md) — click-by-click demo script
- [docs/MVP_PILOT_READINESS.md](docs/MVP_PILOT_READINESS.md) — go/no-go checklist, security posture, limitations
- [docs/PRD.md](docs/PRD.md) · [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) · [docs/NON_GOALS.md](docs/NON_GOALS.md)
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) · [docs/SPRINT_PLAN.md](docs/SPRINT_PLAN.md)
