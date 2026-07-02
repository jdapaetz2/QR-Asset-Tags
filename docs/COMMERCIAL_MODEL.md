# Commercial Model — AssetTag QR

AssetTag QR is a customer-facing equipment support, documentation, intake, and
condition-history layer for rental assets, **bundled with durable physical QR tags and
implementation**. It is not generic QR software and not a per-scan product.

## Pricing basis

- **Scans are unlimited.** There is no per-scan billing or scan metering.
- Pricing is based on **covered assets per yard / location**.
- Annual plans may include a **tag production credit**; monthly plans may not.
- Metal tags are durable field hardware, not cheap sticker packs.

## Covered asset — the definition

> **Covered asset = an active, non-archived asset that has AssetTag QR coverage assigned
> for the subscription term.**

**MVP implementation:** a covered asset is an asset where
- `assets.archived_at is null`, **and**
- the asset has **at least one `qr_links` row** (a tag has been assigned).

### What counts / does not count
- **Counts:** a non-archived asset with any assigned QR link — **even if that link's
  status is currently `disabled`**. Disabling a tag must never become a way to reduce the
  plan count.
- **Does not count:** archived assets; imported/draft assets that have no QR link.
- **Irrelevant:** scan activity and rental status never affect the covered count.

## What is not billed / not built

- No paused coverage and **no customer-controlled seasonal pause**.
- No Stripe, invoices, payment collection, tax logic, billing portal, public pricing
  page, or customer self-upgrade checkout in the app. Plan fields are **commercial
  metadata**, not billing. `tag_credit` is metadata, not a payment.

## Plans (internal presets)

Owner/admin-only presets (CAD): **Starter Yard** (25 covered), **Standard Yard** (100),
**Pro Yard** (250), **Scale Yard** (500), and **Custom**. Intro/year-one, renewal, and
tag-credit amounts are stored per org. These are internal — there is no public pricing
page.

Prices are **entered in CAD dollars** in the owner UI (e.g. `4500`) and **stored internally
in cents** (`450000`) for precision — see `lib/plans/money.ts`. This is commercial metadata,
not billing/Stripe.

## Plan fields are platform-admin-only

Plan/commercial fields live on `organizations` (`plan_key`, `plan_name`,
`billing_interval`, `asset_limit`, `intro_price_cents`, `renewal_price_cents`,
`tag_credit_cents`, `storage_limit_mb`, `video_uploads_enabled`, `plan_notes`, plus the
legacy `monthly_fee`).

- Only the **platform owner** can set them, via
  `/owner/organizations/[id]/settings`.
- **Customers cannot change them** — not in the UI, and not via the Supabase API: a DB
  trigger (`protect_commercial_fields`, migration 0016) coerces any non-owner change to
  these columns (and the export flags) back to their previous values.

## Enforcement (coverage limits)

- **Imports/drafts are never blocked.** Customers can import and draft more assets than
  their plan covers — asset records, equipment pages, templates, and documents are all
  unrestricted.
- **New QR/tag coverage is what's limited.** Creating the first QR link for an
  uncovered, non-archived asset consumes one covered slot; if the org is at/over
  `asset_limit` it is blocked with: *"Covered asset limit reached. Contact AssetTag QR to
  add more covered assets."* Enforced both app-side (`createQrLink`) and by a hard DB
  trigger (`enforce_qr_coverage_limit`, 0016).
- **Tag requests** are similarly checked: a request that would push new coverage past the
  limit is blocked. Replacement tags for already-covered assets don't increase the count.
- **`asset_limit = null` means unlimited / custom / unset** and blocks nothing.
- **Existing tags keep scanning** — enforcement only affects *new* coverage. Lowering a
  limit below current coverage never breaks existing tags or public pages.
- The platform owner bypasses all coverage limits (custom/special requests).

## Org status vs plan limit (separate concepts)

`organizations.status` (`active` / `suspended`) controls account/org access and is
**unchanged** by this work. `asset_limit` controls the covered-asset count. They are
independent.

## Deferred (preserved in the backlog)

- **Yard Staff Outbound/Return Scanner Mode** — authenticated workers scan tags during
  outbound/return, mark rented/returned, capture condition photos + accessories/fuel/
  charge, and write to the asset timeline. Not built here.
- **Storage limits, quotas, retention, and media lifecycle** — documents, cover images,
  damage/return photos, acknowledgements, and future condition media are stored;
  unlimited scans are fine but unlimited storage is not. `storage_limit_mb` and
  `video_uploads_enabled` are captured as metadata but **not enforced** yet.
- MCore-specific metal-tag production testing after delivery, final brand/domain
  decision, and a standalone sales/demo flow.
