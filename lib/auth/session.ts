import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { type Role, isRole } from "@/lib/auth/roles";
import { isAuthorized, landingPathForRole } from "@/lib/auth/policy";

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
};

const PROFILE_COLUMNS = "id, auth_user_id, organization_id, name, email, role";

/** The signed-in user's profile, or `null` if not signed in / no profile row. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data || !isRole(data.role)) return null;
  return data as Profile;
}

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

/** Require an org-scoped user and return their organization id. */
export async function requireOrgId(): Promise<string> {
  const profile = await requireProfile();
  if (!profile.organization_id) redirect(landingPathForRole(profile.role));
  return profile.organization_id;
}
