"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AcknowledgementForm } from "@/components/public/acknowledgement-form";
import { ackPromptStorageKey } from "@/lib/rentals/rentals";

const SHOW_DELAY_MS = 4000;

/**
 * Renter acknowledgement prompt (staff-aware, Phase 3C.6). Renders nothing unless the asset has an active rental
 * session AND the viewer is NOT authorized same-org staff (that check is done server-side; staff never see or
 * write anything here). After a short delay it shows a NON-BLOCKING, dismissible card.
 *
 * Persistence rules:
 *  - COMPLETING the acknowledgement writes the `ackPrompt:<asset>:<session>` localStorage key → suppressed for
 *    later scans in the SAME rental session on this device. A new session → new key → prompts again.
 *  - DISMISSING ("Dismiss for now" / ✕) closes it for THIS page view only — no localStorage key, no record — so
 *    it appears again on the next page load/scan. It does not reopen during the current mounted view.
 */
export function AckPrompt({
  shortCode,
  assetId,
  sessionId,
  brand,
  viewerIsAuthorizedStaff = false,
}: {
  shortCode: string;
  assetId: string;
  sessionId: string | null;
  brand: string;
  /** Authenticated same-org staff — never shown the renter prompt (server-derived boolean). */
  viewerIsAuthorizedStaff?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);

  const storageKey = sessionId ? ackPromptStorageKey(assetId, sessionId) : null;

  useEffect(() => {
    if (viewerIsAuthorizedStaff || !storageKey) return;
    let completed = false;
    try {
      completed = window.localStorage.getItem(storageKey) != null;
    } catch {
      // localStorage unavailable (private mode quirks) — just show once.
    }
    if (completed) return;
    const timer = setTimeout(() => {
      if (!dismissedRef.current) setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [storageKey, viewerIsAuthorizedStaff]);

  // Completing the acknowledgement persists suppression for this session/device.
  const completeAndHide = useCallback(() => {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // ignore storage failures
      }
    }
    setVisible(false);
  }, [storageKey]);

  // Dismissing is transient — no persistence, so the prompt returns on the next load/scan.
  const dismissForNow = useCallback(() => {
    dismissedRef.current = true;
    setVisible(false);
  }, []);

  if (viewerIsAuthorizedStaff || !sessionId || !visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:bottom-4">
      <div
        role="dialog"
        aria-label="Before you use this equipment"
        className="mx-auto max-w-md rounded-lg border border-l-4 bg-card p-4 shadow-lg"
        style={{ borderLeftColor: brand }}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Before you use this equipment</h2>
          <button
            type="button"
            onClick={dismissForNow}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <AcknowledgementForm
          shortCode={shortCode}
          brand={brand}
          onAcknowledged={completeAndHide}
        />

        <button
          type="button"
          onClick={dismissForNow}
          className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Dismiss for now
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          The acknowledgement will appear again the next time this tag is scanned.
        </p>
      </div>
    </div>
  );
}
