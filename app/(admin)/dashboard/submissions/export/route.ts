import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireCustomerAdminOrgId } from "@/lib/auth/session";
import { isExportTypeEnabled, toExportFlags } from "@/lib/export/types";
import {
  buildSubmissionsCsv,
  type SubmissionExportRow,
} from "@/lib/submissions/csv";
import { resolveStatusFilter } from "@/lib/submissions/inbox";
import { isSubmissionStatus } from "@/lib/submissions/display";

// Per-request, auth-scoped download — never cache.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Customer data export is owner-enabled and customer-admin-only (Phase A3.1). This inbox CSV is
  // a customer export like any other: staff are refused by the guard, and the org must have both
  // the master flag and the `submissions` type enabled. Denial returns 403 with no data.
  const organizationId = await requireCustomerAdminOrgId();

  const sp = request.nextUrl.searchParams;
  const formType = sp.get("form_type") ?? "";
  const statusRaw = sp.get("status") ?? "";
  const status = isSubmissionStatus(statusRaw)
    ? statusRaw
    : statusRaw === "unresolved"
      ? "unresolved"
      : statusRaw === "all_active"
        ? "all_active"
        : "";
  const assetId = sp.get("asset_id") ?? "";

  const supabase = await createClient();

  // Owner-controlled export gate: master flag AND the `submissions` type. Fails closed —
  // toExportFlags coerces a missing/blocked row to all-false.
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "customer_exports_enabled, export_assets_enabled, export_qr_mapping_enabled, export_documents_enabled, export_submissions_enabled"
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (!isExportTypeEnabled(toExportFlags(org), "submissions")) {
    return new Response("Export is not enabled for this organization.", {
      status: 403,
    });
  }

  // RLS-scoped: only the caller's organization's submissions are returned.
  let query = supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset:assets(asset_code, asset_name)"
    )
    .order("created_at", { ascending: false });

  // Mirror the inbox: no status → the Unresolved default (new + reviewed); "all_active"
  // exports new + reviewed + resolved; archived only when explicitly selected.
  const statusFilter = resolveStatusFilter(status);
  if (statusFilter.mode === "single") {
    query = query.eq("status", statusFilter.status);
  } else {
    query = query.in("status", statusFilter.statuses as readonly string[]);
  }
  if (formType) query = query.eq("form_type", formType);
  if (assetId) query = query.eq("asset_id", assetId);

  const { data } = await query;
  const csv = buildSubmissionsCsv((data ?? []) as unknown as SubmissionExportRow[]);

  const filename = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
