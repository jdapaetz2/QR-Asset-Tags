import Link from "next/link";

import { requireOrgId } from "@/lib/auth/session";
import { AssetImport } from "@/components/asset-import";
import { TEMPLATE_KEYS, TEMPLATE_VERIFY_NOTE } from "@/lib/onboarding/templates";

export default async function ImportAssetsPage() {
  await requireOrgId();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <Link
          href="/dashboard/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Assets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import assets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk-create assets from a CSV. Imported assets start private and any
          equipment pages start as drafts until you publish them.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="font-medium">1. Start from the template</h2>
        <p className="mt-1 text-muted-foreground">
          Download the CSV template, fill one row per asset (<code>asset_code</code>{" "}
          and <code>asset_name</code> are required), then upload it below.
        </p>
        <a
          href="/dashboard/assets/import/template.csv"
          className="mt-3 inline-flex rounded-md border px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
        >
          Download CSV template
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          Template keys for equipment pages: {TEMPLATE_KEYS.join(", ")}.
        </p>
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
          {TEMPLATE_VERIFY_NOTE}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">2. Upload &amp; preview</h2>
        <AssetImport />
      </section>
    </div>
  );
}
