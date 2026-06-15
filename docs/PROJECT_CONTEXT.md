# Rental QR Equipment Info Tags: Project Context

## Repo

GitHub repo:

https://github.com/jdapaetz2/QR-Asset-Tags.git

The repo is currently empty. This project should be built from scratch.

## Working product name

Rental QR Equipment Info Tags

This name is temporary. All branding, logos, colors, and “Powered by” copy must be generic and easy to change later.

Use placeholder branding such as:

- Product name: AssetTag QR
- Powered by: Powered by AssetTag QR
- Demo customer: Northridge Rentals

Do not hard-code final company branding.

## Product thesis

This is a web-based QR equipment info system for rental businesses.

Each rental asset gets a durable physical QR tag. When a renter, operator, or staff member scans the tag, it opens a mobile-friendly hosted equipment page with the right information for that specific asset.

The system should help rental businesses:

- Reduce repetitive customer calls
- Reduce equipment misuse
- Improve renter experience
- Give customers quick access to manuals and startup steps
- Capture damage reports with photos or videos
- Capture return checklists and support requests
- Update equipment page content without replacing the physical QR tag
- Create a recurring hosted service around QR equipment info pages

This is not a native app. It is a web-based system optimized for mobile scanning.

## First pilot market

Primary pilot market:

- Equipment rental businesses

Adjacent future markets:

- Trailer rental companies
- Contractors with fleet/equipment assets
- Field service fleets
- Agricultural equipment operators
- Small rental yards
- Tool rental companies

The MVP should be broad enough to support trailer rentals and fleets later, but the first product experience should be written for equipment rental.

## Core user types

### 1. Platform owner

This is the internal owner/operator of the QR tag business.

Can:

- Create customer organizations manually
- Add customer admin users
- Manage customer assets if needed
- View organizations
- View QR links
- View usage/submissions across organizations
- Help onboard pilot customers

### 2. Customer admin

This is the rental business owner, manager, or counter staff.

Can:

- Log in
- Manage their own organization profile
- Manage their own assets
- Create and edit public equipment pages
- Upload or link manuals, videos, and other documents
- View QR links
- Export QR codes as SVG
- View damage reports, support requests, and return checklist submissions
- Export submissions as CSV

### 3. Public scanner

This is the renter, operator, customer, or field user scanning the physical tag.

No login required.

Can:

- Scan the QR code
- View the public equipment page
- View startup instructions
- View support contact info
- Open linked or hosted manuals
- Submit damage reports
- Submit support requests
- Submit return checklists
- Upload photo or video evidence, subject to size/type limits

Public scanners must not see private records, maintenance history, rental history, customer names, billing info, or internal notes.

## MVP principle

Build a simple, robust hosted equipment info system.

Do not build a CMMS.
Do not build a rental booking system.
Do not build inventory availability.
Do not build customer billing in MVP.
Do not build a form builder in MVP.
Do not build a native mobile app.
Do not build advanced maintenance scheduling.
Do not build GPS tracking.
Do not build work orders.
Do not build e-sign rental contracts.

The MVP must make this workflow work well:

Physical QR tag
→ Permanent QR URL
→ Public equipment info page
→ Manual/startup/return/support actions
→ Damage report/support/return submissions
→ Customer admin dashboard

## Key product decision

The QR code should encode a permanent URL controlled by this platform.

Example:

https://example.com/t/EX017DEMO

The QR should not encode a disposable third-party manual link, Airtable link, Google Drive link, or temporary route.

Reason:

The physical tag may last years. The software destination must be changeable without replacing the tag.

## Recommended technical stack

Use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui or a similarly simple component pattern
- Supabase for Postgres database, auth, storage, and row-level security
- Vercel for hosting/deployment
- Stripe later, not in MVP

Billing should be manual during MVP and pilots.

The app should be structured so Stripe can be added later, but do not implement Stripe until pilot demand is validated.

