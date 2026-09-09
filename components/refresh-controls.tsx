"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { RelativeTime } from "@/components/relative-time";
import { normalizePollMs } from "@/lib/ui/polling";
import { newSince, parseToken, type FreshnessToken } from "@/lib/ui/freshness";
import { createFreshnessPoller } from "@/lib/ui/freshness-poller";

/**
 * Manual Refresh + an "Updated <relative>" stamp, with optional low-frequency freshness polling.
 *
 * PHASE C7 CHANGED WHAT THE TIMER DOES, NOT WHETHER THERE IS ONE.
 *
 * It used to call `router.refresh()` on every tick — re-running the whole page's server reads and
 * re-priming every row link — to find out whether anything had changed. Measured on staging: 3 refreshes
 * in 90 idle seconds pulled **63 link prefetches** with them, for a queue that had not moved.
 *
 * Now a tick reads a two-number token (`freshnessUrl`) and compares it. **Unchanged → nothing happens at
 * all**: no refresh, no re-render, no further request. Changed → a quiet "N new — Load" appears next to
 * Refresh, and rows reload only when the admin asks.
 *
 * WHY IT NOTIFIES RATHER THAN RELOADING. An inbox that reshuffles under the cursor while someone is
 * reading it — or mid multi-select — is worse than one that is a minute stale. Because nothing reloads
 * without a click, a poll **cannot** land in the middle of a bulk selection; that hazard is removed by
 * construction rather than by trying to detect a pending mutation and skip that tick.
 *
 * Preserved from before: the manual button, the hidden-tab pause (zero polls while hidden), a single
 * timer across visibility toggles, and cleanup on unmount.
 */
export function RefreshControls({
  renderedAt,
  pollMs,
  freshnessUrl,
  initialToken,
}: {
  renderedAt: string;
  pollMs?: number;
  /** Endpoint returning `{ newCount, latest }`. Without it the component is button-and-stamp only. */
  freshnessUrl?: string;
  /** The token as of this server render — the baseline every poll is compared against. */
  initialToken?: FreshnessToken;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingToken, setPendingToken] = useState<FreshnessToken | null>(null);

  // Clamp to the floor (or disable) so a stray small value can never create a tight loop.
  const intervalMs = normalizePollMs(pollMs);

  // Primitives, not the object: the page builds `initialToken` inline, so its identity changes on every
  // render and depending on it directly would restart the timer for no reason.
  const baseNewCount = initialToken?.newCount ?? 0;
  const baseLatest = initialToken?.latest ?? null;

  /**
   * A new server render — manual Refresh, or Load — makes the freshly rendered page the new baseline, so
   * any pending notice is now satisfied and must clear.
   *
   * Adjusted DURING render rather than in an effect. React documents this as the way to reset state when
   * a prop changes; doing it in an effect would render the stale notice once before removing it, which is
   * exactly the flicker this control exists to avoid.
   */
  const [lastRenderedAt, setLastRenderedAt] = useState(renderedAt);
  if (renderedAt !== lastRenderedAt) {
    setLastRenderedAt(renderedAt);
    setPendingToken(null);
  }

  // The baseline the polling callback compares against. A ref so updating it never restarts the timer;
  // read only inside callbacks, never during render.
  const baseline = useRef<FreshnessToken>({ newCount: baseNewCount, latest: baseLatest });
  useEffect(() => {
    baseline.current = { newCount: baseNewCount, latest: baseLatest };
  }, [baseNewCount, baseLatest]);

  useEffect(() => {
    if (!intervalMs || !freshnessUrl) return;

    // The loop itself lives in lib/ui/freshness-poller.ts with its dependencies injected, so the hidden
    // pause, the single-timer guard, the unchanged-token no-op, backoff and teardown are covered by real
    // behavioural tests rather than by asserting on this file's source. This adapter supplies the browser
    // pieces and nothing more.
    const poller = createFreshnessPoller({
      fetchToken: async () => {
        const res = await fetch(freshnessUrl, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        return parseToken(await res.json());
      },
      getBaseline: () => baseline.current,
      onChanged: (token) => setPendingToken(token),
      isHidden: () => document.hidden,
      intervalMs,
      setTimer: (fn, ms) => setInterval(fn, ms),
      clearTimer: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    });

    const onVisibility = () => poller.syncVisibility();
    poller.start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      poller.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, freshnessUrl]);

  const refresh = useCallback(() => {
    setPendingToken(null);
    startTransition(() => router.refresh());
  }, [router]);

  // Derived from props, not from the ref — a ref must not be read during render.
  const added = newSince({ newCount: baseNewCount, latest: baseLatest }, pendingToken);

  return (
    <div className="flex items-center gap-2">
      {pendingToken ? (
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="rounded-md border border-warning/40 bg-amber-chip-bg px-3 py-1.5 text-sm font-medium text-amber-chip-text hover:bg-amber-chip-bg/80 disabled:opacity-60"
        >
          {added > 0 ? `${added} new — Load` : "Updates available — Load"}
        </button>
      ) : null}
      <span className="text-xs text-muted-foreground">
        Updated <RelativeTime value={renderedAt} />
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
