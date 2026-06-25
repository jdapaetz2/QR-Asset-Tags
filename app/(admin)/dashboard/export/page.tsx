import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { toExportFlags, enabledExportTypes } from "@/lib/export/types";

// Per-request, auth-scoped; never cache.
export const dynamic = "force-dynamic";

export default async function ExportPage() {
  await requireOrgId();
  const supabase = await createClient();

  // RLS-scoped: the caller only ever reads their own organization.
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "customer_exports_enabled, export_assets_enabled, export_qr_mapping_enabled, export_documents_enabled, export_submissions_enabled"
    )
    .maybeSingle();
  const flags = toExportFlags(org);
  const types = enabledExportTypes(flags);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Export organization data
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download your organization&apos;s records as CSV.
        </p>
      </section>

      {!flags.customer_exports_enabled ? (
        <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Exports are not enabled for this organization. Contact AssetTag QR if you need
          a data export.
        </section>
      ) : types.length === 0 ? (
        <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No export types are currently enabled for your organization. Contact AssetTag
          QR to enable the exports you need.
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Download CSV</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {types.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3">
                <span>{t.label}</span>
                <a
                  href={`/dashboard/export/download?type=${t.key}`}
                  className="rounded-md border px-3 py-1.5 underline-offset-4 hover:bg-accent hover:text-accent-foreground"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            CSVs contain only your organization&apos;s data. Private media files are not
            included.
          </p>
        </section>
      )}
    </div>
  );
}
