import type { TagRequestAsset } from "@/lib/tags/request-detail";

/** Read-only table of a tag request's assets with per-asset readiness. */
export function TagRequestAssets({ assets }: { assets: TagRequestAsset[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Code</th>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Readiness</th>
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
                <td className="whitespace-nowrap px-4 py-2 font-medium">
                  {a.asset_code}
                  {a.archived ? (
                    <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-500">
                      Archived
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">{a.asset_name}</td>
                <td className="px-4 py-2">
                  {a.readiness.ready ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      Ready
                    </span>
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
