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

## Status

| Item | Status | Notes |
|---|---|---|
| 1. Purchase the domain | ⬜ not started | Name pending trademark clearance (working name "Mulemark") |
| 2. Decide the stable application hostname | ⬜ not started | e.g. `app.<domain>` vs apex; tags encode whatever you pick, forever |
| 3. Add the domain in Vercel + configure DNS | ⬜ not started | Vercel → Project → Settings → Domains |
| 4. HTTPS custom domain live (valid cert) | ⬜ not started | must be `https:` — the guard rejects `http:` |
| 5. Set `NEXT_PUBLIC_SITE_URL` to the final origin | ⬜ not started | Production scope; no trailing slash |
| 6. Document the path-preserving redirect obligation | ⬜ not started | see below — this is the one people forget |
| 7. `npm run verify:tag-config` passes | ⬜ **BLOCKED** | currently exits 1 by design |
| 8. Permanent QR test (printed sample scans on real phones) | ⬜ not started | `docs/REAL_DEVICE_QA.md` P1/P2 |
| 9. Physical-tag scan QA (material, contrast, angle, damage) | ⬜ not started | `docs/TAG_PRODUCTION_READINESS.md` |

## 6 — the redirect obligation, stated plainly

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

Current gate output:

```
  BLOCKED  NEXT_PUBLIC_SITE_URL (http://localhost:3000) must use https.
  Permanent tag production: NOT CLEARED.
  This is an expected DEFERRED OPERATOR GATE, not a code defect
```

The staging URL is also correctly refused:

```
  BLOCKED  NEXT_PUBLIC_SITE_URL (https://qr-asset-tags-...vercel.app)
           is a Vercel preview/deploy host (disposable — tags made from it would break).
```

## Until this list is complete

Permitted: development, preview deployments, demos, E2E testing, controlled internal QA, and a
software-only limited pilot on a temporary URL (with disclosure).

**Not permitted:** producing permanent physical tags, or any customer commitment that depends on a URL
being stable.
