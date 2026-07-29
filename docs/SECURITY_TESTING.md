# Security Testing — Mulemark (Phase A3.2)

Two tiers of security tests exist. Know which one proves what.

- **Structural (fast, no database)** — `npm test` (Vitest, `node` env). These `readFileSync` a source file
  and assert strings: a policy/guard is *written*. They run on every push in `ci.yml`. Fast, but they cannot
  prove Postgres behavior.
- **Executed (real database)** — `npm run test:security` against a local Supabase stack. Every assertion runs
  through a real signed-in PostgREST/Auth/Storage client, so it proves how the database actually *behaves*:
  cross-tenant reads, role-gated writes, RPC boundaries, storage policies. This is the Phase A3.2 addition.

## Running the executed suite locally

Requires Docker Desktop (WSL2 backend on Windows) so the Supabase CLI can boot the stack.

```bash
npx supabase start          # boots local Postgres/Auth/Storage (Docker)
npm run test:security       # db reset (fresh migrations) + seed + executed RLS/storage/RPC
```

Other scripts:

- `npm run db:reset` — apply `supabase/migrations/0001..latest` + `seed.sql` to a fresh local DB (Part G proof).
- `npm run test:rls` — re-run only the DB-policy tests against the already-reset stack (fast iteration; skips the reset).

The suite never touches a hosted project. `tests/security/setup/stack.ts#assertLocal` aborts unless the resolved
Supabase API URL is a loopback host, and it prints only the host on failure — never key material. The linked
project in `supabase/.temp/` is never contacted; `supabase status` reports the local Docker stack only.

## Architecture

```
tests/security/
  setup/
    stack.ts         resolve the local stack via `supabase status`; hard non-local guard
    grants.ts        LOCAL grant parity (see below)
    fixtures.ts      service-role SETUP/TEARDOWN only: builds the fixture graph + signed-in clients
    global-setup.ts  Vitest globalSetup — guard, grant parity, seed (runs once)
    assertions.ts    behavioral RLS assertions (insert-denied / rows / no-rows / unchanged / changed)
  rls/               org+profiles, config tables, operational tables
  rpc.test.ts        RPC role/org boundaries (behavioral)
  catalog.test.ts    migration application + object existence + RPC execute grants (via pg)
  storage.test.ts    storage-object policies (submissions / documents / public-assets)
  guard.test.ts      proves the non-local guard fires and leaks no keys
```

Config: `vitest.security.config.ts` (separate include, single worker, no file parallelism — the tests share one
seeded DB). The default `vitest.config.ts` does **not** include `tests/`, so `npm test` stays fast and Docker-free.

### Fixture graph (deterministic, fixed UUIDs distinct from the demo org)

- Org **A** and Org **B** — both active (cross-tenant isolation).
- Org **C** — suspended (proves `current_org_id()` fails closed for a suspended org).
- Actors: platform **owner**; **admin_a/staff_a**, **admin_b/staff_b**; a **disabled** staff in A; an active
  **admin_c** in suspended C. Each signs in with a real password → real access token.
- Per-org: public/private/archived assets, qr_links, equipment pages, public + private documents, submissions,
  a rental session, inspection templates + category defaults, an equipment-page template, tag requests, and
  storage objects in all three buckets.

### Local grant parity (`grants.ts`) — why it exists

Hosted Supabase grants `service_role` and `authenticated` full table access via ALTER DEFAULT PRIVILEGES, and the
migrations only ever **revoke from `anon`** (never from `authenticated`). The local CLI stack, with the new
`auto_expose_new_tables` default OFF, does not auto-grant the Data API roles, so a couple of later tables (e.g.
`equipment_page_templates`, 0008) that relied on the hosted default are unreachable locally. `grants.ts` connects
as the local `postgres` superuser and grants `service_role`/`authenticated` the access hosted already gives them.
**`anon` is left exactly as the migrations set it**, so every anon RLS/grant assertion — including "anon holds no
DML on the admin tables" (0032) — remains a faithful test of production. This is a local-only fixup, never a
migration, guarded by the same loopback check.

## What is executed vs. structural vs. manual-only

| Boundary | Executed (local/CI) | Structural | Manual only |
|---|---|---|---|
| Cross-tenant isolation (all tenant tables) | ✅ | | |
| `customer_admin` vs `customer_staff` writes (0032) | ✅ | ✅ | |
| `profiles.role`/`organization_id`/`status` self-escalation (0032 trigger) | ✅ | ✅ | |
| Commercial/export-flag protection (0015/0016/0019) | ✅ | | |
| Disabled profile / suspended org lockout (0018/0019) | ✅ | | |
| RPC role/org boundaries + anon execute revoked | ✅ | | |
| Storage: submissions / documents / public-assets policies | ✅ | | |
| Public rate limiter (A4): grant boundary, burst/abuse denial, key isolation, no raw IP | ✅ | ✅ (policy) | |
| Failed-upload cleanup + duplicate-submit idempotency (A4) | | ✅ (mocked core) | |
| Fresh migration application (0001→latest) | ✅ | ✅ (contiguity) | |
| Customer **export route** flag gate (`requireCustomerAdminOrgId` + `isExportTypeEnabled`) | | ✅ | ✅ golden-path |
| Service-role import allowlist + server-only | | ✅ (test + verifier) | |
| Full golden-path through the real UI (Playwright) | | | ⏳ A6.1 |

The customer export **flags** are enforced in the Next route, not in RLS, so the route stays structurally tested;
the executed suite proves the DB half (a customer cannot mutate the flags, and cross-org export reads return zero
rows).

## Service-role inventory

See `docs/SECURITY_MODEL.md` → "Service-role inventory". Enforced by `scripts/verify-production-config.mjs`
(`service-role-allowlist`) and `lib/security/service-role.test.ts`: only the allowlisted, server-only modules may
import `createAdminClient`; a new importer fails both gates until reviewed.

## Secret scanning

`ci.yml` runs the gitleaks release binary directly (no marketplace action, no license, nothing uploaded),
`gitleaks detect --redact` so a finding fails the job without printing the value. `.gitleaks.toml` extends the
default ruleset and allowlists reviewed false positives (npm SRI `sha512-` hashes, the values-blank env example,
the public local-CLI demo keys). No Git hook / Husky.
