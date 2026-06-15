# Sprint Plan — AssetTag QR (MVP)

Build in **vertical slices**, not broad unfinished layers. Each sprint must end with something demoable, and lint/typecheck/tests/build should pass after meaningful changes. Sprints below are sequenced by dependency; durations are nominal (assume ~1 week each, adjust to capacity).

The north star is the core loop: physical QR tag → permanent QR URL → public page → actions → submissions → admin dashboard.

## Sprint 0 — Foundation

Stand up the project so everything after it is fast.

- Next.js App Router + TypeScript + Tailwind + shadcn/ui scaffold.
- Supabase project: Postgres, auth, storage buckets.
- Vercel deployment wired to the repo; CI runs lint/typecheck/build.
- All MVP tables created via migration with RLS **enabled** and base policies (see `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`).
- Seed the demo organization (Northridge Rentals) and four demo assets.

*Demoable:* a deployed app, a database with RLS on, and seed data.

## Sprint 1 — Auth, tenancy, and admin shell

- Supabase auth login for admins.
- Profile/role resolution (`platform_owner`, `customer_admin`, `customer_staff`).
- Org-scoped admin dashboard shell; RLS verified so an admin sees only their org.
- Platform-owner view to list organizations.

*Demoable:* log in as a customer admin and land in an org-scoped dashboard; platform owner sees all orgs.

## Sprint 2 — Assets and equipment-page editor

- Asset CRUD (org-scoped).
- Equipment-page editor (headline, quick start, safety, fuel/power, return, troubleshooting, emergency) with publish/unpublish.
- Cover image upload to org-scoped storage.

*Demoable:* create an asset and edit/publish its equipment page content.

## Sprint 3 — QR routing and the public page

- `qr_links` generation: short code + permanent `/t/{short_code}` URL per asset.
- Public, mobile-first equipment page rendering only published public content, with logo/name, asset name/code, photo, all content sections, support contact (with asset overrides), and the "Powered by" footer + disclaimer.
- Record `scan_events` on page load (hashed/truncated IP).

*Demoable:* scan/open a permanent QR URL on a phone and see the live public page; editing content in Sprint 2 changes the page without changing the QR.

## Sprint 4 — Public forms and media upload

- Fixed-template forms: damage report, support request, return checklist (pre-use inspection optional).
- Asset prefilled and not editable; `organization_id` derived server-side.
- Photo/video upload with type/size limits to org-scoped paths; no public listing.
- Basic anti-abuse: rate limiting and/or honeypot.

*Demoable:* a public user submits a damage report with a photo; it lands in the database; public users cannot read submissions.

## Sprint 5 — Admin submissions and documents

- Admin submission inbox: list, open with media, change status (new/reviewed/resolved/archived), CSV export.
- Document management: add manuals/guides/videos as hosted files or external links, set visibility and link status, manual "mark as checked".
- Public page surfaces public documents via action buttons (Manual, Start-Up Guide).

*Demoable:* admin reviews the Sprint 4 submission and manages documents that appear on the public page.

## Sprint 6 — QR/tag production and analytics

- QR SVG export (per asset and bulk).
- CSV export (`asset_code`, `asset_name`, `short_url`, `organization_name`).
- Printable production sheet/HTML with tag metadata (size, material, mounting, code, short URL).
- Basic analytics view: scan and submission counts.

*Demoable:* export SVGs and a production sheet for the four demo assets; view scan/submission counts.

## Sprint 7 — Hardening and pilot readiness

- Security pass: re-verify RLS on every table, public/private separation, upload guardrails, IP hashing.
- Mobile QA on the public page and forms.
- Manual onboarding runbook (platform owner creating org + first admin end to end).
- Polish, error states, empty states, and the configurable disclaimer/footer.
- Full pass of lint/typecheck/tests/build; deploy to Vercel.

*Demoable:* the full pilot demo in `docs/PILOT_CUSTOMER_DEMO.md` runs cleanly end to end.

## Definition of done (every sprint)

A slice is done when it is demoable end to end, RLS still holds for any new tables/queries, lint/typecheck/tests/build pass, and output of the checks has been shown. No broad unfinished layers; no premature abstractions.
