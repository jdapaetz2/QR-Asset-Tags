# Onboarding QA — Mulemark

Pass/fail verification of the manual onboarding + account-management flow for pilot readiness
(Prompt E, Part C).

**Method:** this is a **code-path verification** — each step was traced through the actual server
actions, guards, and DB triggers/RLS, with `file:line` evidence. It is *not* a live click-through:
the manual, environment-dependent smoke run (create a real org, accept a real invite email, set a
password, etc.) is owned by the operator and lives in the **Manual smoke checklist** at the bottom.
Guard chain for all steps: `getProfile → requireProfile / requireRole / requireOrgId /
requireActiveOrg` in `lib/auth/session.ts`, with Postgres RLS + triggers as an independent backstop.

**Result: 14 / 14 steps PASS.** Two low-severity, non-blocking observations noted at the end. No
code changes were required.

## Flow verification

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | Create organization from UI | ✅ PASS | Page `app/(platform)/owner/organizations/new/page.tsx:11` `requireRole(PLATFORM_OWNER)`; action `lib/org/actions.ts:163-194` `createOrganization` (owner guard :167, insert :178, slug-collision `23505` :186, redirect :193). RLS `organizations_insert with check is_platform_owner()`. |
| 2 | Set plan / coverage fields | ✅ PASS | `app/(platform)/owner/organizations/[organizationId]/settings/page.tsx:26` owner-gated; action `lib/org/actions.ts:298-325` `updateOrgPlan` writes **cents** via `lib/plans/settings.ts:76-84`. DB backstop: `protect_commercial_fields()` (`0016_plan_fields.sql:28-63`, BEFORE UPDATE) coerces plan columns to OLD for non-owners. |
| 3 | Suspend & reactivate org | ✅ PASS | `lib/org/actions.ts:255-278` `setOrgStatus` (owner guard :261, validate `lib/org/status.ts`, redirect :277). Guard `app/(admin)/layout.tsx:11` `requireActiveOrg` → `lib/auth/session.ts:98-102` redirects to `/suspended`. DB backstop `current_org_id()` requires `status='active'` (`0019_org_suspension.sql:20-33`); customer cannot self-reactivate (`new.status := old.status`). |
| 4 | Invite user with copyable link | ✅ PASS | `lib/team/actions.ts:116-238` `inviteUser` (service-role admin client; app-level `requireProfile`, `invitableRoles` allow-list, org derived server-side, suspension check). `generateLink({type:"invite"})` :203, profile `status:'invited'` :216, returns `buildInviteUrl` :233. UI `components/invite-user-form.tsx:82` `<CopyableUrl>`. |
| 5 | Regenerate invite link | ✅ PASS | `lib/team/actions.ts:245-288` `regenerateInvite` (requires `status==='invited'`, `canManageMember`) → `regenLink` `generateLink({type:"magiclink"})`. UI `components/user-row-actions.tsx:66-72` + `CopyableUrl`. |
| 6 | Accept invite | ✅ PASS | `app/auth/action/page.tsx` (prefetch-safe GET; explicit Continue POST) → `lib/auth/actions.ts:83-114` `verifyAuthToken` (`verifyOtp` :95, route by status :113; bad token → `/login?error`). Magic-link variant `app/auth/confirm/route.ts`. |
| 7 | Set password | ✅ PASS | `lib/auth/actions.ts:121-148` `setPassword` (`requireProfile`, `validatePassword`, `updateUser({password})` :132) then activates profile `.update({status:'active'})` :142, redirect to role landing :147. |
| 8 | Invited user reaches correct dashboard | ✅ PASS | `lib/auth/policy.ts:15-17` `landingPathForRole` (owner → `/owner`, else `/dashboard`); status-keyed routing `lib/auth/invite-link.ts:43-45` forces set-password first for `invited`. |
| 9 | Disable user | ✅ PASS | `lib/team/actions.ts:294-355` `setUserStatus`; scope `canManageMember` (`lib/auth/invitations.ts:118-134` — admin manages only own-org `customer_staff`); self-disable blocked :319. Column `0017_profile_status.sql` (`check in ('active','invited','disabled')`). |
| 10 | Disabled user blocked | ✅ PASS | `lib/auth/session.ts:39-56` `getProfile` returns null when `!sessionAllowedForStatus(status)` (`invitations.ts:141-143`), so `requireProfile` → `/login`. DB backstop `0018_disabled_access.sql:13-39`: `current_org_id()`/`is_platform_owner()` add `status <> 'disabled'`. |
| 11 | Re-enable user | ✅ PASS | Same `setUserStatus` with `status:'active'`; UI `components/user-row-actions.tsx:39` toggles to "Enable". |
| 12 | Access restored | ✅ PASS | Same guard path in reverse: `sessionAllowedForStatus('active')===true` → `getProfile` returns profile; RLS scope resolves again. No separate path. |
| 13 | Last-admin protection | ✅ PASS | Pure check `lib/auth/invitations.ts:150-160` `isLastActiveAdminRemoval`; count `lib/team/actions.ts:53-67` `countOtherActiveAdmins`; enforced on disable (:331-346) and demote (`setUserRole` :388-403) with `LAST_ADMIN_MESSAGE`. |
| 14 | Customer admin cannot reach owner routes | ✅ PASS | Every one of the 16 routes under `app/(platform)/owner/**` calls `requireRole(PLATFORM_OWNER)` (non-owner redirected to own landing). See observation A below re: layout. |

