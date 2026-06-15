# User Stories — AssetTag QR (MVP)

Stories are grouped by the three user types. Each has acceptance criteria. Anything not listed here is out of MVP scope (see `docs/NON_GOALS.md`).

## Platform owner

**PO-1 — Create a customer organization**
As a platform owner, I want to create a customer organization manually so I can onboard a pilot customer.
*Acceptance:* I can set name, slug, contact info, branding placeholders, status, plan name, monthly fee, and asset limit. The org appears in my organizations list.

**PO-2 — Create the first customer admin**
As a platform owner, I want to create the first customer admin user for an organization so they can log in.
*Acceptance:* I can create a profile with role `customer_admin` tied to one organization; the user can authenticate.

**PO-3 — View all organizations and usage**
As a platform owner, I want to see all organizations, their QR links, and usage/submission counts so I can support pilots.
*Acceptance:* I can list every organization and drill into its assets, QR links, and submission/scan counts regardless of tenant boundaries.

**PO-4 — Manage customer assets when needed**
As a platform owner, I want to enter or import assets on a customer's behalf so I can help with onboarding.
*Acceptance:* I can create/edit assets and equipment pages for any organization.

## Customer admin

**CA-1 — Log in**
As a customer admin, I want to log in securely so I can manage my organization.
*Acceptance:* Auth via Supabase; I land in a dashboard scoped to my organization only.

**CA-2 — Manage organization profile**
As a customer admin, I want to edit my organization profile (logo, color, support phone/email, website, powered-by label) so my public pages reflect my business.
*Acceptance:* Changes persist and appear on my public pages; I cannot edit other organizations.

**CA-3 — Manage assets**
As a customer admin, I want to create and edit assets so each machine has a record.
*Acceptance:* I can set asset code, name, category, make, model, serial, year, public status, cover image, support overrides, and internal notes for my org only.

**CA-4 — Edit the public equipment page**
As a customer admin, I want to edit page content (headline, quick start, safety, fuel/power, return, troubleshooting, emergency notes) and publish it so renters see useful info.
*Acceptance:* I can edit and publish/unpublish; edits appear on the public page **without changing the QR code**.

**CA-5 — Manage documents and links**
As a customer admin, I want to attach manuals, startup guides, safety sheets, videos, and return checklists as hosted files or external links so renters can open them.
*Acceptance:* I can add documents with type and visibility (public/private), upload files or paste links, and set link status (`unknown`/`ok`/`broken`/`needs_review`) with a manual "mark as checked".

**CA-6 — View and export QR links**
As a customer admin, I want to see each asset's permanent QR link and export QR codes as SVG so I can produce physical tags.
*Acceptance:* I can view short codes/URLs, export SVG per asset or in bulk, export a CSV (`asset_code`, `asset_name`, `short_url`, `organization_name`), and generate a printable production sheet with tag metadata.

**CA-7 — Review submissions**
As a customer admin, I want to view damage reports, support requests, and return checklists for my org so I can act on them.
*Acceptance:* I can list and open submissions with their media, change status (new/reviewed/resolved/archived), and export submissions as CSV. I never see other organizations' submissions.

**CA-8 — See basic analytics**
As a customer admin, I want basic scan and submission counts so I know tags are being used.
*Acceptance:* I can see scan counts and submission counts for my assets.

## Public scanner (no login)

**PS-1 — Scan and view the equipment page**
As a renter/operator, I want to scan the tag and immediately see this machine's info so I can use it correctly.
*Acceptance:* Scanning `/t/{short_code}` opens a mobile-first page with logo/name, asset name and code, photo, quick start, safety, fuel/power, return, troubleshooting, and support contact. Only published public content shows.

**PS-2 — Open manuals and startup guides**
As an operator, I want to open the manual or startup guide so I can operate the equipment.
*Acceptance:* Public documents open via their links/hosted files; private documents never appear.

**PS-3 — Report damage**
As a renter, I want to report damage with photos/video so the rental company knows.
*Acceptance:* I submit name, phone, email, description, urgency, and optional media; the asset is prefilled and not editable. I get a confirmation. I cannot view or list any submissions.

**PS-4 — Request support**
As a renter, I want to request support so I can get help.
*Acceptance:* I submit name, phone, email, issue description, preferred contact method, and optional media; asset prefilled and not editable.

**PS-5 — Complete a return checklist**
As a renter, I want to complete a return checklist so the return is documented.
*Acceptance:* I submit condition notes, fuel/charge level, cleaned (y/n), accessories returned (y/n), damage observed (y/n), optional contact info, and optional media; asset prefilled.

**PS-6 — (Optional) Pre-use inspection**
As an operator, I want to record a quick pre-use inspection if offered.
*Acceptance:* Added only if it stays simple; same submission and media rules apply.

**PS-7 — Contact support**
As a renter, I want quick access to the rental company's support contact so I can call or email.
*Acceptance:* Support phone/email (org-level or asset override) is shown and tappable.

## Cross-cutting / negative stories

**X-1 — Public users cannot read private data.** Public pages never expose internal notes, maintenance/rental history, customer billing, or other organizations' data. Public users cannot list or read submissions or stored files.

**X-2 — Tenant isolation.** Any admin request for data outside their organization is denied by RLS, not just hidden in the UI.

**X-3 — Upload guardrails.** Uploads are limited by type and size, stored in org-specific paths, and protected by basic anti-abuse measures.
