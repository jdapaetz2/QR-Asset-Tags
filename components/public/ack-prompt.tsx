"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AcknowledgementForm } from "@/components/public/acknowledgement-form";
import { ackPromptStorageKey } from "@/lib/rentals/rentals";

const SHOW_DELAY_MS = 4000;

/** How much of the viewport the open prompt covers, published on <html> for app/globals.css. */
const COVER_PROPERTY = "--ack-prompt-cover";

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
 *
 * Keyboard focus (WCAG 2.2 SC 2.4.11 Focus Not Obscured): the card stays non-modal and never takes focus, so Tab
 * still reaches the page behind it. While it is open it publishes how much of the viewport it covers (from the bottom
 * edge up to the card's top) as `--ack-prompt-cover` on <html>. app/globals.css turns that into scroll-padding, so a
 * focus move scrolls a page control clear of the card, and into room after the page, so the last controls can scroll
 * clear too. Only script can measure it: the card's height varies with the width, wrapping and validation messages.
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
  const overlayRef = useRef<HTMLDivElement>(null);

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

  // While open, publish the covered height before the first paint and keep it current; closing removes it.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!visible || !overlay) return;
    const root = document.documentElement;
    const publish = () => {
      const bottom = Number.parseFloat(getComputedStyle(overlay).bottom) || 0;
      root.style.setProperty(COVER_PROPERTY, `${Math.ceil(overlay.offsetHeight + bottom)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(overlay);
    return () => {
      observer.disconnect();
      root.style.removeProperty(COVER_PROPERTY);
    };
  }, [visible]);

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
    <div ref={overlayRef} data-ack-prompt="" className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:bottom-4">
      <div
        role="dialog"
        aria-label="Before you use this equipment"
        className="mx-auto max-w-md rounded-lg border border-l-4 bg-card p-4 shadow-lg"
        style={{ borderLeftColor: brand }}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Before you use this equipment</h2>
          {/* A 44px touch target; the negative margins keep the glyph where it was, in the card corner. */}
          <button
            type="button"
            onClick={dismissForNow}
            aria-label="Dismiss"
            className="-my-2.5 -mr-4 inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
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
          className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:underline"
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
