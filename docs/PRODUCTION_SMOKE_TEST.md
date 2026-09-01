# Production Smoke Test — Mulemark

Run against the **production URL** after every deploy (see `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`). Use a throwaway
rental session / test org — never real customer data. Record pass/fail + tester + commit. Stop and roll back on any P0
failure (auth, public scan, private-media leak, export leak, request loop).

**Automated vs manual (B5).** Two automated runners now cover the environments this checklist used to
reach only by hand:

```bash
npm run smoke:production   # read-only, no credentials, no login — safe after every deploy
npm run smoke:staging      # bounded writes on the seeded QA orgs
```

`smoke:production` verifies serving, the `www` → apex path-preserving redirect, the unavailable-notice
behaviour and its non-disclosure, and that every authenticated and durable-output route refuses an
anonymous caller. It also asserts the **staging-only short code does not resolve on production** — a
behavioural check that production is reading the production database.

**It does not log in, submit anything, or send email**, and it uses no Supabase credential of any kind.
Those remain manual and are listed below.

⚠️ **Why there is no automated production scan-page check by default.** `app/t/[shortCode]/page.tsx`
calls `recordScan`, which **inserts a `scan_events` row on every view** — it lands in that asset's
analytics and last-scanned time. So the scan check runs only against `PRODUCTION_SMOKE_SHORT_CODE`, an
operator-designated **test-only** asset, and is **SKIPPED** (never silently passed) when that is unset.
It never guesses a short code.

The Playwright golden-path suite (`docs/E2E_TESTING.md`) still runs against a **local** stack only, and
deliberately so — its seeder tears down and recreates organizations, which must never touch a hosted
project. Smoke and E2E are different tools: E2E proves behaviour, smoke proves *this deployment* is
serving and its guards are closed.

**Still manual, even after B5** (each needs a human, a real account, or an approval):

| Row | Why it stays manual |
|---|---|
| Live **email** delivery 📧 | sending from production requires operator approval per event |
| Production **login** as each role | there is no production QA account; creating one is a production change |
| `?unsafe=1` base-URL safety 🏭 | owner-authenticated, and touches durable-output routes |
| Private-media signed URLs 🔒 | needs an authenticated browser; storage boundary is covered by `npm run test:security` |
| Suspended-org redirect | needs a suspended production org |
| Real-phone scan of a printed tag | hardware |

## Accounts needed
- Platform owner; a customer **admin**; a customer **staff**; and an anonymous device (phone) for public scan.

## Matrix

### Auth
- [ ] Login (password) as each role → lands on the correct home (`/owner` vs `/dashboard`).
- [ ] Invite / set-password flow completes (if testing a fresh user).
- [ ] **Sign out** works for every role → returns to `/login`; back button does not restore a session.
- [ ] Suspended-org customer → redirected to `/suspended`.
- [ ] Direct unauthorized URL (staff → `/dashboard/settings`, customer → `/owner`) → redirected, not served.

### Public scan (anonymous, phone)
- [ ] Active published tag `/t/[shortCode]` → equipment page renders (system fonts, no console webfont requests).
- [ ] Unavailable tag (unpublished / archived / suspended) → `UnavailableNotice`, reason not disclosed.
- [ ] Damage form → submit → thanks page with reference → "Return to equipment page" works.
- [ ] Support form → submit → thanks.
- [ ] Return checklist (3 stages) → submit → thanks. Terminology reads "Return checklist".
- [ ] Renter acknowledgement prompt appears on an active session; completing suppresses it on re-scan; a new session
      re-prompts.
- [ ] Cold (signed-out) staff scan shows "Staff member? Sign in"; same-org signed-in staff sees "Open staff workflow".

### Customer admin
- [ ] Dashboard, Assets (+ detail/sub-pages), Submissions, Rentals, Analytics, Settings all load.
- [ ] Filter a list → open a detail → Back returns to the **filtered** list.
- [ ] Create/import/publish an asset; QR governance visible.

### Customer staff
- [ ] Allowed nav (Dashboard/Assets/Submissions/Rentals/Analytics) loads; **no** Settings/Tag-requests in nav.
- [ ] Config routes by URL (`/dashboard/settings`, `/export`, `/tag-requests`, `/templates`, `/assets/import`) →
      redirected.

### Staff scan workflow
- [ ] Staff scan an available asset → **outbound inspection** → marks rented / starts a session.
- [ ] Staff scan a rented asset → **staff return** → completes → asset Available, session closed.
- [ ] Session evidence renders **inside the staff shell** with a back link (never the desktop admin shell).

### Submissions / evidence
- [ ] Inbox triage: status change, multi-select bulk resolve/archive (active renter returns are skipped safely).
- [ ] Rental-session evidence page: outbound/renter/staff sources, photos, print — loads without a 404.
- [ ] "Mark returned & resolve" closes an active renter return and returns to the filtered inbox.

### Owner
- [ ] Organizations list/detail + org sub-nav; QR governance; production.
- [ ] 🏭 **(manual-only — needs the real production base URL)** Production shows **no** "not production-safe" warning;
      downloading **QR SVG / QR sheet / production CSV** returns files **without** `?unsafe=1`.
- [ ] Owner export always works.

### Conditional customer export
- [ ] Export **disabled** for an org → no Settings item, no dashboard card; `/dashboard/export` + download route
      blocked.
- [ ] Owner enables it → customer **admin** sees + downloads; customer **staff** still cannot see/reach it.

### Email + media + stability
- [ ] 📧 **(manual-only)** Trigger a notification (new submission / tag-request status). With Resend configured → email
      received; unset → logged dry-run (`reason":"unconfigured"`), submission still succeeds.
- [ ] 📧 **(manual-only, live email)** On a configured Production: **exactly one** message arrives; From is
      `Mulemark <notifications@notify.mulemark.io>`; a reply reaches `support@mulemark.io`; the subject names the asset
      code (or the organization, for a tag request); links are on `https://mulemark.io`; headers show `spf=pass`,
      `dkim=pass`, `dmarc=pass`; the log line carries a `providerId` and a redacted recipient. Then **replay the same
      event** — no second email. Full matrix: `docs/EMAIL_DELIVERABILITY_RUNBOOK.md`.
- [ ] 🔒 **(manual-only in-browser; storage boundary covered by `test:security`)** Private media: submission images load
      for admin via signed URL; a raw storage path is not publicly listable.
- [ ] No automatic refresh/poll loop and no repeated network requests on any page (watch the Network tab settle).
