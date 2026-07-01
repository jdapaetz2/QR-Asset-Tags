"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import {
  shortCodeFromBytes,
  SHORT_CODE_LENGTH,
} from "@/lib/qr/short-code";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { getCoveredCount } from "@/lib/plans/coverage-query";
import { isOverCoverage } from "@/lib/plans/coverage";

export type QrActionState = { error?: string };

const OVER_LIMIT_MESSAGE =
  "Covered asset limit reached. Contact AssetTag QR to add more covered assets.";

const QR_STATUSES = ["active", "disabled"] as const;
const MAX_ATTEMPTS = 5;

/**
 * Create a QR link for an asset the caller owns. organization_id and asset_id
 * are derived from the profile + route — never from form input. RLS
 * (`qr_links_rw`) is the boundary. Retries on the unlikely short_code collision.
 */
export async function createQrLink(
  assetId: string,
  _prev: QrActionState,
  _formData: FormData
): Promise<QrActionState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const supabase = await createClient();

  // Confirm the asset is visible to the caller (RLS) before linking — blocks
  // cross-org asset ids.
  const { data: asset } = await supabase
    .from("assets")
    .select("id, archived_at")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return { error: "Asset not found." };

  // Covered-asset limit: creating the FIRST QR link for a non-archived asset consumes
  // one covered slot. Assets that already have a link (or are archived) don't. Null
  // asset_limit = unlimited. The DB trigger (0016) is the hard backstop; this gives a
  // friendly message. Status toggles on an existing link are never affected.
  const { data: existingLink } = await supabase
    .from("qr_links")
    .select("id")
    .eq("asset_id", assetId)
    .limit(1)
    .maybeSingle();
  if (!existingLink && !asset.archived_at) {
    const { data: org } = await supabase
      .from("organizations")
      .select("asset_limit")
      .eq("id", profile.organization_id)
      .maybeSingle();
    const limit = (org?.asset_limit as number | null) ?? null;
    if (limit !== null) {
      const covered = await getCoveredCount(supabase);
      if (isOverCoverage(covered, limit)) {
        return { error: OVER_LIMIT_MESSAGE };
      }
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shortCode = shortCodeFromBytes(randomBytes(SHORT_CODE_LENGTH));
    const { error } = await supabase.from("qr_links").insert({
      organization_id: profile.organization_id,
      asset_id: assetId,
      short_code: shortCode,
      public_url: buildPublicQrUrl(publicEnv.siteUrl, shortCode),
      status: "active",
    });

    if (!error) redirect(`/dashboard/assets/${assetId}`);
    if (error.code !== "23505") {
      return { error: "Could not create the QR link. Please try again." };
    }
    // 23505 = unique violation on short_code → try a new code.
  }

  return { error: "Could not generate a unique QR code. Please try again." };
}

/** Activate or deactivate a QR link the caller owns (RLS-scoped). */
export async function setQrLinkStatus(
  qrLinkId: string,
  status: string,
  _prev: QrActionState,
  _formData: FormData
): Promise<QrActionState> {
  if (!(QR_STATUSES as readonly string[]).includes(status)) {
    return { error: "Invalid status." };
  }
  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_links")
    .update({ status })
    .eq("id", qrLinkId)
    .select("asset_id")
    .maybeSingle();

  if (error) return { error: "Could not update the QR link." };
  if (!data) return { error: "QR link not found." };

  redirect(`/dashboard/assets/${data.asset_id}`);
}
