"use server";

import { redirect } from "next/navigation";

import { type EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { landingPathForRole, requireProfile } from "@/lib/auth/session";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { isRole, type Role } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { authActionDestination, isAuthActionType } from "@/lib/auth/invite-link";
import { validatePassword } from "@/lib/auth/password";

/** Resolve where to send the user after a successful sign-in. */
async function destinationFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string,
  next: string | null
): Promise<string> {
  if (next) return next;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data && isRole(data.role) ? landingPathForRole(data.role) : "/dashboard";
}

/** Email + password sign-in. */
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(formData.get("next"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(
      `/login?mode=password&error=${encodeURIComponent(
        error?.message ?? "Sign-in failed"
      )}`
    );
  }

  redirect(await destinationFor(supabase, data.user.id, next));
}

/** Passwordless magic-link sign-in: emails a one-time sign-in link. */
export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const next = sanitizeNextPath(formData.get("next"));

  const supabase = await createClient();
  const emailRedirectTo = `${publicEnv.siteUrl}/auth/confirm${
    next ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    redirect(
      `/login?mode=magic&error=${encodeURIComponent(error.message)}`
    );
  }

  redirect("/login?mode=magic&sent=1");
}

/**
 * Verify an app-generated auth-action token (invite / magic link). Called only from
 * the explicit "Continue" POST on /auth/action, so the single-use token is never
 * consumed by email-security prefetch (which issues GET). Uses the RLS client (no
 * service-role); sets the session, then routes invited users to set a password.
 */
export async function verifyAuthToken(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const type: EmailOtpType = isAuthActionType(typeRaw)
    ? (typeRaw as EmailOtpType)
    : "invite";

  if (!tokenHash) {
    redirect(`/login?error=${encodeURIComponent("Invalid or expired link")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent("Invalid or expired link")}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  const role: Role = profile && isRole(profile.role) ? profile.role : "customer_staff";

  redirect(authActionDestination(typeRaw, role));
}

/**
 * Set the signed-in user's password and activate their profile. Uses the RLS client,
 * so `updateUser` only ever touches the caller's own auth user and the profile update
 * is scoped to their own row. Disabled users never reach here (getProfile denies them).
 */
export async function setPassword(formData: FormData) {
  const profile = await requireProfile();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const result = validatePassword(password, confirm);
  if (result.error) {
    redirect(`/auth/set-password?error=${encodeURIComponent(result.error)}`);
  }

  const supabase = await createClient();
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) {
    redirect(
      `/auth/set-password?error=${encodeURIComponent(
        "Could not set the password. Please try again."
      )}`
    );
  }

  // Activate the caller's own profile (RLS: profiles_update allows self).
  await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("auth_user_id", profile.auth_user_id);

  redirect(landingPathForRole(profile.role));
}

/** Sign out and return to the login page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
