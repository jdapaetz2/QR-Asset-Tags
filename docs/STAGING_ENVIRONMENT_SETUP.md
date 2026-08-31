# Staging Environment Setup — Mulemark

Operator procedure for giving staging its **own** Supabase project, so a Vercel preview deployment stops
reading and writing production.

> ## Status: **Phase B1B COMPLETE** — staging is live and isolated
>
> | | |
> |---|---|
> | Staging project | `kwserenxwjxozztyigmw` — "Mulemark-Staging", us-east-1 |
> | Migrations | **0001-0033 applied**; `db push --dry-run` = "Remote database is up to date" |
> | Seed data | Northridge demo org (from `0003`/`0004`) + 2 deterministic QA orgs |
> | QA accounts | owner / customer-admin / customer-staff / second-org admin — password login, no email |
> | Preview isolation | **proven** (see below) |
> | Production | **unmutated** — all row counts identical before and after |
>
> The steps below remain the procedure for bootstrapping a staging project from scratch.

## The problem being fixed

Phase A7 recorded it plainly: every Vercel environment variable **was** a single row scoped
`Production, Preview`. A preview deployment therefore received the **production Supabase URL, anon key,
and service-role key** — any preview, from any branch including a draft PR, could read and write real
data with full RLS bypass.

That blast radius was demo data ("Test Valley Rentals", "Northridge Rentals" — 3 profiles, 11 assets,
39 submissions; no real customers), which is why this was a planned fix rather than an incident.

**Resolved in B1B.** Preview now reads and writes the dedicated staging project, proven below.

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

Creates **two** clearly-labelled organizations (org A with exports OFF, org B with exports ON, so both
sides of the export gate are testable), four assets covering public / rented / private-draft / org-B,
five QR short codes including a **disabled** one and a staging-only isolation probe, public and private
documents, an active rental session, four representative submissions, and four QA logins
(`qa.owner@` / `qa.admin@` / `qa.staff@` / `qa.admin.orgb@ mulemark-staging.invalid` — RFC-2606
`.invalid`, so they can never receive real mail). Idempotent; the password is never printed or logged.

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


---

## B1B isolation evidence (2026-08-19)

The client bundle does **not** inline `NEXT_PUBLIC_SUPABASE_URL` (12 chunks scanned across `/` and
`/login` — no project ref present), so bundle-grepping cannot prove which database a deployment reads.
The proof used instead is a **short-code pair**, which needs no secrets and is unambiguous:

| Short code | Exists in | Result on Preview |
|---|---|---|
| `stg-only-isolation-probe` | staging only | **RESOLVED** (page rendered) |
| `stg-qa-public`, `stg-qa-rented` | staging only | **RESOLVED** |
| `stg-qa-disabled` | staging, link disabled | unavailable notice (correct — reason not disclosed) |
| `67uqc3q7`, `eb43bf3r` | **production only** | unavailable notice — Preview cannot see them |

Write path, proven live:

- A damage report submitted through Preview returned `SUB-2026-2E9E37`; the row landed in **staging**
  (id `2e9e3768...`, staging `form_submissions` 4 -> 5).
- Production `form_submissions` stayed at **39**, with **0** rows matching the test submitter.
- Preview scans wrote `scan_events` to staging (0 -> 6); production stayed at 3011 with **0 created that
  day**.

Other Preview checks: Deployment Protection ON (302 without bypass, 200 with) - `verify:tag-config`
still **exits 1** (permanent tags blocked) - notifications dry-run (`RESEND_*` unset).

### Known gap found during B1B: Speed Insights is not collecting

`<SpeedInsights />` is present in `app/layout.tsx`, and `/_vercel/speed-insights/script.js` returns 200,
but the script is **never requested by the browser** — no network request, no tag in the live DOM.
Verified identically on **production and preview**, so this is **pre-existing and not caused by B1B**.
Earlier phases recorded Speed Insights as "wired, awaiting traffic"; that was optimistic — it has never
been collecting. **Operator action:** enable Speed Insights for the project in the Vercel dashboard and
re-verify.

## Routine staging verification

```bash
npm run verify:staging-target      # target proof
npm run staging:seed -- --confirm  # idempotent QA fixtures
npm run staging:verify             # 23 golden-path checks against the deployment
```

## QA login trouble — check before reseeding

`npm run staging:seed -- --confirm` **deletes both QA organizations and everything under them**
(assets, QR links, rental sessions, submissions, documents) before recreating them. That is far too
blunt a response to "a QA login isn't working", and it destroys accumulated QA state.

Diagnose first. This is read-only and writes nothing:

```bash
npm run staging:qa-password -- --verify-only
```

It reports two independent layers for each of the four QA users:

1. **Login verification** — a real `signInWithPassword` through the anon key, exactly what a browser
   does, using `STAGING_QA_PASSWORD` from the untracked `.env.staging.local`.
2. **Application readiness** — the `profiles` row (role + status) and the organization's status.

The distinction matters because a valid password is *necessary but not sufficient*: the app resolves a
profile and an organization after sign-in, and a disabled profile or a non-active org gets bounced to
`/suspended` (and `current_org_id()` returns null, stripping tenant RLS scope). To a person that looks
identical to "the login was rejected", but the fix is completely different.

**If both layers are clean, the credential is not the problem.** Look at the environment instead: the
URL under test (the QA users exist only in staging — production has its own users), the variable name
(it is **`STAGING_QA_PASSWORD`**), a paste error, or Vercel Deployment Protection intercepting the
request without the bypass header.

> This is exactly how the 2026-08-31 report resolved: all four logins already succeeded, profiles and
> organizations were active, and no password needed writing. Staging assets and data were present and a
> staging notification workflow ran without sending mail.

If a password genuinely needs resetting:

```bash
npm run staging:qa-password              # dry run — shows the exact blast radius
npm run staging:qa-password -- --confirm # updates ONLY those four passwords, then verifies login
```

Fail-closed: it requires `MULEMARK_TARGET=staging`, requires `STAGING_SUPABASE_REF` to equal the
staging ref pinned in the script, re-resolves the target through `assertTarget` (which treats any
unrecognised project as production), and refuses any address outside `@mulemark-staging.invalid`. It
updates auth passwords only — no organization, asset, session, submission, document, or storage object
is read or written, and it never creates a user.

> `.env.staging.local` must contain the non-secret line `MULEMARK_TARGET=staging`. The target is never
> inferred; it has to be stated.
