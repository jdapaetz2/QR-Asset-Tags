import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ROLES, type Role, isRole } from "@/lib/auth/roles";
import { isAuthorized, landingPathForRole } from "@/lib/auth/policy";
import { sessionAllowedForStatus } from "@/lib/auth/invitations";
import { isOrgActive } from "@/lib/org/status";
import { time } from "@/lib/diagnostics/server-timing";

/** Where suspended-org customer users are sent. See migration 0019 + Wave 5E.1. */
export const SUSPENDED_PATH = "/suspended";

export { isAuthorized, landingPathForRole };

/**
 * Server-side identity helpers. The caller's profile is fetched through the
 * RLS-scoped server client (`lib/supabase/server.ts`), so tenant isolation is
 * enforced by Postgres, not by these functions. See docs/SECURITY_MODEL.md.
 */

export type Profile = {
  id: string;
  auth_user_id: string;
  organization_id: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  status: string;
};

const PROFILE_COLUMNS =
  "id, auth_user_id, organization_id, name, email, role, status";

/**
 * The signed-in user's profile, or `null` if not signed in / no profile row / the
 * profile is **disabled**. Returning null for a disabled profile is the real access
 * revocation: every gate (`requireProfile`/`requireRole`/`requireOrgId`) funnels
 * through here, so a disabled user is redirected to /login. See migration 0017.
 *
 * REQUEST-SCOPED (Phase C1). Wrapped in React `cache()`, so the layout guard and the page guard in one
 * render resolve it ONCE instead of twice. C0 measured that duplication on Production at 57 ms
 * (`auth.getUser`) + 51 ms (`profiles`) per extra call.
 *
 * The cache lives for a single render pass and nothing longer: it is not `unstable_cache`, not
 * `"use cache"`, and holds no module-level state, so **one user's profile can never be served to
 * another request or another user**. It also cannot span the Proxy, which is a separate invocation —
 * that `getUser` remains, by construction.
 *
 * Only this read is cached, never a guard. `requireProfile`/`requireRole`/`requireOrgContext` call
 * `redirect()`, which throws; React `cache` replays a cached rejection within the same request, and a
 * replayed redirect is not something to design around when leaving the guards uncached costs nothing.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  // Phase C0 instrumentation. Inert unless MULEMARK_DIAGNOSTIC_TIMING=1; returns the same values and
  // rethrows the same errors, so no gate below changes.
  const {
    data: { user },
  } = await time("auth", "auth.session", () => supabase.auth.getUser());
  if (!user) return null;

  const { data } = await time("auth", "auth.profile", async () =>
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("auth_user_id", user.id)
      .maybeSingle()
  );

  if (!data || !isRole(data.role) || !sessionAllowedForStatus(data.status)) {
    return null;
  }
  return data as Profile;
});

/** Require a signed-in user with a profile, else redirect to /login. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Require one of `allowed` roles, else send the user to their own landing. */
export async function requireRole(...allowed: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAuthorized(profile.role, allowed)) {
    redirect(landingPathForRole(profile.role));
  }
  return profile;
}

/**
 * Whether the caller's own organization is active. Platform owners are never gated by a
 * customer org's status. For a customer, reads `organizations.status` through the
 * RLS-scoped client: an active org is readable (its id resolves through `current_org_id()`),
 * a suspended org is not (the row returns null under migration 0019) — either way this
 * returns the correct boolean. Used to gate customer routes/handlers behind /suspended.
 */
export async function ownOrgActive(profile: Profile): Promise<boolean> {
  if (profile.role === ROLES.PLATFORM_OWNER) return true;
  if (!profile.organization_id) return false;
  return orgIsActive(profile.organization_id);
}

