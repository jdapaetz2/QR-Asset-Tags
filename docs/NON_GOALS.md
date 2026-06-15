# Non-Goals — AssetTag QR

This product is a **web-based QR equipment info system for rental businesses**. It is deliberately narrow. The items below are explicitly out of scope. Do not build them unless they are explicitly requested and re-scoped. If a request seems to drift toward one of these, flag it and record the decision in `docs/OPEN_QUESTIONS.md`.

## What this product is NOT

It is not a CMMS, not a rental booking platform, not an inventory system, not a maintenance platform, and not a native mobile app. It is a focused hosted service: scan a tag, get the right equipment info, take an action.

## Hard non-goals (not in MVP)

- **CMMS** — no computerized maintenance management.
- **Maintenance scheduling** — no service intervals, reminders, or PM plans.
- **Work orders** — no work-order creation, assignment, or tracking.
- **Rental booking** — no reservations, calendars, or availability.
- **Inventory availability** — no stock/availability tracking.
- **Rental contracts** — no contract generation or storage.
- **E-signatures** — no signing workflows.
- **Customer payment collection / Stripe** — billing is manual during MVP and pilots. Structure the code so Stripe can be added later, but do not implement it until pilot demand is validated.
- **GPS tracking** — no location tracking of assets.
- **Native mobile app** — web-based, mobile-first only.
- **Offline mode** — assumes connectivity.
- **Custom form builder** — forms are fixed templates only.
- **Full analytics suite** — only basic scan/submission counts.
- **Automated customer self-signup** — onboarding is manual by the platform owner.
- **Deep integrations with rental software** — no rental-system connectors.
- **AI-generated safety instructions** — the platform never generates or guarantees safety content.
- **Automated link checking** — link status is manual in MVP (data model is ready for automation later).

## Branding non-goal

Do not hard-code final company branding, logos, colors, or "Powered by" copy. The working name **AssetTag QR** is temporary; all branding must stay generic and easy to change.

## Liability non-goal

The platform hosts and displays customer-provided content. It does not author, generate, or guarantee equipment-specific safety or operating instructions. Customers approve all such content. Public pages carry a configurable disclaimer.

## Deferred but data-model-ready

Some non-goals are intentionally anticipated in the schema so they can be enabled later without painful migrations: multiple QR links per asset (`qr_links` is its own table), automated link checking (`documents.link_status` + `last_checked_at`), Stripe billing (`organizations.plan_name` / `monthly_fee` / `asset_limit`), and richer auditing (`activity_log`). Designing for these is allowed; *building* them now is not.
