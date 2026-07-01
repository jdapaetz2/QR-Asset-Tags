# Wave 4 Closeout — Commercial Readiness

Closeout record for the `wave-4-commercial-readiness` branch. Pair with
[COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md), [QR_DOMAIN_STRATEGY.md](QR_DOMAIN_STRATEGY.md),
and [MVP_PILOT_READINESS.md](MVP_PILOT_READINESS.md).

## Wave 4 goals — status

| # | Goal | Status |
| --- | --- | --- |
| 1 | Plan tiers & covered-asset limits | ✅ Shipped (4A) |
| 2 | Ops-grade submissions inbox | ✅ Shipped (4B / 4B.1) |
| 3 | Analytics insights & attention dashboard | ✅ Shipped (4C) |
| 4 | Design / state-language hardening | ✅ Shipped (4D) |
| 5 | Domain & metal-tag production readiness | ✅ Docs + owner-production guardrails in place |
| 6 | Commercial readiness for pilot conversations | ✅ Ready (this closeout) |

## Acceptance checks

1. **Commercial model in metadata** — ✅ `organizations` plan columns (migration 0016);
   internal presets in `lib/plans/presets.ts`; model in `COMMERCIAL_MODEL.md`.
2. **Covered-asset limits enforced where appropriate** — ✅ `createQrLink` +
   `createTagRequest` app checks with the hard `enforce_qr_coverage_limit` DB trigger.
3. **No scan limit** — ✅ Enforcement fires only on `qr_links` insert; `scan_events` intake
   is never gated. Scans are unlimited by design.
4. **No paused-coverage loophole** — ✅ No pause/seasonal concept exists in code or docs;
   disabling a tag does **not** reduce the covered count (count is status-agnostic).
5. **Submissions inbox materially stronger** — ✅ Quick-filter chips, search, thumbnails,
   urgency, reference, quick status; archived hidden by default.
6. **Analytics offers operational insight** — ✅ Needs-attention, top-problem assets, and
   category insight with drill-throughs.
7. **Domain/tag readiness docs exist** — ✅ `QR_DOMAIN_STRATEGY.md`, `COMMERCIAL_MODEL.md`,
   `MVP_PILOT_READINESS.md`; owner production warns on non-production base URLs.
8. **Public QR/forms still work** — ✅ Public scanner + damage/support/return intake
   unchanged; anon insert-only.
9. **Owner production still works** — ✅ Org picker, readiness table, QR/CSV/sheet exports
   intact; QR generation logic untouched.
10. **Customer admin cannot access owner-only tools** — ✅ Every `/owner*` route calls
    `requireRole(PLATFORM_OWNER)`; plan fields DB-guarded (`protect_commercial_fields`).
11. **No public/private leakage** — ✅ Submissions/private media never public; signed URLs
    admin-gated + short-lived; no raw IP/user-agent surfaced anywhere.
12. **lint / typecheck / tests / build pass** — ✅ Green at this closeout (see the review
    output in the branch history).

## Manual smoke checklist (operator — live env)

Run against a deployed environment with Supabase migrations applied:

- [ ] `/dashboard` shows the covered-assets figure and unlimited-scans copy.
- [ ] `/owner` shows each org's plan + covered/limit + tag credit.
- [ ] Creating QR coverage at/over the limit is blocked with the friendly message.
- [ ] A tag request that would exceed the limit is blocked.
- [ ] `/dashboard/submissions` inbox + one detail render; media opens via the authorized
      detail page only.
- [ ] `/dashboard/analytics` insights render and drill-throughs land on filtered views.
- [ ] `/owner/production` exports QR SVG + sheet; non-production base URL shows the warning.
- [ ] `/t/demo-ex017` renders on mobile and a support form submits.
- [ ] A logged-in customer admin is blocked from `/owner/production`.

## Deferred roadmap

Tracked in the [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) "Deferred" section — not built in
Wave 4:

- **Yard Staff Outbound/Return Scanner Mode** (authenticated worker scan flow).
- **Storage limits, quotas, retention, and media lifecycle** — `storage_limit_mb` /
  `video_uploads_enabled` are metadata only, not enforced yet.
- **MCore-specific metal-tag production testing** after physical delivery.
- **Final brand / domain decision** before printing durable tags (see
  `QR_DOMAIN_STRATEGY.md`).
- **Standalone sales/demo flow** as a future wave.

### Minor non-blocking tidy (not a merge blocker)

The owner-*internal* production table (`/owner/production`) still renders raw lowercase
`status` / `public_status` / page-status text. Wave 4D standardized **customer-facing**
labels via `lib/ui/status-labels.ts`; routing the owner-internal production view through the
same helpers is a small future cleanup, intentionally left out of the closeout to avoid scope
creep. No functional or trust impact on customer or public surfaces.

## Verdict

**Wave 4 is ready to merge `wave-4-commercial-readiness` → `main`.** The commercial model is
represented in software, covered-asset limits are enforced without a scan limit or paused
loophole, the ops and analytics surfaces are materially stronger, production/domain readiness
is documented and guarded, and no core workflow, tenant-isolation, or public/private boundary
regressed. It is suitable for early paid/pilot conversations, with billing, storage
enforcement, and the yard-scanner flow explicitly deferred.
