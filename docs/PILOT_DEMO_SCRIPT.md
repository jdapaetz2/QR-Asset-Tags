# Pilot Demo Script — AssetTag QR

A concise, click-by-click script for demoing the MVP on a customer call (~10–15
min). It runs the full core loop on the **Northridge Rentals** demo org. This is a
script, not a manual — for the narrative framing, talking points, and "what's
coming later," see the companion doc
[PILOT_CUSTOMER_DEMO.md](PILOT_CUSTOMER_DEMO.md). For setup, see
[ONBOARDING_RUNBOOK.md](ONBOARDING_RUNBOOK.md).

**Before the call:** demo org seeded, the four demo assets published with a public
document each, a phone ready to scan **Excavator 017** (`/t/demo-ex017`), and two
logins ready (platform admin and the Northridge customer admin).

Demo short codes: `demo-ex017`, `demo-tr014`, `demo-gen008`, `demo-comp003`.

> Reminder of the model: **AssetTag QR (the platform admin) owns QR/tag
> production.** The customer manages content and submissions; we produce the tags.

---

## Script

1. **Log in as the AssetTag QR platform admin** — `/login`. You land on `/owner`.

2. **Show organizations** — `/owner` lists every customer org. Point out this is
   how pilots are onboarded today (manual, by design).

3. **Log in as the customer admin** (Northridge Rentals) — `/login`. You land on
   `/dashboard`, scoped to just this org.

4. **Show the dashboard** — `/dashboard`. Org-scoped home for the customer admin.

5. **Show assets** — `/dashboard/assets`. The four demo machines, each with a code
   and status.

6. **Edit an equipment page** — open Excavator 017 and its page editor
   (`/dashboard/assets/[assetId]/page`). Change the quick-start text and **Publish**.
   This is the key value: the physical tag is permanent, the content is live.

7. **View the public QR page** — scan the tag, or open **`/t/demo-ex017`** on a
   phone. No app, no login. Show: Northridge branding, asset name/code/photo, the
   content sections, action buttons (Start-Up Guide, Manual, Report Damage, Return
   Checklist, Contact Support), and the "Powered by" footer. Your edit from step 6
   is already live — no reprint.

8. **Submit a form** — tap **Report Damage** → `/forms/demo-ex017/damage`. Fill
   name/phone/email, a short description, urgency, and attach a photo. Note the asset
   is prefilled and locked, and renters can't see anyone else's reports. Submit and
   show the confirmation. (Mention the **Support** and **Return checklist** forms at
   `/forms/demo-ex017/support` and `/forms/demo-ex017/return`.)

9. **View the submission inbox** — back as the customer admin, open
   `/dashboard/submissions`, open the damage report
   (`/dashboard/submissions/[submissionId]`) with its photo, and change status from
   *new* to *reviewed*. Mention CSV export.

10. **Add a public manual / start-up guide** — open the asset's documents
    (`/dashboard/assets/[assetId]/documents`), add or confirm a manual as a link or
    hosted file, set **visibility = public**.

11. **Show public document links** — refresh **`/t/demo-ex017`** and tap **Manual**
    / **Start-Up Guide** to open the public document. Content updated; tag unchanged.

12. **Generate owner QR production outputs** — switch to the platform admin and open
    **`/owner/production`**. Select the demo assets and show: per-asset **QR SVG**,
    the **SVG sheet**, the **CSV** (`asset_code`, `asset_name`, `short_url`,
    `organization_name`), and the printable **production sheet** with tag metadata
    (size, material, mounting, code, short URL). Note customer admins don't see this —
    AssetTag QR controls tag production.

13. **View analytics** — customer admin: `/dashboard/analytics` (scan/submission
    counts for this org). Platform admin: `/owner/analytics` (usage across orgs).

---

## Reset between demos

Re-seed or archive the demo submissions so each demo starts clean, and revert any
quick-start text edits made during the walkthrough.
