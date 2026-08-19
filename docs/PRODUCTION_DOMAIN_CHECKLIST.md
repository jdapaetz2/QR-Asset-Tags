# Production Domain Checklist — Mulemark

**Owner: the operator.** Every item here is an external action (purchase, DNS, hosting config) that this
repository cannot perform and must not fake. Nothing on this list is a software defect — the code already
enforces the consequences of an unset domain (see "What the code already does" below).

Policy and rationale live in [`QR_DOMAIN_STRATEGY.md`](QR_DOMAIN_STRATEGY.md). This file is the
**executable gate list**: complete it, and permanent tag production becomes possible.

## Why this is a hard gate

A physical QR tag is permanent. It encodes `NEXT_PUBLIC_SITE_URL + /t/<short_code>` at the moment it is
etched. If that origin ever stops resolving, **every tag made from it is dead metal**. The short code is
durable; the domain is only durable if you make it so.

## Decided architecture (Phase B3)

| | |
|---|---|
| **Canonical product + QR host** | **`https://mulemark.io`** |
| Permanent tags encode | `https://mulemark.io/t/{shortCode}` |
| Dashboard / login | same host for now (`mulemark.io/dashboard/*`, `/login`) |
| `www.mulemark.io/*` | **path-preserving redirect** to `mulemark.io/*` |
| `getmulemark.com` | **reserved** for the future marketing site — **never** a QR destination |
| `mulemark.ca` | **reserved** for a Canadian redirect/landing page — **never** a QR destination |
| Future `app.mulemark.io` | a dashboard move **must not** disturb `mulemark.io/t/*` |

Email stays on **Google Workspace** (`mulemark.io` primary, `support@mulemark.io`). Sending for
notifications is the verified Resend subdomain `notify.mulemark.io` — **Phase B4**, not this one.

## Status

| Item | Status | Notes |
|---|---|---|
| 1. Domain purchased | ✅ done | `mulemark.io`, `getmulemark.com`, `mulemark.ca` all operator-owned |
| 2. Stable application hostname decided | ✅ done (B3) | **apex `mulemark.io`** — see the table above |
| 3. Add `mulemark.io` to the production Vercel project | ⬜ **operator** | `vercel domains ls` currently returns **0 domains** |
| 4. Add `www.mulemark.io` + set it to redirect to the apex | ⬜ **operator** | path-preserving |
| 5. Add the DNS records **Vercel displays** | ⬜ **operator** | do not invent values; see the preservation warning below |
| 6. HTTPS certificate issued and valid | ⬜ **operator** | the guard rejects `http:` |
| 7. Production `NEXT_PUBLIC_SITE_URL=https://mulemark.io` | ⬜ **operator** | Production scope only, no trailing slash |
| 8. Preview `NEXT_PUBLIC_SITE_URL` left on the staging URL | ⬜ **operator — verify unchanged** | preserves B1B isolation |
| 9. Redeploy production | ⬜ **operator** | env is read at **build** time; an existing deployment keeps old values |
| 10. Confirm deployed commit + Node 22.x | ⬜ **operator** | project is already on 22.x as of B1B |
| 11. Redirect obligation documented + owned | ⬜ **operator** | section below — the one people forget |
| 12. `npm run verify:tag-config` passes against Production | ⬜ **blocked on 3–9** | currently exits 1 by design |
| 13. Live route verification on the custom domain | ⬜ **blocked on 3–9** | Part E list below |
| 14. Permanent QR scan test on real phones | ⬜ **operator, needs hardware** | `docs/REAL_DEVICE_QA.md` |
| 15. Physical-tag material/process QA | ⬜ **separate gate** | `docs/TAG_PRODUCTION_READINESS.md` — *not* closed by B3 |

### ⚠️ Adding an apex record must not disturb mail

`mulemark.io` already carries live Google Workspace mail and a verified Resend sending subdomain.
Adding Vercel's apex A/ALIAS record touches only the apex address record — but confirm **after** the
change that every one of these still resolves unchanged:

- **MX** records for Google Workspace
- **SPF** TXT on the apex
- **DKIM** for Google Workspace
- **DMARC** (`_dmarc`, currently `p=none`)
- `resend._domainkey.notify` (Resend DKIM)
- `send.notify` (Resend return-path MX)

If your DNS host offers a "delete conflicting records" prompt while adding the apex record, read exactly
what it proposes to delete before accepting. Losing MX takes email down; losing the Resend records breaks
B4 before it starts.

### Steps 3–9, in order

