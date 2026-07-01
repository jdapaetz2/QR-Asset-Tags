/**
 * Pure helpers for the app-controlled (no-SMTP) invite/verify flow. The invite
 * server action generates a Supabase token with `generateLink` and builds an app
 * URL from it; the /auth/action route verifies the token only on an explicit click
 * (prefetch-safe). No I/O here.
 */

import { landingPathForRole } from "@/lib/auth/policy";
import { type Role } from "@/lib/auth/roles";

/** Auth-action types the /auth/action route accepts. */
export const AUTH_ACTION_TYPES = ["invite", "magiclink"] as const;
export type AuthActionType = (typeof AUTH_ACTION_TYPES)[number];

export function isAuthActionType(value: unknown): value is AuthActionType {
  return (
    typeof value === "string" &&
    (AUTH_ACTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * App invite/verify URL: `${siteUrl}/auth/action?token_hash=…&type=…`. Values are
 * URL-encoded. This points at our prefetch-safe route, never Supabase's default
 * verify endpoint, so it works without editing email templates or configuring SMTP.
 */
export function buildInviteUrl(
  siteUrl: string,
  tokenHash: string,
  type: AuthActionType
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const qs = new URLSearchParams({ token_hash: tokenHash, type });
  return `${base}/auth/action?${qs.toString()}`;
}

/**
 * Where a user goes after successfully verifying an auth-action token. Routed by
 * profile STATUS, not link type: an `invited` user (new invite OR a regenerated
 * link) must set a password first; anyone else lands on their role home. This lets a
 * regenerated link (Supabase token type `magiclink`) still lead to set-password.
 */
export function authActionDestination(status: string, role: Role): string {
  return status === "invited" ? "/auth/set-password" : landingPathForRole(role);
}