## MVP data model

Required core tables:

### organizations

Represents each customer company.

Fields:

- id
- name
- slug
- logo_url
- primary_color
- support_phone
- support_email
- website_url
- powered_by_label
- status
- plan_name
- monthly_fee
- asset_limit
- created_at
- updated_at

### profiles

Extends auth users.

Fields:

- id
- auth_user_id
- organization_id
- name
- email
- role
- created_at
- updated_at

Roles:

- platform_owner
- customer_admin
- customer_staff

### assets

Each physical rental asset.

Fields:

- id
- organization_id
- asset_code
- asset_name
- category
- make
- model
- serial_number
- year
- public_status
- cover_image_url
- support_phone_override
- support_email_override
- internal_notes
- created_at
- updated_at

Example asset codes:

- EXCAVATOR-017
- TRAILER-014
- GEN-008
- COMPACTOR-003

### qr_links

Permanent QR routing layer.

Fields:

- id
- organization_id
- asset_id
- short_code
- public_url
- status
- created_at
- updated_at
- last_scanned_at

An asset may eventually have more than one QR link, so keep qr_links separate from assets.

### equipment_pages

Public page content for each asset.

Fields:

- id
- asset_id
- headline
- quick_start_text
- safety_notes
- fuel_power_notes
- return_notes
- troubleshooting_notes
- emergency_notes
- is_published
- created_at
- updated_at

### documents

Manuals, videos, OEM links, hosted files, startup guides, safety sheets.

Fields:

- id
- organization_id
- asset_id
- title
- document_type
- url
- storage_path
- visibility
- link_status
- last_checked_at
- created_at
- updated_at

document_type values:

- manual
- startup_guide
- safety_sheet
- video
- return_checklist
- other

visibility values:

- public
- private

link_status values:

- unknown
- ok
- broken
- needs_review

The MVP should allow both hosted files and external links.

Host as little as practical, but support uploads when the customer cannot provide a reliable link.

### form_submissions

Captures damage reports, support requests, pre-use inspections, and return checklists.

Fields:

- id
- organization_id
- asset_id
- form_type
- submitted_by_name
- submitted_by_email
- submitted_by_phone
- submission_data_json
- media_urls
- status
- created_at

form_type values:

- damage_report
- support_request
- return_checklist
- pre_use_inspection

status values:

- new
- reviewed
- resolved
- archived

### scan_events

Basic scan analytics.

Fields:

- id
- organization_id
- asset_id
- qr_link_id
- scanned_at
- user_agent
- ip_hash
- referrer
- device_type

Do not store raw IP unnecessarily. Hash or truncate as appropriate.

### activity_log

Internal audit trail.

Fields:

- id
- organization_id
- actor_user_id
- action
- entity_type
- entity_id
- metadata_json
- created_at

## Public equipment page

The public scanner page should be mobile-first.

It should show:

- Customer logo or generic customer name
- Asset name
- Asset code
- Photo if available
- Quick start section
- Safety notes
- Fuel/power requirements
- Return notes
- Troubleshooting
- Emergency/support contact
- Manual links
- Video links
- Buttons:
  - Start-Up Guide
  - Manual
  - Report Damage
  - Return Checklist
  - Contact Support

It should include a small configurable footer:

Powered by [temporary product name]

Do not make the public scanner log in.

## Form requirements

MVP forms should be fixed templates, not a custom form builder.

Required forms:

### Damage report

Fields:

- Name
- Phone
- Email
- Description
- Urgency
- Photo/video upload
- Asset prefilled and not editable

### Support request

Fields:

- Name
- Phone
- Email
- Issue description
- Preferred contact method
- Photo/video upload optional
- Asset prefilled and not editable

### Return checklist

Fields:

- Name
- Phone/email optional
- Condition notes
- Fuel level or charge level
- Cleaned yes/no
- Accessories returned yes/no
- Damage observed yes/no
- Photo/video upload optional
- Asset prefilled and not editable

