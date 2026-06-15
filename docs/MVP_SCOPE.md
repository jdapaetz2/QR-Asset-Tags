# MVP Scope — AssetTag QR

This document draws a hard boundary around the MVP. The guiding principle: **build a simple, robust hosted equipment info system — nothing more.** When in doubt, leave it out and record it in `docs/OPEN_QUESTIONS.md` or `docs/NON_GOALS.md`.

## The one workflow that must work

Physical QR tag → permanent QR URL → public equipment info page → manual / startup / return / support actions → damage / support / return submissions → customer admin dashboard.

Everything in scope serves this loop. Everything that does not is deferred.

## In scope

**Onboarding (manual).** Platform owner creates organizations and the first customer admin by hand. No public self-signup. The app supports the flow: owner creates org → owner creates customer admin → admin logs in → assets added → equipment pages edited → QR codes exported → tags produced separately → tags deployed.

**Multi-tenant organizations.** Each customer is an organization. Data is isolated per organization via Supabase RLS from the first migration.

**Asset management.** Customer admins (and the platform owner) can create and edit assets: asset code, name, category, make, model, serial, year, public status, cover image, support overrides, and internal notes.

**Permanent QR routing.** A separate `qr_links` table maps a short code to an asset. The QR encodes a permanent platform URL (`/t/{short_code}`). Content behind it changes without reprinting tags. An asset may have more than one QR link over time.

**Public equipment page.** Mobile-first, no login. Shows logo/name, asset name and code, photo, quick start, safety notes, fuel/power notes, return notes, troubleshooting, emergency/support contact, manual and video links, action buttons (Start-Up Guide, Manual, Report Damage, Return Checklist, Contact Support), and a configurable "Powered by" footer with disclaimer. Shows only published public content.

**Equipment page editor.** Customer admins edit all public page content per asset and publish/unpublish.

**Fixed-template forms.** Damage report, support request, return checklist, and (if simple) pre-use inspection. These are hard-coded templates, not a builder. Asset is prefilled and not editable on the form.

**Media upload through forms.** Photo/video upload on submissions, with file-type and size limits, organization-scoped storage paths, no public file listing, and basic anti-abuse (rate limiting and/or honeypot).

**Documents.** Manuals, startup guides, safety sheets, videos, return checklists, other. Supports both hosted uploads and external links. Includes a manual link-status field (`unknown`/`ok`/`broken`/`needs_review`) and a manual "mark as checked" action. Host as little as practical; support uploads when a reliable link isn't available.

**Admin dashboard.** View and manage submissions (status: new/reviewed/resolved/archived), export submissions as CSV, view QR links, manage assets, documents, and the organization profile.

**QR / tag production.** Select assets, export QR codes as SVG, export a CSV (`asset_code`, `asset_name`, `short_url`, `organization_name`), and generate a simple printable production sheet/HTML page with tag metadata (size, material, mounting method, asset code, short URL). No laser-software integration.

**Basic analytics.** Record scan events (timestamp, hashed/truncated IP, user agent, referrer, device type) and surface basic scan/submission counts.

**Security separation.** Public/private data separation enforced by RLS. See `docs/SECURITY_MODEL.md`.

**Deployment.** Runs on Vercel with Supabase.

## Out of scope (MVP)

CMMS, maintenance scheduling, work orders, rental booking, inventory availability, rental contracts, e-signatures, customer payment collection / Stripe, GPS tracking, native mobile app, offline mode, custom form builder, full analytics suite, automated self-signup, deep rental-software integrations, AI-generated safety instructions, and automated link checking. See `docs/NON_GOALS.md`. Billing is manual during MVP and pilots; the code is structured so Stripe can be added later but it is not implemented now.

## Deliberate "ready but not built" hooks

A few things are designed into the data model now so they can be turned on later without migration pain: the `qr_links` table is separate from assets (multiple tags per asset later); `documents.link_status` and `last_checked_at` exist now (automated link checking later); organization billing fields (`plan_name`, `monthly_fee`, `asset_limit`) exist now (Stripe later); and `activity_log` exists now (richer audit later).

## MVP success criteria (acceptance checklist)

1. Platform owner can create a customer organization manually.
2. Customer admin can log in.
3. Customer admin can create assets.
4. Each asset can have a permanent QR URL.
5. Scanning the QR opens a mobile-friendly public page.
6. The public page has useful instructions, manual links, support info, and action buttons.
7. A public user can submit a damage report with photo/video upload.
8. Admin can view and manage submissions.
9. Admin can edit the public page without changing the QR code.
10. QR codes can be exported as SVG for tag production.
11. Organization data is isolated.
12. The system is deployable on Vercel.
