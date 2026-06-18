import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import {
  buildSubmissionsCsv,
  type SubmissionExportRow,
} from "@/lib/submissions/csv";

// Per-request, auth-scoped download — never cache.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Redirects logged-out users (also enforced by the proxy) and null-org users.
  await requireOrgId();

  const sp = request.nextUrl.searchParams;
  const formType = sp.get("form_type") ?? "";
  const status = sp.get("status") ?? "";
  const assetId = sp.get("asset_id") ?? "";

  const supabase = await createClient();

  // RLS-scoped: only the caller's organization's submissions are returned.
  let query = supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, submission_data_json, media_urls, asset:assets(asset_code, asset_name)"
    )
    .order("created_at", { ascending: false });

  if (formType) query = query.eq("form_type", formType);
  if (status) query = query.eq("status", status);
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