## Pricing / plan sanity

| Check | Result | Evidence |
|-------|--------|----------|
| Cents stored, dollars entered/displayed | ✅ PASS | `lib/plans/money.ts:16-27` `parseCadInputToCents` (string math, no float drift; rejects negative/>2dp); `:33-39` `formatCentsAsCadInput` for inputs. |
| Owner settings shows dollars, labels CAD | ✅ PASS | `components/plan-settings-form.tsx:33-39,117-147` seeds inputs via `formatCentsAsCadInput`, "(CAD)" labels, helper text "stored internally in cents". |
| Plan language reads correctly | ✅ PASS | Presets `lib/plans/presets.ts:16-57` (cents); `formatCents` renders `C$` dollars; owner overview/detail use it. |
| Covered-asset wording clear | ✅ PASS | `lib/plans/usage.ts:37-43` `COVERED_ASSET_DEFINITION` + `SCANS_UNLIMITED_COPY`, rendered by `components/plan-usage.tsx`; customer view hides intro/renewal cents. |

## Observations (low severity — not pilot/demo-blocking, no fix this pass)

- **A. Owner-route guard is per-route, not layout-level.** `app/(platform)/layout.tsx:9` calls only
  `requireProfile()`, not a role gate; owner-only enforcement is per-page/route via `requireRole`.
  All 16 current owner routes are guarded (verified), so there is **no live hole** — but a *future*
  owner route that forgets its own `requireRole` would be reachable by any authenticated user.
  Recommend adding a `requirePlatformOwner()` at the `(platform)` layout as defense-in-depth in a
  later hardening pass.
- **B. `formatCents` rounds fractional dollars in read-only views.** `Math.round(cents/100)` means a
  non-whole value like `tag_credit_cents=75050` shows **C$751** in owner list/overview while the edit
  form shows **750.50**. All shipped presets are whole dollars, so it won't surface normally; worth a
  consistent formatter if custom fractional amounts are ever entered.

Neither observation blocks a pilot or a demo, so per the Prompt E scope (fix only pilot/demo-blocking
issues; schema changes require stop-and-explain) no code was changed. They are logged here for a
future hardening pass.

## Manual smoke checklist (operator-owned, live environment)

Run against a real Supabase project with auth email configured:

1. Create a new org from `/owner/organizations/new`.
2. Set plan/coverage at `/owner/organizations/[id]/settings`; confirm dollars in, cents stored.
3. Suspend the org, confirm a customer session bounces to `/suspended`; reactivate, confirm access.
4. Invite a user; copy the invite link; confirm it opens the accept flow.
5. Regenerate the invite link; confirm the old one no longer works and the new one does.
6. Accept the invite and set a password; confirm landing on the correct dashboard for the role.
7. Disable the user; confirm they are blocked; re-enable; confirm access restored.
8. Attempt to disable the last active admin; confirm it is blocked with the last-admin message.
9. As a customer admin, hit an `/owner/**` URL directly; confirm redirect to `/dashboard`.
