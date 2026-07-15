import { AssetCodeChip } from "@/components/ui/asset-code-chip";
import { Badge } from "@/components/ui/badge";
import type { TagRequestAsset } from "@/lib/tags/request-detail";

/** Read-only table of a tag request's assets with per-asset readiness. */
export function TagRequestAssets({ assets }: { assets: TagRequestAsset[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-[0.06em] text-iron-600">
          <tr>
            <th className="px-4 py-2.5 font-medium">Code</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {assets.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                No assets on this request.
              </td>
            </tr>
          ) : (
            assets.map((a) => (
              <tr key={a.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <AssetCodeChip code={a.asset_code} />
                    {a.archived ? <Badge tone="warning">Archived</Badge> : null}
                  </span>
                </td>
                <td className="px-4 py-2.5">{a.asset_name}</td>
                <td className="px-4 py-2.5">
                  {a.readiness.ready ? (
                    <Badge tone="success">Ready</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {a.readiness.issues.join(", ")}
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
