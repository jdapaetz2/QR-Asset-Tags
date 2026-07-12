"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { shortCodeFromBytes, SHORT_CODE_LENGTH } from "@/lib/qr/short-code";
import { validateCustomShortCode } from "@/lib/qr/custom-code";

export type OwnerQrActionState = { error?: string };

const QR_STATUSES = ["active", "disabled"] as const;
const MAX_ATTEMPTS = 5;

function ownerQrPath(organizationId: string): string {
  return `/owner/organizations/${organizationId}/qr`;
}

/**
 * Create a QR link for an asset as the platform owner — an alias or a rotated/replacement code.
 * Powers both "Create custom code" (owner-supplied `short_code`) and "Create replacement" (also
 * passes `supersedes_id`). A blank code auto-generates. The new link is `active`; the existing
 * code(s) stay valid. It is NEVER auto-selected for production (only an asset's first-ever link is,
 * via the DB auto-assign trigger) — the owner promotes explicitly with `ownerSelectQrForProduction`.
 *
 * Owner-gated (`requireRole` + RLS `is_platform_owner()`); `assetId` is a bound trusted route arg,
 * never form input. `short_code` is never mutated on any deployed row — rotation only ever INSERTs.
 */
export async function ownerCreateQrLink(
  assetId: string,
  _prev: OwnerQrActionState,
  formData: FormData
): Promise<OwnerQrActionState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  const rawCode = ((formData.get("short_code") as string | null) ?? "").trim();
  const supersedesRaw = ((formData.get("supersedes_id") as string | null) ?? "").trim();
  const supersedesId = supersedesRaw.length > 0 ? supersedesRaw : null;

  const supabase = await createClient();

  // Owner RLS sees every org; derive organization_id from the asset (never from form input).
  const { data: asset } = await supabase
    .from("assets")
    .select("id, organization_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset?.organization_id) return { error: "Asset not found." };
  const organizationId = asset.organization_id as string;

  const insertLink = (code: string) =>
    supabase.from("qr_links").insert({
      organization_id: organizationId,
      asset_id: assetId,
      short_code: code,
      public_url: buildPublicQrUrl(publicEnv.siteUrl, code),
      status: "active",
      supersedes_qr_link_id: supersedesId,
    });

  // Custom code: validate + single insert (uniqueness is the DB's job — 23505 → friendly message).
  if (rawCode.length > 0) {
    const validated = validateCustomShortCode(rawCode);
    if ("error" in validated) return { error: validated.error };

    const { error } = await insertLink(validated.code);
    if (error?.code === "23505") {
      return { error: "That short code is already in use. Choose another." };
    }
    if (error) return { error: "Could not create the QR link. Please try again." };
    redirect(ownerQrPath(organizationId));
  }

  // Auto-generated code: retry on the unlikely short_code collision.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = shortCodeFromBytes(randomBytes(SHORT_CODE_LENGTH));
    const { error } = await insertLink(code);
    if (!error) redirect(ownerQrPath(organizationId));
    if (error.code !== "23505") {
      return { error: "Could not create the QR link. Please try again." };
    }
  }
  return { error: "Could not generate a unique QR code. Please try again." };
}

/**
 * Select an active QR link as the asset's production primary — the code the next tag batch encodes.
 * The `set_qr_production_primary` RPC (migration 0023) does this atomically and re-checks
 * platform-owner identity + that the link is active. Existing tags/codes are untouched.
 */
export async function ownerSelectQrForProduction(
  qrLinkId: string,
  _prev: OwnerQrActionState,
  _formData: FormData
): Promise<OwnerQrActionState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  const supabase = await createClient();

  const { data: link } = await supabase
    .from("qr_links")
    .select("organization_id")
    .eq("id", qrLinkId)
    .maybeSingle();
  if (!link?.organization_id) return { error: "QR link not found." };

  const { data, error } = await supabase.rpc("set_qr_production_primary", {
    p_qr_link_id: qrLinkId,
  });
  if (error) return { error: "Could not update the production selection." };

  switch (String(data ?? "")) {
    case "ok":
      redirect(ownerQrPath(link.organization_id as string));
      break;
    case "not_active":
      return { error: "Enable this code before selecting it for production." };
    case "not_found":
      return { error: "QR link not found." };
    default:
      return { error: "Not authorized." };
  }
  return {};
}

/**
 * Enable or disable a QR link as the platform owner. Disabling makes every physical tag using that
 * code resolve to the unavailable page — so it is refused for the current production-primary link
 * (the owner must select another code for production first), preventing a dangling production
 * target. Reversible; `scan_events` history is never touched (rows stay attached to the link).
 */
export async function ownerSetQrLinkStatus(
  qrLinkId: string,
  status: string,
  _prev: OwnerQrActionState,
  _formData: FormData
): Promise<OwnerQrActionState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  if (!(QR_STATUSES as readonly string[]).includes(status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();

  const { data: link } = await supabase
    .from("qr_links")
    .select("organization_id, is_production_primary")
    .eq("id", qrLinkId)
    .maybeSingle();
  if (!link?.organization_id) return { error: "QR link not found." };

  if (status === "disabled" && link.is_production_primary) {
    return {
      error:
        "This code is selected for production. Select another code for production before disabling it.",
    };
  }

  const { error } = await supabase
    .from("qr_links")
    .update({ status })
    .eq("id", qrLinkId);
  if (error) return { error: "Could not update the QR link." };

  redirect(ownerQrPath(link.organization_id as string));
}
