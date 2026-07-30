# Staging Environment Setup — Mulemark

Operator procedure for giving staging its **own** Supabase project, so a Vercel preview deployment stops
reading and writing production.

**Phase B1A (this repo) is preparation only.** Everything below is written, tested and ready — but no
Supabase project has been created, no migration applied, and no Vercel variable changed. **Phase B1B is
you running these steps.**

## The problem being fixed

Phase A7 recorded it plainly: every Vercel environment variable is currently a single row scoped
`Production, Preview`. A preview deployment therefore receives the **production Supabase URL, anon key,
and service-role key**. Any preview — from any branch, including a draft PR — can read and write real
data with full RLS bypass.

Today that blast radius is demo data ("Test Valley Rentals", "Northridge Rentals" — 3 profiles, 11
assets, 39 submissions; no real customers). That is why this is a planned fix rather than an incident.
It must land before broader preview QA, demos, or any external pilot.

## Target architecture

| | Local | **Preview / staging** | Production |
|---|---|---|---|
| Supabase | local Docker (`supabase start`) | **dedicated staging project** | production project |
| Keys | local CLI keys | staging anon + service-role | production keys |
| Data | fixtures + seed | staging-only QA data | customer data |
| QA accounts | A3.2 fixtures | staging QA users (`*.invalid`) | none |
| Email | dry-run | dry-run (default) | live Resend — Phase B4 |
| Permanent tags | blocked | blocked | after Phase B3 |
| Deployment protection | n/a | retained + automation bypass | n/a |

Invariants enforced by tooling, not by care:

1. Preview never receives the production service-role key after B1B.
2. Production never receives staging credentials.
3. Local destructive tests stay loopback-only (`tests/security/setup/stack.ts#assertLocal`).
4. Staging destructive scripts require an explicit staging mode **and** refuse the production ref.
5. **No environment is inferred from a human-readable name** — only project refs and hosts decide.
6. Anything ambiguous fails closed to "treat as production".

## Recommended Vercel model — the built-in Preview scope

**Use the default Preview environment and re-scope its Supabase variables to staging. Do not create a
Custom Environment, and do not create a second Vercel project.**

Why, given the alternatives:

| Option | Verdict |
|---|---|
| **Preview scope → staging values** | ✅ **Recommended.** One change, covers *every* preview branch. No preview can receive production credentials regardless of branch. |
| Branch-specific Preview variables | ❌ Only the named branch gets staging values. Any *other* preview branch silently falls back to the shared row — recreating the exact crossover we are removing. Strictly worse than doing nothing, because it *looks* solved. |
| Custom `staging` environment | ❌ Adds a third scope to maintain and keeps default Preview on production values unless you also fix that. No isolation benefit here. |
| Separate Vercel project | ❌ Duplicate settings, domains, protection and deploy config for no gain over isolated Preview variables. |

The mechanic that matters: the existing rows are **one `Production, Preview` row per variable**. Editing
the value would change production too. You must **remove Preview from those rows**, then **add
Preview-only rows** with staging values.

## Operator steps

### 1. Create the Supabase staging project

Supabase dashboard → New project. Name it recognisably (e.g. `mulemark-staging`) — but note the name is
**never** what the tooling trusts; the project ref is.

Record the **project ref** (the `<ref>` in `https://<ref>.supabase.co`). It is public by construction —
it ships in the browser bundle — so it is safe to paste into docs and CI config.

```
STAGING_SUPABASE_REF=<ref>
```

### 2. Collect the staging credentials

Supabase → Project Settings → API:

- Project URL → `https://<ref>.supabase.co`
- `anon` public key
- `service_role` secret key

**Supply these without printing them.** Paste directly into the Vercel dashboard; do not echo them into
a terminal, a file in the repo, or a chat message.

### 3. Apply the schema to staging

```bash
npx supabase link --project-ref <staging-ref>
node scripts/check-linked-project.mjs --expect=<staging-ref>   # must PASS before continuing
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

The guard is the point: it fails if the CLI is still linked to production. It never relinks, never
pushes, and never runs `migration repair`.

**Re-link to production afterwards** if you need production CLI access, and re-run the guard with the
production ref.

### 4. Configure Vercel Preview variables

Vercel → Project `qr-asset-tags` → Settings → Environment Variables.

For each of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`:

