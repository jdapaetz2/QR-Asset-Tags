# Pilot Customer Demo — AssetTag QR

A repeatable script for demoing the MVP to a pilot equipment-rental customer. It walks the full core loop using the **Northridge Rentals** demo organization. Branding shown is placeholder ("AssetTag QR" / "Powered by AssetTag QR") and will be replaced.

> **Companion:** for the concise click-by-click version to follow live on a call,
> use [PILOT_DEMO_SCRIPT.md](PILOT_DEMO_SCRIPT.md). This document is the narrative
> version — framing, talking points, and what to say is coming later.

## Demo setup

Demo organization: **Northridge Rentals**

Demo assets:

| Asset | asset_code | category |
|---|---|---|
| Excavator 017 | EXCAVATOR-017 | Mini Excavator |
| Trailer 014 | TRAILER-014 | Utility Trailer |
| Generator 008 | GEN-008 | Portable Generator |
| Plate Compactor 003 | COMPACTOR-003 | Plate Compactor |

Before the demo: each asset has a published equipment page, at least one public document (a manual link or hosted PDF), and a generated permanent QR link. Have a phone ready to scan a printed/displayed QR for Excavator 017.

## The story (≈10–15 minutes)

Frame it around the rental counter's pain: repeat "how do I start this?" calls, equipment misuse, and damage that shows up with no record. AssetTag QR puts the right info on the machine and captures structured reports back.

### 1. The renter experience (lead with this)

Scan the QR on **Excavator 017** with a phone. The mobile-first public page opens instantly — no app, no login. Point out:

- Northridge Rentals branding (logo/name), the asset name and code, and a photo.
- Sectioned info: quick start, safety notes, fuel/power requirements, return notes, troubleshooting, emergency/support contact.
- Action buttons: Start-Up Guide, Manual, Report Damage, Return Checklist, Contact Support.
- The "Powered by" footer and the disclaimer that content comes from the rental company.

Tap **Manual** to open a real manual. Tap **Contact Support** to show the tappable phone/email.

### 2. Capture a damage report

Tap **Report Damage**. Fill in name, phone, email, a short description, urgency, and attach a photo or short video. Note that the asset is prefilled and can't be changed, and that the renter cannot see anyone else's reports. Submit and show the confirmation.

### 3. The admin side

Switch to the customer admin dashboard (logged in as Northridge Rentals). Show:

- The **submission inbox** — open the damage report just filed, with its photo, and change status from *new* to *reviewed*. Export submissions as CSV.
- The **equipment-page editor** — edit the quick-start text for Excavator 017, publish, then re-scan (or refresh) the public page to show the change **without reprinting the QR tag**. This is the key value: the physical tag is permanent, the content is live.
- **Documents** — add or update a manual link and set its link status.

### 4. Tag production

Show **QR export**: select assets, export QR codes as **SVG**, export the CSV (`asset_code`, `asset_name`, `short_url`, `organization_name`), and open the printable production sheet with tag metadata (size, material, mounting, code, short URL). Explain that tags are laser-etched separately and last for years.

### 5. The platform-owner view (optional)

Briefly show that the platform owner created Northridge Rentals and its admin manually, and can see organizations, QR links, and usage across customers. This is how pilots are onboarded today (manual, by design).

## Talking points

- **Permanent QR, changeable content** — the tag is printed once; the page updates forever.
- **No app, no login for renters** — scan and go.
- **Structured capture** — damage/support/return come back with photos and a record, not a phone call.
- **Multi-tenant and isolated** — each customer's data is walled off.
- **Hosted recurring service** — this is an ongoing service, billed manually during the pilot.

## What to say is coming later (not in MVP)

Be clear about the boundary: this is not a CMMS, booking, inventory, work orders, or maintenance scheduling. Automated link checking, Stripe billing, and richer analytics are on the roadmap but intentionally not in the pilot. See `docs/NON_GOALS.md`.

## Reset between demos

Re-seed or archive the demo submissions so each demo starts clean, and revert any quick-start text edits made during the walkthrough.
