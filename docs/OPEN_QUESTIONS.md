# Open Questions — Mulemark

Decisions that aren't fully settled by `docs/PROJECT_CONTEXT.md` / `CLAUDE.md`. Each has a recommended default so the build can proceed; revisit before or during the relevant sprint. Items marked **(assumption)** are how the docs currently proceed unless overridden.

## Product scope

1. **Pre-use inspection form** — context says "can be added after damage/support/return unless simple." *Default:* defer to post-MVP; include only if it's trivial once the other three forms exist.
2. **Multiple QR links per asset** — schema supports it, but is the admin UI for managing more than one tag per asset in MVP? *Default (assumption):* one active QR link per asset in the UI; data model allows more, UI for multiples is later.
   > *Superseded (Phase E0, 2026-10-14):* migration 0023 added rotation, `is_production_primary` and `supersedes_qr_link_id`. For example, Northridge COMPACTOR-003 has a disabled and an active link. Printed codes are now immutable; see `docs/phase-e/PROTECTED_DEMO_ROUTES.md`.
3. **Customer staff role** — how do `customer_staff` permissions differ from `customer_admin` in MVP? *Default (assumption):* staff mirrors admin for now; differentiate later if a pilot needs it.
   > *Superseded (Phase E0, 2026-10-14):* staff are now limited. Settings, users, templates, import, tag requests and exports are admin only (`lib/auth/admin-routes.test.ts`). Staff can still switch QR links on and off. See the role matrix in `docs/phase-e/PHASE_E_PLAN.md` §5.

## Onboarding & accounts

