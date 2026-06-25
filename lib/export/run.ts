import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAssetsCsv,
  buildQrMappingCsv,
  buildDocumentsCsv,
  buildSubmissionsExportCsv,
  type AssetExportRow,
  type QrMappingExportRow,
  type DocumentExportRow,
  type SubmissionExportRowLite,
} from "@/lib/export/builders";
import type { ExportTypeKey } from "@/lib/export/types";

/**
 * Run one export to a CSV string. Reads are RLS-scoped: a customer omits
 * `organizationId` and relies on RLS; the platform owner passes `organizationId`
 * to scope its (RLS-bypassing) read to one org. No service-role here — the owner
 * uses its normal platform-owner RLS. QR URLs are computed from `baseUrl`.
 */
export async function runExport(
  supabase: SupabaseClient,
  type: ExportTypeKey,
  opts: { organizationId?: string; baseUrl: string }
): Promise<{ filename: string; csv: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const orgId = opts.organizationId;

  if (type === "assets") {
    let q = supabase
      .from("assets")
      .select(
        "asset_code, asset_name, category, make, model, serial_number, year, public_status, archived_at, active_rental_session_id"
      );
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.order("asset_code", { ascending: true });
    return {
      filename: `assets-${date}.csv`,
      csv: buildAssetsCsv((data ?? []) as unknown as AssetExportRow[]),
    };
  }

  if (type === "qr_mapping") {
    let q = supabase
      .from("qr_links")
      .select("short_code, status, asset:assets(asset_code, asset_name)");
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.order("short_code", { ascending: true });
    return {
      filename: `qr-mapping-${date}.csv`,
      csv: buildQrMappingCsv(
        (data ?? []) as unknown as QrMappingExportRow[],
        opts.baseUrl
      ),
    };
  }

  if (type === "documents") {
    let q = supabase
      .from("documents")
      .select(
        "title, document_type, visibility, link_status, storage_path, url, asset:assets(asset_code)"
      );
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.order("title", { ascending: true });
    const rows = ((data ?? []) as unknown as {
      title: string;
      document_type: string;
      visibility: string;
      link_status: string | null;
      storage_path: string | null;
      url: string | null;
      asset: { asset_code: string } | null;
    }[]).map<DocumentExportRow>((d) => ({
      title: d.title,
      document_type: d.document_type,
      visibility: d.visibility,
      link_status: d.link_status,
      storage_path: d.storage_path,
      external_url: d.url,
      asset: d.asset,
    }));
    return { filename: `documents-${date}.csv`, csv: buildDocumentsCsv(rows) };
  }

  // submissions
  let q = supabase
    .from("form_submissions")
    .select(
      "created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, asset:assets(asset_code, asset_name)"
    );
  if (orgId) q = q.eq("organization_id", orgId);
  const { data } = await q.order("created_at", { ascending: false });
  return {
    filename: `submissions-${date}.csv`,
    csv: buildSubmissionsExportCsv(
      (data ?? []) as unknown as SubmissionExportRowLite[]
    ),
  };
}