### Pre-use inspection

Can be added after damage/support/return forms unless simple.

## Upload requirements

Photo and video upload is valuable and should be included if practical.

Guardrails:

- Limit file types
- Limit file size
- Store media in customer/organization-specific paths
- Prevent public users from listing uploaded files
- Consider rate limiting or abuse protection
- Consider honeypot field or simple anti-spam mechanism
- Public users can upload through forms only
- Admin users can view uploads only for their organization

## Link management requirements

The system should support both hosted files and external links.

Because external links can break, include a simple link status field from the start:

- unknown
- ok
- broken
- needs_review

Full automated link checking can come later, but the data model should be ready.

MVP can include a manual “mark as checked” or “needs review” status.

Later version can run scheduled link checks.

## QR/tag production requirements

The MVP should support the physical laser tag workflow.

Customer admin or platform owner should be able to:

- Select assets
- Export QR codes as SVG
- Export CSV with asset_code, asset_name, short_url, organization_name
- Generate a simple printable production sheet or HTML page
- Include tag metadata such as:
  - tag size
  - material
  - mounting method
  - asset code
  - short URL

Laser software integration is not required in MVP.

## Manual onboarding

Manual onboarding is acceptable for MVP.

No public self-signup required.

Platform owner can create organizations and users manually.

The app should support this flow:

1. Platform owner creates organization.
2. Platform owner creates first customer admin.
3. Customer admin logs in.
4. Customer admin adds assets or platform owner imports/enters assets.
5. Customer admin edits equipment pages.
6. QR codes are generated/exported.
7. Physical tags are produced separately.
8. Customer deploys tags.

## Security model

Must support multi-tenant organization isolation from day one.

Rules:

- Customer admins can only access their own organization’s data.
- Public QR pages expose only published public content.
- Public users can create form submissions but cannot list or read submissions.
- Public users can upload media only through form submission flows.
- Admin users can view submissions only for their organization.
- Platform owner can manage all organizations.
- Private notes, internal notes, billing info, and submissions are never shown on public pages.

## Product non-goals

Do not build these in MVP:

- CMMS
- Maintenance scheduling
- Work orders
- Rental booking
- Rental contracts
- E-signatures
- Customer payment collection
- GPS tracking
- Native mobile app
- Offline mode
- Custom form builder
- Full analytics suite
- Automated customer self-signup
- Deep integrations with rental software
- AI-generated safety instructions

## Liability and content rules

The system can host or display customer-provided instructions, links, manuals, and checklists.

The platform should not generate or guarantee safety instructions.

Customer should approve all equipment-specific safety/use content.

Pages can include a configurable disclaimer such as:

“Information is provided by the rental company. Always follow manufacturer instructions, rental agreement terms, and applicable safety requirements.”

## Demo data

Create demo organization:

Northridge Rentals

Demo assets:

1. Excavator 017
   - asset_code: EXCAVATOR-017
   - category: Mini Excavator
   - make/model placeholder

2. Trailer 014
   - asset_code: TRAILER-014
   - category: Utility Trailer

3. Generator 008
   - asset_code: GEN-008
   - category: Portable Generator

4. Plate Compactor 003
   - asset_code: COMPACTOR-003
   - category: Plate Compactor

## MVP success criteria

The first sellable MVP is successful when:

1. A platform owner can create a customer organization manually.
2. A customer admin can log in.
3. A customer admin can create assets.
4. Each asset can have a permanent QR URL.
5. Scanning the QR opens a mobile-friendly public page.
6. The public page has useful instructions, manual links, support info, and action buttons.
7. A public user can submit a damage report with photo/video upload.
8. Admin can view and manage submissions.
9. Admin can edit the public page without changing the QR code.
10. QR codes can be exported as SVG for tag production.
11. Organization data is isolated.
12. The system is deployable on Vercel.
