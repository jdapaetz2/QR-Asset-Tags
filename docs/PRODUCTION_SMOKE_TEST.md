# Production Smoke Test — Mulemark

Run against the **production URL** after every deploy (see `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`). Manual today;
the A6 Playwright suite will automate the core paths. Use a throwaway rental session / test org — never real customer
data. Record pass/fail + tester + commit. Stop and roll back on any P0 failure (auth, public scan, private-media leak,
export leak, request loop).

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
- [ ] Production shows **no** "not production-safe" warning; downloading **QR SVG / QR sheet / production CSV** returns
      files **without** `?unsafe=1` (production base URL is safe).
- [ ] Owner export always works.

### Conditional customer export
- [ ] Export **disabled** for an org → no Settings item, no dashboard card; `/dashboard/export` + download route
      blocked.
- [ ] Owner enables it → customer **admin** sees + downloads; customer **staff** still cannot see/reach it.

### Email + media + stability
- [ ] Trigger a notification (new submission / tag-request status). With Resend configured → email received; unset →
      logged dry-run, submission still succeeds.
- [ ] Private media: submission images load for admin via signed URL; a raw storage path is not publicly listable.
- [ ] No automatic refresh/poll loop and no repeated network requests on any page (watch the Network tab settle).
