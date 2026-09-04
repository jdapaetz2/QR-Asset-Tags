import "server-only";

import { cache } from "react";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { time } from "@/lib/diagnostics/server-timing";
import { recordScan, type ScanRequestMeta, type ScanTarget } from "@/lib/scan/record";

/**
 * Deferred, exactly-once scan logging (Phase C5).
 *
 * WHY: `/t/[shortCode]` is the renter's first surface, reached from a physical tag. C0 measured it at
 * 294 ms above the dynamic floor, of which §9b isolated **71-104 ms** as the awaited `scan_events`
 * insert — a third of the excess spent making a renter wait for an analytics write. `after()` runs the
 * insert once the response is finished, so it leaves the critical path without being removed.
 *
 * The scan write was ALREADY best-effort: `recordScan` swallows every failure so logging cannot break
 * rendering. This changes when it runs, not whether it may fail.
 */

/**
 * Request-scoped latch.
 *
 * React `cache()` is scoped to a single render pass, so this box is created fresh per request and can
 * never be shared between requests or users.
 *
 * THE TRAP THIS EXISTS TO AVOID: a module-level `let scheduled = false` would look identical, pass a
 * casual test, and then record **one scan for the entire lifetime of a server instance** — silent,
 * total data loss that would surface only as analytics that quietly stopped counting.
 */
const requestLatch = cache((): { scheduled: boolean } => ({ scheduled: false }));

/**
 * Claim the single scan slot for a request. Returns true exactly once per latch.
 *
 * Separated from the storage above so it can be tested directly: React's `cache` does not memoize
 * outside a render scope, so a test that leaned on `requestLatch()` would silently prove nothing.
 */
export function claimScan(latch: { scheduled: boolean }): boolean {
  if (latch.scheduled) return false;
  latch.scheduled = true;
  return true;
}

/**
 * Schedule the scan insert to run after the response, at most once per request.
 *
 * `meta` must have been read during render (see `readScanRequestMeta`) — the callback captures only
 * plain values and touches no request API, which is what the Next.js Server Component contract for
 * `after` requires.
 *
 * Returns whether this call did the scheduling, so "exactly once" is observable rather than assumed.
 */
export function scheduleScanOnce(
  client: SupabaseClient,
  target: ScanTarget,
  meta: ScanRequestMeta
): boolean {
  if (!claimScan(requestLatch())) return false;

  after(async () => {
    // Still measured, but now measuring work that no longer delays anyone.
    await time("scan", "scan.record", () => recordScan(client, target, meta));
  });

  return true;
}
