"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import { RelativeTime } from "@/components/relative-time";
import { normalizePollMs, shouldPoll } from "@/lib/ui/polling";

/**
 * Lightweight demo refresh control: a manual Refresh button + an "Updated <relative>"
 * stamp, with optional low-frequency polling. Polling (when `pollMs` is set) pauses
 * while the tab is hidden and is cleared on unmount — no tight loops, no Realtime.
 *
 * `renderedAt` is the server render time (ISO); `router.refresh()` re-runs the page's
 * existing RLS-scoped server reads, so a new render delivers fresh data + a new stamp.
 * The "Refreshing…" state uses a transition. The stamp is shown via RelativeTime
 * ("Updated just now", absolute LOCAL time on hover) — never raw UTC on a customer
 * screen (lib/ui/time.ts); RelativeTime is hydration-safe (suppressHydrationWarning).
 */
export function RefreshControls({
  renderedAt,
  pollMs,
}: {
  renderedAt: string;
  pollMs?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Clamp to the 30s floor (or disable) so a stray small value can never create a tight loop.
  const intervalMs = normalizePollMs(pollMs);

  useEffect(() => {
    if (!intervalMs) return;
    // A single interval per mount, guarded so visibility toggles never create a second one.
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (shouldPoll(document.hidden)) start();
      else stop();
    };
    if (shouldPoll(document.hidden)) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, router]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Updated <RelativeTime value={renderedAt} />
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={isPending}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
