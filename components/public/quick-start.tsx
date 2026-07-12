"use client";

import { useEffect, useState } from "react";

import {
  quickStartStorageKey,
  shouldAutoExpandQuickStart,
} from "@/lib/rentals/rentals";

const EYEBROW_CLS =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/**
 * Quick Start — a collapsible section (same look as Safety / Fuel-power / etc.) that
 * auto-expands ONLY on the first scan of a new active rental session on this device,
 * tracked in localStorage (`mulemark:quick-start-seen:<assetId>:<sessionId>` — a distinct
 * namespace from the ack prompt's key). Otherwise it renders collapsed and stays manually
 * expandable. It is `interactive` only on a real public scan with an active session;
 * preview mode and no-session pages render collapsed and never touch localStorage.
 *
 * Hydration-safe: the initial (server + first client) state is collapsed; the auto-expand
 * happens in an effect after mount. Expanding never logs a scan or form event.
 */
export function QuickStart({
  body,
  assetId,
  sessionId,
  interactive,
}: {
  body: string;
  assetId?: string;
  sessionId?: string | null;
  interactive: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!interactive || !assetId || !sessionId) return;
    const key = quickStartStorageKey(assetId, sessionId);
    let alreadySeen: boolean;
    try {
      alreadySeen = window.localStorage.getItem(key) !== null;
    } catch {
      return; // localStorage unavailable (private mode, etc.) — leave collapsed.
    }
    if (!shouldAutoExpandQuickStart({ hasActiveSession: true, alreadySeen })) return;
    // Expand just after mount (off the effect's synchronous path) and mark this
    // asset+session seen so later scans in the same rental stay collapsed.
    const timer = setTimeout(() => {
      setOpen(true);
      try {
        window.localStorage.setItem(key, new Date().toISOString());
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [interactive, assetId, sessionId]);

  return (
    <details
      id="quick-start"
      className="group scroll-mt-4 rounded-lg border bg-card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className={EYEBROW_CLS}>Quick start</span>
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0 text-muted-foreground transition-none group-[[open]]:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <p className="whitespace-pre-line border-t px-4 py-3 text-lg leading-relaxed">
        {body}
      </p>
    </details>
  );
}