1. Edit the existing row → **uncheck Preview** (leave Production checked, value unchanged).
2. **Add** a new Preview-only row with the **staging** value.

Then:

| Variable | Preview value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | the staging/branch URL — **must not** be the permanent domain |
| `SCAN_IP_HASH_SALT` | a staging-specific value, ≥ 32 chars (do not reuse production's) |
| `RESEND_API_KEY` | **leave unset** → dry-run |
| `NOTIFICATION_FROM_EMAIL` | **leave unset** → dry-run |

Bucket-name and rate-limit variables can stay shared — they hold no credentials.

**Do not touch any Production-scoped value.**

### 5. Keep Deployment Protection on

Preview stays SSO-protected. For automated QA, enable **Protection Bypass for Automation** (Settings →
Deployment Protection) and pass the token as `VERCEL_AUTOMATION_BYPASS_SECRET`.

**Never commit that token.** Revoke it when a QA session ends.

### 6. Set Node 22.x

Settings → General → Node.js Version → **22.x**. The project is currently on 24.x while the repo's
tested baseline (`.nvmrc`, `engines`, all three CI workflows) is 22. Carried from Phase A6.3.

### 7. Redeploy

Environment variables are read at build time — an existing deployment keeps the old values. Redeploy the
preview after step 4.

### 8. Verify the target before trusting it

```bash
# In a shell holding the STAGING values:
STAGING_SUPABASE_REF=<staging-ref> npm run verify:staging-target
```

Must report `Staging target: VERIFIED`. It fails if the URL resolves to production, if no staging ref is
declared, or if the site URL is a tag-safe production origin.

Confirm the reverse too — a production shell must still pass `npm run verify:production-target` and must
be **rejected** by `verify:staging-target`.

### 9. Seed staging QA data

```bash
MULEMARK_TARGET=staging \
STAGING_SUPABASE_REF=<staging-ref> \
STAGING_QA_PASSWORD=<choose a strong password> \
  npm run staging:seed -- --confirm
```

Creates one clearly-labelled organization, two assets with published pages, two **test** QR short codes
(`stg-qa-public`, `stg-qa-rented`), an active rental session, and three QA logins
(`qa.owner@` / `qa.admin@` / `qa.staff@ mulemark-staging.invalid` — RFC-2606 `.invalid`, so they can
never receive real mail). Idempotent; the password is never printed or logged.

Run it without `--confirm` first for a dry run.

### 10. Verify the deployment

Against the staging URL:

- **Public scan** — `/t/stg-qa-public` renders; `/t/stg-qa-rented` shows the acknowledgement prompt.
- **Public forms** — damage, support and the renter return checklist submit and return a `SUB-…` reference.
- **RLS** — sign in as `qa.admin@` and confirm no other organization's data is visible.
- **Staff workflow** — `qa.staff@` reaches `/staff/t/stg-qa-rented`, sees no Settings link, and is
  redirected from admin-only routes.
- **Owner workflow** — `qa.owner@` sees the organization list and QR governance.
- **Tag output still blocked** — durable-output routes must refuse the staging base URL
  (`npm run verify:tag-config`).
- **Email** — a submission logs `outcome="dry_run"` and sends nothing.
- Confirm the deployment commit and that `VERCEL_ENV=preview`.

## What must be supplied without printing

| Value | Where it goes | Notes |
|---|---|---|
| staging `service_role` key | Vercel Preview variable | never echoed, never committed |
| staging `anon` key | Vercel Preview variable | public-ish, but still not pasted into logs |
| `STAGING_QA_PASSWORD` | shell env for the seeder | never a tracked file, no default |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | shell env for QA runs | revoke after the session |
| staging **project ref** | anywhere — docs, CI, config | **public by construction**, safe to share |

## After B1B

- Remove the "staging shares production" limitation from `PILOT_LIMITATIONS.md`.
- Point `scripts/qa/staging-*.mjs` at staging (`MULEMARK_TARGET=staging`).
- Re-run the A6.3 device + performance passes against isolated staging for a clean baseline.

Still deferred, unchanged by this work: the permanent domain (Phase B3) and live email (Phase B4).
