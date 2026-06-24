"use server";

import { createPublicClient } from "@/lib/supabase/public";
import { resolvePublicEquipment } from "@/lib/public/resolve";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import { readString } from "@/lib/forms/submit";
import {
  ACKNOWLEDGEMENT_STATEMENT,
  validateAcknowledgement,
} from "@/lib/acknowledgements/acknowledgements";

export type AcknowledgementState = { error?: string; ok?: boolean };

/**
 * Optional public acknowledgement intake. organization_id, asset_id and the
 * acknowledgement statement are derived server-side from the resolved QR/asset —
 * never from client input — and RLS re-checks the asset is public + org-matched on
 * insert. Anon client only (no service-role). No raw IP is stored.
 */
export async function submitAcknowledgement(
  shortCode: string,
  _prev: AcknowledgementState,
  formData: FormData
): Promise<AcknowledgementState> {
  // Honeypot: a filled hidden field means a bot. Silently report success.
  if (readString(formData, HONEYPOT_FIELD)) {
    return { ok: true };
  }

  const supabase = createPublicClient();

  // Same public eligibility as /t/[shortCode]; blocks private/draft/disabled/missing.
  const resolved = await resolvePublicEquipment(supabase, shortCode);
  if (!resolved) {
    return { error: "This page is no longer available." };
  }

  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const phone = readString(formData, "phone");
  const acknowledged = formData.get("acknowledged") != null;

  const fieldError = validateAcknowledgement({ name, acknowledged });
  if (fieldError) return { error: fieldError };

  const { error } = await supabase.from("asset_acknowledgements").insert({
    organization_id: resolved.organizationId,
    asset_id: resolved.assetId,
    name,
    email,
    phone,
    statement: ACKNOWLEDGEMENT_STATEMENT,
  });

  if (error) {
    return { error: "Could not record your acknowledgement. Please try again." };
  }

  return { ok: true };
}
