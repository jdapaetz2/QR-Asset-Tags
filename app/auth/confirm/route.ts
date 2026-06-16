import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { landingPathForRole } from "@/lib/auth/session";
import { isRole } from "@/lib/auth/roles";

/**
 * Magic-link / email-OTP confirmation endpoint. The Supabase email template
 * must point here, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 * See supabase/seed_profiles.example.sql for the first-account runbook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error && data.user) {
      let dest = next;
      if (!dest) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();
        dest =
          profile && isRole(profile.role)
            ? landingPathForRole(profile.role)
            : "/dashboard";
      }
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("Invalid or expired link")}`,
      request.url
    )
  );
}
