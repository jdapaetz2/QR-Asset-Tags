# Wave 5 Closeout — Platform Onboarding

Closeout review for Wave 5 (platform onboarding: no-SQL org creation, user invitations,
user-lifecycle/role hardening, and deferred-roadmap docs). This records what was verified, the
residual risks, the deferred items, and the merge-to-`main` verdict.

## Scope reviewed
- **5A** — owner-driven organization creation (no SQL).
- **5B / 5B.1 / 5B.2** — user invitations via app-generated copyable links (no SMTP), invite
  regeneration.
- **5C** — user lifecycle & role hardening (disable at app + RLS, last-admin protection).
- **5D** — deferred-roadmap docs.

## Quality gates (this review)
| Gate | Result |
|------|--------|
| `npm run lint` | ✓ clean |
| `npm run typecheck` | ✓ clean |
| `npm test` | ✓ 363 passed / 56 files |
| `npm run build` | ✓ compiled successfully |

## Acceptance criteria — verified in code
1. **New org without SQL** — `createOrganization` (`lib/org/actions.ts`), owner-gated via
   `requireRole(PLATFORM_OWNER)`, RLS server client (no service-role), validated by
   `normalizeNewOrg` (`lib/org/create.ts`); slug collisions handled (23505). Route:
   `owner/organizations/new`. Editable afterward via `updateOrgSettingsAsOwner` / `updateOrgPlan`
   / `updateOrgExportSettings`.
2. **Invite customer admin without SQL** — `inviteUser` (`lib/team/actions.ts`); role allow-list
   `invitableRoles` (owner → admin + staff), org bound server-side, profile written
   `status:'invited'`.
3. **New admin logs in and sees their org dashboard** — no-SMTP invite link → prefetch-safe
   `/auth/action` (verify on POST) → `/auth/set-password` → dashboard; status flips to `active`.
   (Live login is an operator smoke test — see checklist below.)
4. **Customer admin cannot access owner routes** — `requireRole(PLATFORM_OWNER)` on the
   `(platform)/owner/*` surfaces redirects non-owners to their landing.
5. **Role boundaries** — `platform_owner` is never invitable (`invitableRoles`); customer admin
   forced to own org (`resolveInviteOrgId`); `canManageMember` blocks cross-org and
   platform_owner targets; role changes are owner-only.
6. **Service-role not client-exposed** — `createAdminClient` only in `lib/team/actions.ts`
   (`"use server"`) and `lib/notifications/notify.ts` (`"server-only"`); `lib/supabase/admin.ts`
   is `import "server-only"`. No client component imports it.
7. **Disabled/removed users handled safely** — `getProfile` returns null for `disabled` (app
   gate); migration 0018 makes `current_org_id()` / `is_platform_owner()` status-aware (RLS
   backstop); last-active-admin cannot be disabled or demoted.
8. **Deferred roadmap docs exist** — `ROADMAP_DEFERRED.md`, `YARD_STAFF_SCANNER_MODE.md`,
   `STORAGE_MEDIA_LIFECYCLE.md`, `TAG_PRODUCTION_READINESS.md`, `QR_DOMAIN_STRATEGY.md`.
9. **Core app still works** — routes intact (`/t/[shortCode]`, `forms/[shortCode]/{damage,
   support,return}`, submissions inbox, assets + `assets/import`, tag requests, owner production);
   notifications dry-run guard in `lib/notifications/send.ts`; plan-limit + export-gating triggers
   (0015/0016) unchanged. Covered by the 363-test suite + build.
10. **Gates pass** — see table above.

## Guarding backstops (defense in depth)
- **RLS** resolves org/role via SECURITY DEFINER `current_org_id()` / `is_platform_owner()`
  (status-aware since 0018).
- **DB triggers**: `protect_commercial_fields` (0016, owner-only plan fields),
  `protect_export_flags` (0015, owner-only export flags), `enforce_qr_coverage_limit` (0016).
- **Export defaults**: all `*_enabled` export flags `default false`.

## Risks / residual items
- **Live auth flows are unexercised by CI** — vitest has no live DB, so invite creation,
  set-password, disable-at-RLS, and org insert are validated by code + pure-unit tests, not an
  integration run. Mitigated by the operator smoke checklist below.
- **Magic-link login** remains dependent on Supabase default email and is documented as limited;
  the invite + set-password path is the reliable route (see `SUPABASE_AUTH_CONFIG.md`).
- **First platform owner** is still bootstrapped manually (seed runbook) by design — no public
  signup.

## Deferred items (see `docs/ROADMAP_DEFERRED.md`)
Yard staff outbound/return scanner mode · storage/media lifecycle & quotas · MCore metal-tag
production testing · final brand/domain strategy · standalone sales/demo wave.

## Operator smoke checklist (run against a live Supabase project)
1. Create **Test Valley Rentals** at `/owner/organizations/new` → appears on `/owner`.
2. Invite the first **customer admin** from the org's Users page → copyable link returned.
3. Open the invite link → set password → land on the customer dashboard.
4. Invite **staff** (customer_staff) from the admin's team page.
5. As the customer admin, hit `/owner` → redirected away (not authorized).
6. Disable the test staff user → they are blocked at `/login` and lose RLS scope.
7. Public `/t/demo-ex017` still resolves and renders.
8. Submit a test **support** form → lands in the submissions inbox (notification dry-run logged
   unless Resend is configured).
9. Owner **production** workspace + QR/CSV export still work.

## Merge verdict
`main` is an ancestor of `wave-4-commercial-readiness` (0 commits on `main` are absent from the
branch), so the branch **fast-forwards cleanly onto `main`**. With all four gates green and the
acceptance criteria traced to code, **Wave 5 is ready to merge to `main`** once the operator
smoke checklist passes against the live environment.
