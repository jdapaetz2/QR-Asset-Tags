"use client";

import { useRouter } from "next/navigation";

/**
 * Manual refresh for the analytics page — `router.refresh()` re-runs the (dynamic)
 * server render with the current range/sort. Styled as the brass text link from the
 * reference. Replaces the shared RefreshControls here so the analytics page carries
 * no raw-UTC timestamp (the band's "Updated" is relative).
 */
export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="text-[13px] font-medium text-brass-600 hover:underline"
    >
      Refresh
    </button>
  );
}
