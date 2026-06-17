# Product Requirements Document — AssetTag QR

> Working product name **AssetTag QR** is temporary. All branding, colors, and "Powered by" copy must remain generic and easy to swap later. See `CLAUDE.md` and `docs/PROJECT_CONTEXT.md`.

## 1. Summary

AssetTag QR is a web-based QR equipment info system for equipment rental businesses. Each physical rental asset carries a durable QR tag. When a renter, operator, or staff member scans it, a mobile-friendly hosted equipment page opens with the right information for that specific asset: startup steps, manuals, safety notes, return instructions, support contact, and action buttons for damage reports, support requests, and return checklists.

The QR encodes a permanent platform-controlled URL (e.g. `https://example.com/t/demo-ex017`), so the destination content can change for years without ever reprinting the physical tag.

This is **not** a native app, a CMMS, a rental booking platform, an inventory system, or a maintenance platform. It is a focused, hosted equipment-info service.

## 2. Problem

Rental businesses field repetitive calls about how to start, operate, fuel, and return equipment. Renters misuse machines because instructions aren't at hand. Damage and support issues are reported by phone with no structured record or photos. Paper manuals get lost, and links to external manuals break. There is no quick, asset-specific reference attached to the machine itself.

## 3. Goals

The product should help rental businesses reduce repetitive customer calls, reduce equipment misuse, improve the renter experience, give renters fast access to manuals and startup steps, capture damage reports with photo/video evidence, capture return checklists and support requests, and update equipment-page content without replacing the physical tag. Commercially, it should support a recurring hosted service around QR equipment info pages.

## 4. Target users and market

The first pilot market is **equipment rental businesses**. The MVP should be broad enough to extend later to trailer rentals and fleets, but the first product experience is written for equipment rental.

Adjacent future markets (not MVP targets): trailer rental companies, contractors with fleet/equipment assets, field service fleets, agricultural equipment operators, small rental yards, and tool rental companies.

There are three user types:

- **Platform owner** — the internal owner/operator of the QR tag business. Creates customer organizations and admin users manually, can manage customer assets, and views organizations, QR links, and usage across all organizations.
- **Customer admin** — the rental business owner, manager, or counter staff. Manages their own organization, assets, equipment pages, documents, and QR links; exports QR codes; and reviews submissions for their organization only.
- **Public scanner** — the renter, operator, or field user. No login. Views the public page and submits damage reports, support requests, and return checklists with optional media. Never sees private records.

## 5. Core user experience

A renter scans the tag on a machine. A mobile-first page loads showing the customer's logo or name, the asset name and code, a photo, and clearly sectioned content: quick start, safety notes, fuel/power requirements, return notes, troubleshooting, and emergency/support contact. Manual and video links are available. Action buttons let the user open the start-up guide or manual, report damage, complete a return checklist, or contact support. A configurable footer reads "Powered by [product name]" with a short liability disclaimer.

Behind the scenes, the customer admin edits all of this content from a dashboard, manages assets and documents, generates and exports QR codes as SVG for tag production, and reviews incoming submissions — all scoped strictly to their own organization.

## 6. Functional requirements

The MVP must make this end-to-end workflow work well: physical QR tag → permanent QR URL → public equipment info page → manual/startup/return/support actions → damage/support/return submissions → customer admin dashboard.

Required capabilities:

- Manual customer onboarding (platform owner creates organizations and the first customer admin; no public self-signup).
- Multi-tenant customer organizations with strict data isolation.
- Asset management (create/edit assets with codes, category, make/model, etc.).
- A permanent QR routing layer (`qr_links`) separate from assets, so an asset can have more than one tag over time.
- A public, mobile-first equipment info page per asset, showing only published public content.
- An equipment-page content editor for customer admins.
- Fixed-template forms (not a form builder): damage report, support request, return checklist, and optionally pre-use inspection.
- Photo/video upload through form submissions, with file-type and size limits, organization-scoped storage paths, and basic anti-abuse measures.
- Document management supporting both hosted files and external links, with a manual link-status field (`unknown`, `ok`, `broken`, `needs_review`).
- An admin dashboard to view and manage submissions and export submissions as CSV.
- QR code export as SVG, plus a CSV export and a simple printable production sheet for the physical laser-tag workflow.
- Basic scan and submission analytics.
- Safe public/private data separation enforced by Supabase row-level security from day one.
- Deployability on Vercel.

## 7. Non-functional requirements

The public page is mobile-first and must load quickly on cellular connections in the field. Multi-tenant isolation is enforced via Supabase RLS from the first migration. Uploads are stored in organization-specific paths and public users cannot list stored files. Raw IP addresses are not stored unnecessarily (hash or truncate). Branding is fully configurable and never hard-coded. The codebase stays simple, boring, and maintainable, built as vertical slices that are each demoable, with lint/typecheck/tests/build run after meaningful changes.

## 8. Liability and content rules

The platform hosts or displays customer-provided instructions, links, manuals, and checklists. It does not generate or guarantee safety instructions. Customers approve all equipment-specific safety and use content. Public pages include a configurable disclaimer such as: "Information is provided by the rental company. Always follow manufacturer instructions, rental agreement terms, and applicable safety requirements."

## 9. Out of scope for MVP

CMMS, maintenance scheduling, work orders, rental booking, inventory availability, rental contracts, e-signatures, customer payment collection/Stripe, GPS tracking, native mobile app, offline mode, custom form builder, full analytics suite, automated self-signup, deep rental-software integrations, and AI-generated safety instructions. Billing is manual during MVP and pilots. See `docs/NON_GOALS.md`.

## 10. Success criteria

The first sellable MVP is successful when a platform owner can manually create a customer organization; a customer admin can log in and create assets; each asset has a permanent QR URL; scanning opens a mobile-friendly public page with useful instructions, manual links, support info, and action buttons; a public user can submit a damage report with photo/video; an admin can view and manage submissions; an admin can edit the public page without changing the QR code; QR codes export as SVG for tag production; organization data is isolated; and the system is deployable on Vercel. See `docs/MVP_SCOPE.md` for the detailed checklist.
