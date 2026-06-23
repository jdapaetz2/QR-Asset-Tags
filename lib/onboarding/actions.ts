"use server";

import { randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { shortCodeFromBytes, SHORT_CODE_LENGTH } from "@/lib/qr/short-code";
import { buildPublicQrUrl } from "@/lib/qr/url";
import { parseImportRows } from "@/lib/onboarding/import";
import { EQUIPMENT_TEMPLATES } from "@/lib/onboarding/templates";

export type ImportSummary = {
  created: number;
  skipped: number;
  qrCreated: number;
  pagesCreated: number;
  rowErrors: { row: number; assetCode: string; message: string }[];
};

export type ImportState = { error?: string; summary?: ImportSummary };

const MAX_QR_ATTEMPTS = 5;

/**
 * Bulk-import assets for the signed-in organization from CSV text. The CSV is
 * RE-PARSED and RE-VALIDATED here (the client preview is convenience only).
 * organization_id always comes from the profile — the CSV's is ignored. Per-row
 * failures are collected; valid rows still import. No service-role.
 */
export async function importAssets(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }
  const organizationId = profile.organization_id;

  const csvText = formData.get("csv");
  if (typeof csvText !== "string" || csvText.trim() === "") {
    return { error: "Upload a CSV file first." };
  }

  const { rows } = parseImportRows(csvText);
  const validRows = rows.filter((r) => r.errors.length === 0 && r.asset && r.flags);
  if (validRows.length === 0) {
    return { error: "No valid rows to import. Fix the highlighted errors first." };
  }

  const supabase = await createClient();
  const summary: ImportSummary = {
    created: 0,
    skipped: 0,
    qrCreated: 0,
    pagesCreated: 0,
    rowErrors: [],
  };

  for (const row of validRows) {
    const asset = row.asset!;
    const flags = row.flags!;

    // Insert the asset. organization_id is from the profile, never the CSV.
    const { data: created, error: insertError } = await supabase
      .from("assets")
      .insert({
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category,
        make: asset.make,
        model: asset.model,
        serial_number: asset.serial_number,
        year: asset.year,
        support_phone_override: asset.support_phone_override,
        support_email_override: asset.support_email_override,
        cover_image_url: asset.cover_image_url,
        public_status: flags.publishAsset ? "public" : "private",
        organization_id: organizationId,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      summary.skipped += 1;
      summary.rowErrors.push({
        row: row.index,
        assetCode: row.assetCode,
        message:
          insertError?.code === "23505"
            ? "asset_code already exists in your organization."
            : "Could not create this asset.",
      });
      continue;
    }
    summary.created += 1;
    const assetId = created.id as string;

    // Optional equipment page from a template (draft unless explicitly published).
    if (flags.templateKey) {
      const tpl = EQUIPMENT_TEMPLATES[flags.templateKey];
      const { error: pageError } = await supabase.from("equipment_pages").upsert(
        {
          asset_id: assetId,
          organization_id: organizationId,
          headline: tpl.headline,
          quick_start_text: tpl.quick_start_text,
          safety_notes: tpl.safety_notes,
          fuel_power_notes: tpl.fuel_power_notes,
          return_notes: tpl.return_notes,
          troubleshooting_notes: tpl.troubleshooting_notes,
          emergency_notes: tpl.emergency_notes,
          is_published: flags.publishEquipmentPage,
        },
        { onConflict: "asset_id" }
      );
      if (!pageError) summary.pagesCreated += 1;
    }

    // Optional QR link (retry on the unlikely short_code collision).
    if (flags.createQrLink) {
      for (let attempt = 0; attempt < MAX_QR_ATTEMPTS; attempt++) {
        const shortCode = shortCodeFromBytes(randomBytes(SHORT_CODE_LENGTH));
        const { error: qrError } = await supabase.from("qr_links").insert({
          organization_id: organizationId,
          asset_id: assetId,
          short_code: shortCode,
          public_url: buildPublicQrUrl(publicEnv.siteUrl, shortCode),
          status: "active",
        });
        if (!qrError) {
          summary.qrCreated += 1;
          break;
        }
        if (qrError.code !== "23505") break;
      }
    }
  }

  return { summary };
}
