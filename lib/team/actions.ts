"use server";

import { redirect } from "next/navigation";

import { requireProfile, requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import {
  invitableRoles,
  resolveInviteOrgId,
  validateInvite,
  duplicateInviteOutcome,
  canManageMember,
} from "@/lib/auth/invitations";
import { buildInviteUrl } from "@/lib/auth/invite-link";

export type InviteCreated = { url: string; email: string; role: string };
export type TeamActionState = { error?: string; invite?: InviteCreated };

/** Only allow same-app redirect targets (leading slash, no protocol/host). */
function safeRedirect(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && /^\/[^/]/.test(value) ? value : fallback;
}

/** Escape ILIKE wildcards so an email lookup is a literal case-insensitive match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Invite a user to an organization. Requires the service-role admin client (creating
 * an `auth.users` row is impossible under RLS); every boundary is enforced in app
 * code first: `requireProfile` gate, role allow-list by inviter, org derived
 * server-side (customer admins are locked to their own org), and a duplicate check.
 * `routeOrgId` is bound by the owner route; customer admins pass null.
 */
export async function inviteUser(
  routeOrgId: string | null,
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const inviter = await requireProfile();
  const allowed = invitableRoles(inviter.role);
  if (allowed.length === 0) {
    return { error: "You are not allowed to invite users." };
  }

  const orgRes = resolveInviteOrgId({
    inviterRole: inviter.role,
    inviterOrgId: inviter.organization_id,
    routeOrgId,
  });
  if (!orgRes.organizationId) return { error: orgRes.error };
  const organizationId = orgRes.organizationId;

  const validation = validateInvite(
    {
      email: (formData.get("email") as string) ?? undefined,
      name: (formData.get("name") as string) ?? undefined,
      role: (formData.get("role") as string) ?? undefined,
    },
    allowed
  );
  if (!validation.value) return { error: validation.error };
  const { email, name, role } = validation.value;

  const admin = createAdminClient();

  // Duplicate check (admin read bypasses RLS so cross-org collisions are caught).
  const { data: existing } = await admin
    .from("profiles")
    .select("organization_id")
    .ilike("email", escapeLike(email))
    .maybeSingle();
  const outcome = duplicateInviteOutcome(
    existing ? (existing.organization_id as string | null) : undefined,
    organizationId
  );
  if (outcome === "same_org") {
    return { error: "That email is already on this organization's team." };
  }
  if (outcome === "other_org") {
    return {
      error:
        "That email already belongs to another organization. Contact AssetTag QR.",
    };
  }

  // Generate the invite token WITHOUT relying on Supabase to send an email
  // (no custom SMTP / template editing needed). `generateLink` creates the auth
  // user and returns a hashed token we turn into our own prefetch-safe link.
  const { data: generated, error: genError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { name } },
    });
  const hashedToken = generated?.properties?.hashed_token;
  if (genError || !generated?.user || !hashedToken) {
    return {
      error: "Could not create the invite. The email may already have an account.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    auth_user_id: generated.user.id,
    organization_id: organizationId,
    name,
    email,
    role,
    status: "invited",
  });
  if (profileError) {
    return {
      error: "Invite created, but the profile could not be saved. Contact support.",
    };
  }

  // Return the copyable link to the inviter (shown once; never logged).
  return {
    invite: {
      url: buildInviteUrl(publicEnv.siteUrl, hashedToken, "invite"),
      email,
      role,
    },
  };
}

/**
 * Enable/disable a user. Owner may manage anyone but a platform owner; a customer
 * admin may manage only staff in their own org. You cannot disable yourself.
 */
export async function setUserStatus(
  profileId: string,
  status: "active" | "disabled",
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  if (status !== "active" && status !== "disabled") {
    return { error: "Invalid status." };
  }
  const actor = await requireProfile();
  const fallback =
    actor.role === ROLES.PLATFORM_OWNER ? "/owner/users" : "/dashboard/settings/users";
  const redirectTo = safeRedirect(formData.get("redirect_to"), fallback);

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, organization_id, role, auth_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return { error: "User not found." };

  if (target.auth_user_id === actor.auth_user_id) {
    return { error: "You cannot disable your own account." };
  }
  const allowed = canManageMember({
    actorRole: actor.role,
    actorOrgId: actor.organization_id,
    targetRole: target.role as string,
    targetOrgId: target.organization_id as string | null,
  });
  if (!allowed) return { error: "You are not allowed to manage this user." };

  const { error } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", profileId);
  if (error) return { error: "Could not update the user." };

  redirect(redirectTo);
}

/**
 * Change a user's role between customer_admin and customer_staff. Platform-owner only,
 * and never sets/targets `platform_owner`.
 */
export async function setUserRole(
  profileId: string,
  role: "customer_admin" | "customer_staff",
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  if (role !== ROLES.CUSTOMER_ADMIN && role !== ROLES.CUSTOMER_STAFF) {
    return { error: "Invalid role." };
  }
  const actor = await requireRole(ROLES.PLATFORM_OWNER);
  const redirectTo = safeRedirect(formData.get("redirect_to"), "/owner/users");

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, organization_id, role, auth_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return { error: "User not found." };
  if (target.role === ROLES.PLATFORM_OWNER) {
    return { error: "You cannot change a platform admin's role." };
  }
  if (target.auth_user_id === actor.auth_user_id) {
    return { error: "You cannot change your own role." };
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", profileId);
  if (error) return { error: "Could not update the role." };

  redirect(redirectTo);
}