/**
 * The org-status read itself, request-scoped (Phase C1). C0 measured this at 38 ms and running TWICE
 * per authenticated render — once in the `(admin)` layout's `requireActiveOrg`, once in the page's
 * `requireOrgContext`.
 *
 * Keyed on the organization id STRING, deliberately. React `cache` compares arguments by identity, so
 * caching `ownOrgActive(profile)` directly would only dedupe while the profile object happened to be
 * reference-identical — true today because `getProfile` is cached, but a silent coupling that would
 * break the moment a caller constructed its own profile object. A primitive key is correct regardless
 * of how the caller got there.
 *
 * The key is also what keeps tenants apart: two organizations are two different keys, so a cached
 * `true` for one org can never answer for another. And the cache is per-render, so it cannot outlive
 * the request that created it.
 *
 * Still RLS-scoped: a suspended org is unreadable through `current_org_id()` (migration 0019), so the
 * row comes back null and this returns false — the same result as before, reached the same way.
 */
const orgIsActive = cache(async (organizationId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await time("auth", "auth.org_status", async () =>
    supabase
      .from("organizations")
      .select("status")
      .eq("id", organizationId)
      .maybeSingle()
  );
  return isOrgActive(data?.status);
});

/**
 * Require a customer whose organization is active, else redirect to /suspended. This is
 * the chokepoint for customer route handlers (which bypass the (admin) layout guard).
 * Platform owners pass through untouched.
 */
export async function requireActiveOrg(): Promise<Profile> {
  const profile = await requireProfile();
  if (!(await ownOrgActive(profile))) redirect(SUSPENDED_PATH);
  return profile;
}

/**
 * Require an org-scoped user and return their organization id. Also enforces that the
 * organization is active — a suspended-org customer is redirected to /suspended rather
 * than continuing to load org data (RLS would return nothing anyway; this is the clean UX).
 */
export async function requireOrgId(): Promise<string> {
  const profile = await requireProfile();
  if (!profile.organization_id) redirect(landingPathForRole(profile.role));
  if (!(await ownOrgActive(profile))) redirect(SUSPENDED_PATH);
  return profile.organization_id;
}

/**
 * Like {@link requireOrgId} but ALSO returns the profile, so a page can branch on the
 * caller's role (e.g. hide admin-only config controls from `customer_staff`) without a
 * second `getProfile()` round-trip. Any active-org customer (admin OR staff) passes.
 */
export async function requireOrgContext(): Promise<{ orgId: string; profile: Profile }> {
  const profile = await requireProfile();
  if (!profile.organization_id) redirect(landingPathForRole(profile.role));
  if (!(await ownOrgActive(profile))) redirect(SUSPENDED_PATH);
  return { orgId: profile.organization_id, profile };
}

/**
 * Require an ACTIVE-org **customer_admin** and return their organization id — the single
 * server guard for admin-only configuration surfaces (Settings, Users, Export, Tag
 * requests, Templates, Import, asset config sub-routes). Enforcement, not just nav hiding:
 * `customer_staff` is sent to their landing (`/dashboard`), a platform owner to `/owner`,
 * and a suspended-org customer to `/suspended`. Cross-org isolation stays with RLS.
 */
export async function requireCustomerAdminOrgId(): Promise<string> {
  const { orgId } = await requireCustomerAdmin();
  return orgId;
}

/**
 * Like {@link requireCustomerAdminOrgId} but ALSO returns the profile, for admin-only server
 * actions that need the actor (e.g. `created_by_profile_id`). Same enforcement: an active-org
 * `customer_admin` only — `customer_staff` is sent to `/dashboard`, a platform owner to `/owner`,
 * a suspended-org customer to `/suspended`.
 *
 * Server actions are independently invocable POST endpoints, so every admin-only action must call
 * this itself — an admin-only *page* does not protect the action it renders (Phase A3.1).
 */
export async function requireCustomerAdmin(): Promise<{
  orgId: string;
  profile: Profile;
}> {
  const { orgId, profile } = await requireOrgContext();
  if (profile.role !== ROLES.CUSTOMER_ADMIN) redirect(landingPathForRole(profile.role));
  return { orgId, profile };
}