4. **First-admin credential delivery** — how does a manually created customer admin receive login access (invite email, magic link, owner-set password)? *Default:* Supabase invite/magic-link email.
   > *Superseded (Phase E0, 2026-10-14):* invites are server-generated **links**, and no email is sent (`lib/team/actions.ts:152`, `:238-241`). The inviter delivers the link; branded auth email or SMTP is deferred (`docs/ROADMAP_DEFERRED.md` #11).
5. **Asset import** — should the platform owner have a bulk CSV import for assets during onboarding, or manual entry only in MVP? *Default (assumption):* manual entry in MVP; bulk import is a fast-follow if pilots have large fleets.
   > *Superseded (Phase E0, 2026-10-14):* a 15-column CSV import exists but is **customer-admin only** (`lib/onboarding/actions.ts:50`). Owner-led batch import for a named org is the Phase E extension (E4B; `docs/phase-e/DECISIONS.md` §2).

## Public page & forms

6. **Submission acknowledgements** — should submitters get an email/SMS confirmation, and should the admin get a notification on new submissions? *Default:* on-screen confirmation only in MVP; email notification to admin is a likely fast-follow (needs an email provider decision).
7. **Required vs optional fields** — confirm which form fields are strictly required (e.g. is email required on a damage report, or phone-or-email?). *Default:* name required; at least one of phone/email required; description required.
8. **Languages** — is the public page English-only for MVP? *Default (assumption):* English-only.

## Media & storage

9. **Allowed file types and size caps** — exact accepted types and max size per upload/submission? *Default (assumption):* images (jpg/png/heic/webp) and short video (mp4/mov), with a per-file cap (e.g. ~25 MB image / ~100 MB video) — confirm against Supabase storage limits and cost.
10. **Media retention** — how long is submission media kept, and who can delete it? *Default:* retained indefinitely in MVP; admins can archive submissions. Define a retention policy before scale.

## Analytics & privacy

11. **IP hashing approach** — exact hashing/truncation scheme for `scan_events.ip_hash` (salted hash vs last-octet truncation)? *Default:* salted one-way hash, no raw IP stored.
12. **Scan deduplication** — should repeated scans from the same device within a short window count once? *Default:* store all events; dedup in reporting later.

## Branding & domains

13. **Public URL domain** — what production domain hosts `/t/{short_code}` (and will pilots get vanity domains)? *Default (assumption):* a single platform domain for MVP; per-customer domains are out of scope.
14. **Short-code format** — length and character set for `short_code` (the demo uses `demo-ex017`). *Resolved (Sprint 3B):* auto-generated codes are 8 lowercase URL-safe characters from an ambiguity-free alphabet (no `0/1/l/o/i`), collision-checked on insert (`lib/qr/short-code.ts`); human-readable codes like the demo set are still allowed.

## Commercial

15. **Manual billing tracking** — are `plan_name` / `monthly_fee` / `asset_limit` just informational in MVP, or is `asset_limit` enforced? *Default (assumption):* informational only in MVP; no hard enforcement until Stripe.
   > *Superseded (Phase E0, 2026-10-14):* `asset_limit` is enforced as covered-asset coverage. Migration 0016's `qr_links_enforce_coverage` refuses a customer's first QR link past the limit (the owner bypasses it). The CSV import then skips QR creation **without a row error** (`lib/onboarding/actions.ts:205-222`); see `docs/phase-e/ONBOARDING_DATA_CONTRACT.md` §2.

## Link management

16. **Link-check trigger** — MVP is manual "mark as checked." Confirm there's no scheduled checking in MVP. *Default (assumption):* manual only; scheduled checks are post-MVP (data model is ready).
   > *Phase E0 note (2026-10-14):* still manual. Phase E adds only **bounded onboarding source validation** (header and format checks of the sources named in a batch manifest), not scheduled monitoring or crawling. See #19.

## Security / abuse

17. **Public-form rate limiting** — public submission/upload endpoints have a honeypot but no rate limit (a shared store is needed, so it is not a small change). *Default:* defer to a post-pilot fast-follow (edge/middleware rate limit keyed on IP-hash + asset). Tracked in `docs/MVP_PILOT_READINESS.md` (Sprint 7A audit).
18. ~~**Permissive anon insert on the `submissions` storage bucket**~~ — **Resolved (migration 0037, 2026-09-11).** The `submissions public insert` policy is dropped; public photos upload through server-issued, path-bound signed upload URLs minted after the honeypot, rate limiter and tag resolution, and are verified server-side before insert. Tracked in `docs/MVP_PILOT_READINESS.md`.

## Phase E scope (showcase and concierge onboarding)

19. **Four limited non-goal extensions** — Phase E needs, within strict limits:
    - supervised, source-traceable demo quick guides and pictograms (never autonomous safety authoring);
    - owner-led batch onboarding (never self-signup);
    - an authenticated operational content-approval record (never an e-signature or contract);
    - bounded onboarding source validation (never a crawler or scheduled monitor).

    *Proposed, pending the E0 grouped approval:* adopt all four as specified in `docs/phase-e/DECISIONS.md` §2, with every ban in `docs/NON_GOALS.md` preserved.

---

## Pilot discovery / demand validation (per prospect)

These are **not build decisions** — they are questions to answer *with a prospect* before and
during a pilot conversation. The core loop only pays off if a real person on the customer's side
receives, resolves, and maintains it. Capture the answers per prospect (the demo script points
here); a "no" to several of these is a signal to reshape the pitch, not to build more.

1. **Who receives and resolves submissions?** Is there a named person/role (dispatch, shop
   foreman, branch manager) who will see a damage/support report and act on it — or would it land
   in an unread inbox?
2. **Who checks returns?** Who inspects equipment on return today, and would a return checklist
   submission fit their existing routine?
3. **Would yard staff scan on outbound/return?** Is there appetite for staff to scan a tag when
   equipment leaves and comes back — the trigger for the deferred yard-scanner mode
   (`ROADMAP_DEFERRED.md`)? If not, the renter-facing loop stands on its own.
4. **Will renters actually submit forms?** Do their customers skew contractor/repeat (likely to
   scan and report) or one-off consumer (less likely)? What share of issues are reported today vs
   discovered on return?
5. **Who maintains the asset pages?** Will counter/office staff keep equipment content and manual
   links current, or does that need to be a one-time setup we do for them?
6. **Check delivery-radius / coverage before pitching the offline story.** Confirm the prospect's
   yards and delivery radius have reliable mobile coverage **before** leaning on any "works
   anywhere" or offline narrative. Offline is deferred (`ROADMAP_DEFERRED.md` #1); today the public
   page requires connectivity, so a poor-coverage prospect is a reason to talk printed
   scan-at-pickup guidance, not to over-promise.
