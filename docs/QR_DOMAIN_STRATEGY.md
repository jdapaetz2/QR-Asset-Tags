# QR Domain Strategy & Durability

Physical QR tags are permanent. The data they encode must stay valid for the life of
the equipment, so the **domain** the QR points at is durable infrastructure — treat it
with the same care as the database.

## What a tag encodes

Every QR encodes `${NEXT_PUBLIC_SITE_URL}/t/{short_code}`. Two parts:

- **`short_code`** — a durable, opaque identifier stored in `qr_links`. It never
  changes for a given tag and is resolved server-side to the asset.
- **The domain/base URL** — `NEXT_PUBLIC_SITE_URL`. This is **not** durable unless you
  make it durable. If it changes after tags are printed, the printed tags break.

The app always **computes** scan/export URLs from `NEXT_PUBLIC_SITE_URL` + `short_code`
(see `lib/qr/url.ts`). It never trusts the stored `qr_links.public_url`, which can hold
a stale placeholder host. Exports follow the same rule.

## Rules

1. **Production tags must use a stable production/custom domain** (e.g.
   `https://tags.yourcompany.com` or the product's production host). Decide the domain
   **before** producing physical tags.
2. **`localhost` and Vercel preview URLs are for testing only.** Never produce physical
   tags whose base URL is a preview deployment or `localhost`. Production CSV/SVG export
   refuses obvious non-production base URLs where it can.
3. **Changing the domain after tags are produced breaks those tags** unless you keep the
   old domain serving (or 301-redirecting `/t/*` to) the new one. If a domain change is
   unavoidable, preserve redirects from the old host for the life of the tags.
4. **The `short_code` is durable; the domain must be too.** Keeping short codes stable is
   necessary but not sufficient — the host has to keep resolving them.

## Pre-production checklist

- [ ] `NEXT_PUBLIC_SITE_URL` is set to the final production/custom domain.
- [ ] A test scan of a real printed sample resolves correctly on mobile.
- [ ] DNS/host for the domain is owned by the operator and not expiring.
- [ ] A redirect plan exists if the domain ever has to change.

## Data exports (trust / offboarding)

Customer data export is a **platform-controlled** capability, not a default feature:

- Self-serve customer export access is **disabled by default** for every organization.
- AssetTag QR (platform admin) can **enable exports per organization** when a buyer-trust
  or offboarding need arises, including which export types are available.
- The platform admin can **always** export an organization's data for support, handoff,
  or offboarding regardless of the customer toggles.
- Exports are CSV only and contain a single organization's data. **Private media files
  are not included** in CSVs; media handoff is a manual platform-admin process.

This gives buyers confidence their data isn't locked in, without exposing export tooling
to every small rental yard by default.
