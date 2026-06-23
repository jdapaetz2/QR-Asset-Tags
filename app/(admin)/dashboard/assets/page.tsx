import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

type AssetRow = {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  public_status: string;
  created_at: string;
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export default async function AssetsPage() {
  // Redirects logged-out users (proxy + requireProfile) and null-org users
  // (e.g. platform owner) away from this org-scoped page.
  await requireOrgId();

  // RLS-scoped: returns only the caller's organization's assets.
  const supabase = await createClient();
  const { data } = await supabase
    .from("assets")
    .select(
      "id, asset_code, asset_name, category, make, model, public_status, created_at"
    )
    .order("asset_code", { ascending: true });

  const assets = (data ?? []) as AssetRow[];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/assets/import">Import CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/assets/new">New asset</Link>
          </Button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Make</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No assets yet. Create your first one.
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{asset.asset_code}</td>
                  <td className="px-4 py-2">{asset.asset_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{asset.category ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{asset.make ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{asset.model ?? "—"}</td>
                  <td className="px-4 py-2">{asset.public_status}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(asset.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/assets/${asset.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      View / edit
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