1. Vercel → project `qr-asset-tags` → **Settings → Domains** → add `mulemark.io`.
2. Add `www.mulemark.io`; choose **Redirect to `mulemark.io`** (Vercel's redirect preserves the path).
3. Create the DNS records **exactly as Vercel shows them** at your registrar/DNS host.
4. Wait for Vercel to report the domain **Valid** with a certificate issued.
5. Settings → Environment Variables → **Production** → set `NEXT_PUBLIC_SITE_URL=https://mulemark.io`.
6. Confirm the **Preview**-scoped `NEXT_PUBLIC_SITE_URL` still points at the staging/branch URL.
7. Redeploy production and note the commit.

### Part E — verify after the redeploy

- `https://mulemark.io` — landing page
- `https://mulemark.io/t/<demoCode>` — scan page, **exact short-code path**
- public damage / support / return forms
- `/login`, `/dashboard/*`, `/owner/*`
- signed media loads for an admin
- `/owner/production/qr.svg`, `export.csv`, `sheet` — should now emit **without** `?unsafe=1`
- `https://www.mulemark.io/t/<demoCode>` → redirects to the apex **with the path intact**
- the staging URL still resolves to staging and is still SSO-protected
- `npm run verify:production-config` and `npm run verify:tag-config` — both must pass

## 6 — the redirect obligation, stated plainly## 6 — the redirect obligation, stated plainly

If the domain ever changes after tags are produced, the **old origin must keep serving or 301-redirecting
`/t/*` to the new host, path-preserving, indefinitely** — for the working life of the equipment, which is
years. A redirect that drops the path (`/t/abc123` → `/`) is useless: the short code is the entire
payload.

Before producing tags, record here:

- who owns the domain registration and renewal,
- what happens to it if the business changes name,
- who is responsible for maintaining redirects if it moves.

An unanswered question in this section is itself a reason not to print tags.

## What the code already does (no action needed)

- `lib/env.ts` — `NEXT_PUBLIC_SITE_URL` must be https and non-placeholder in Vercel production/preview;
  fails closed.
- `lib/qr/production.ts#productionBaseUrlIssue` — rejects non-https, localhost/placeholder hosts, **and
  `*.vercel.app`** as unsafe for tags.
- `lib/qr/output-guard.ts` — durable-output routes (`qr.svg`, `qr-sheet.svg`, `export.csv`) refuse to emit
  on an unsafe base URL unless the caller explicitly acknowledges a TEST export with `?unsafe=1`.
- `lib/qr/url.ts` — scan URLs are always **computed** from `NEXT_PUBLIC_SITE_URL` + the stored
  `short_code`, never from the stored `public_url`. A domain change therefore does not require a data
  migration; existing short codes stay valid.
- `scripts/verify-tag-config.mjs` (`npm run verify:tag-config`) — the machine-checkable gate. Exits 1
  while the base URL is not tag-safe.

**Phase B3 note.** The gate is a **denylist** (non-https, localhost/placeholder, `*.vercel.app`), so
`https://mulemark.io` already classifies as tag-safe with no code change — and a future
`app.mulemark.io` would too. No domain is hard-coded anywhere; the URL is always built from
`NEXT_PUBLIC_SITE_URL`. The classification is locked in by tests
(`lib/qr/production.test.ts`, `lib/qr/url.test.ts`, `lib/qr/svg.test.ts`) rather than by a literal.

Gate output while the local shell still holds the old value:

```
  BLOCKED  NEXT_PUBLIC_SITE_URL (http://localhost:3000) must use https.
  Permanent tag production: NOT CLEARED.
  This is an expected DEFERRED OPERATOR GATE, not a code defect
```

The staging URL is also correctly refused — the important case, since it *passes* the deployment config
check:

```
  BLOCKED  NEXT_PUBLIC_SITE_URL (https://qr-asset-tags-...vercel.app)
           is a Vercel preview/deploy host (disposable — tags made from it would break).
```

## Until this list is complete

Permitted: development, preview deployments, demos, E2E testing, controlled internal QA, and a
software-only limited pilot on a temporary URL (with disclosure).

**Not permitted:** producing permanent physical tags, or any customer commitment that depends on a URL
being stable.

## What B3 does and does not close

**Closed (software):** the canonical host is decided and documented, the code needs no change to accept
it, path preservation and the preview/localhost blocks are locked in by tests, and canonical metadata is
environment-derived.

**Still open (operator):** items 3–14 above — DNS, Vercel domains, the production env value, redeploy,
live route verification, and a real-phone scan test.

**Separate gate entirely:** physical tag material, marking process, durability, contrast, and
scannability (`docs/TAG_PRODUCTION_READINESS.md`). **Nothing in B3 says a metal tag is ready to
manufacture.**
