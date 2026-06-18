import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import {
  SUBMISSION_STATUSES,
  FORM_TYPE_LABELS,
  formTypeLabel,
} from "@/lib/submissions/display";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const FILTER_FORM_TYPES = [
  "damage_report",
  "support_request",
  "return_checklist",
] as const;

type SubmissionRow = {
  id: string;
  created_at: string;
  form_type: string;
  status: string;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  submitted_by_phone: string | null;
  asset: { asset_code: string; asset_name: string } | null;
};

type AssetOption = { id: string; asset_code: string; asset_name: string };

function firstString(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 16).replace("T", " ");
}

const selectClass =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireOrgId();
  const sp = await searchParams;
  const formType = firstString(sp.form_type);
  const status = firstString(sp.status);
  const assetId = firstString(sp.asset_id);

  const supabase = await createClient();

  // RLS-scoped: only this organization's assets and submissions are visible.
  const { data: assetData } = await supabase
    .from("assets")
    .select("id, asset_code, asset_name")
    .order("asset_code", { ascending: true });
  const assets = (assetData ?? []) as AssetOption[];

  let query = supabase
    .from("form_submissions")
    .select(
      "id, created_at, form_type, status, submitted_by_name, submitted_by_email, submitted_by_phone, asset:assets(asset_code, asset_name)"
    )
    .order("created_at", { ascending: false });

  if (formType) query = query.eq("form_type", formType);
  if (status) query = query.eq("status", status);
  if (assetId) query = query.eq("asset_id", assetId);

  const { data } = await query;
  const rows = (data ?? []) as unknown as SubmissionRow[];

  // Carry the active filters into the CSV export so it matches what's shown.
  const exportParams = new URLSearchParams();
  if (formType) exportParams.set("form_type", formType);
  if (status) exportParams.set("status", status);
  if (assetId) exportParams.set("asset_id", assetId);
  const exportQuery = exportParams.toString();
  const exportHref = `/dashboard/submissions/export${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} submission{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <a
          href={exportHref}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Export CSV
        </a>
      </section>

      {/* Simple GET-form filters */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select name="form_type" defaultValue={formType} className={selectClass}>
            <option value="">All</option>
            {FILTER_FORM_TYPES.map((t) => (
              <option key={t} value={t}>
                {FORM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select name="status" defaultValue={status} className={selectClass}>
            <option value="">All</option>
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Asset</span>
          <select name="asset_id" defaultValue={assetId} className={selectClass}>
            <option value="">All</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.asset_code}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Filter
        </button>
        <Link
          href="/dashboard/submissions"
          className="px-1 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Asset</th>
              <th className="px-4 py-2 font-medium">Submitter</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No submissions yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-2">{formTypeLabel(row.form_type)}</td>
                  <td className="px-4 py-2">{row.status}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.asset ? `${row.asset.asset_code}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.submitted_by_name ??
                      row.submitted_by_email ??
                      row.submitted_by_phone ??
                      "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/submissions/${row.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
