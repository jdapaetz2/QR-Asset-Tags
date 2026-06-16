"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { landingPathForRole } from "@/lib/auth/session";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { isRole } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";

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

/** Sign out and return to the login page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
