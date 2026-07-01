"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Lightweight demo refresh control: a manual Refresh button + an "Updated HH:MM:SS UTC"
 * stamp, with optional low-frequency polling. Polling (when `pollMs` is set) pauses
 * while the tab is hidden and is cleared on unmount — no tight loops, no Realtime.
 *
 * `renderedAt` is the server render time (ISO); `router.refresh()` re-runs the page's
 * existing RLS-scoped server reads, so a new render delivers fresh data + a new stamp.
 * The "Refreshing…" state uses a transition (no setState-in-effect, no hydration risk);
 * the stamp is derived as a deterministic UTC time so server and client agree.
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

  // Deterministic "HH:MM:SS" from the ISO string (UTC) — identical on server + client.
  const shown = renderedAt.slice(11, 19);

  useEffect(() => {
    if (!pollMs) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => router.refresh(), pollMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollMs, router]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Updated {shown} UTC</span>
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
