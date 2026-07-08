# Yard Staff Outbound/Return Scanner Mode

> **Status: Deferred — not built in this wave.** This documents a future wave so it can be
> scoped without re-discovery. No schema, routes, actions, or UI exist for it yet. See
> [`ROADMAP_DEFERRED.md`](ROADMAP_DEFERRED.md).

## Goal

Give **authenticated yard workers** a fast, phone-first way to scan a tag on a piece of
equipment as it leaves the yard (outbound) and again when it comes back (return), and to run a
**lightweight yard workflow** at each point. It ties the existing permanent QR tag to a
rental session and the asset's condition history — nothing heavier.

The intent is operational hygiene at the yard gate: *what went out, in what condition, with
what accessories, and what came back.*

## Boundary — what this is NOT

- **Not rental booking / reservations.** No availability calendar, no quotes, no contracts.
- **Not a full Rental Management System (RMS).** No billing, invoicing, or fleet financials.
- **Not a CMMS.** No work orders, PM scheduling, or maintenance planning.

It is a thin capture layer over the tag scan, tied to **rental sessions** and **condition
history** that the product already models. Anything beyond that is a separate, larger effort.

## Future capabilities (candidate scope)

- **`yard_worker` role** — a staff-level role scoped to yard operations (below customer_admin;
  cannot manage users, plans, or org settings).
- **Staff scanner mode** — an authenticated scan view distinct from the public equipment page,
  surfaced only to yard staff.
- **Outbound flow — "mark rented / start session":**
  - Capture **condition photos** at outbound.
  - Record **accessories / attachments** that go out with the unit.
  - Record **fuel / charge level** and a short **condition checklist**.
  - Start a rental session for the asset.
- **Return flow — "mark returned / close session":**
  - Capture **condition photos** at return.
  - Flag **damage** and **missing accessories** against what went out.
  - Record returned fuel/charge and checklist.
  - Close the rental session.
- **Timeline integration** — every outbound/return action writes to the **asset timeline**, so
  the equipment's history reads as one continuous record.
- **Optional notifications** — notify the admin on damage/missing-accessory flags (reusing the
  existing notification plumbing; opt-in per org).

## How it ties into what exists today

- **Rental sessions** already exist (migration 0014) — outbound/return would start/close them.
- **Acknowledgements** and the **asset timeline** already capture events — condition photos and
  yard actions would append to that same history.
- **Notifications** already have a dry-run-capable sender — damage/missing flags could reuse it.

None of the above is modified by this document; these are the seams a future wave would build on.

## Explicitly out of scope (for the future wave, too)

Booking/availability, billing/invoicing, maintenance work orders, telematics/GPS, and any
customer-facing self-service rental flow. If those are wanted, they are their own initiatives.
