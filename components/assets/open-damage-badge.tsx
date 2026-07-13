import Link from "next/link";

import { openDamageHref } from "@/lib/submissions/damage";

/**
 * Concise, clickable open-damage indicator for the Assets list Status cell (Phase 3C). Danger treatment,
 * touch-friendly, links to the filtered unresolved-damage submissions for the asset. Rendered only when the
 * asset actually has open damage, so it self-clears once everything is resolved.
 */
export function OpenDamageBadge({ assetId, count }: { assetId: string; count: number }) {
  return (
    <Link
      href={openDamageHref(assetId)}
      className="inline-flex min-h-6 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive underline-offset-2 hover:underline"
      title={`${count} open damage item${count === 1 ? "" : "s"} — review`}
    >
      <span aria-hidden>⚠</span>
      {count > 1 ? `Damage · ${count}` : "Open damage"}
    </Link>
  );
}
