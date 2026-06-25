"use client";

import { useCallback, useEffect, useState } from "react";

import { AcknowledgementForm } from "@/components/public/acknowledgement-form";
import { ackPromptStorageKey } from "@/lib/rentals/rentals";

const SHOW_DELAY_MS = 4000;

/**
 * Once-per-rental acknowledgement prompt. Renders nothing unless the asset has an
 * active rental session. After a short delay it shows a NON-BLOCKING, dismissible
 * card. Submitting or dismissing writes a localStorage key so it won't reappear for
 * this asset+session on this device; a new session uses a new key, so it can show
 * again. This only suppresses repeats per device — it does not identify anyone.
 */
export function AckPrompt({
  shortCode,
  assetId,
  sessionId,
  brand,
}: {
  shortCode: string;
  assetId: string;
  sessionId: string | null;
  brand: string;
}) {
  const [visible, setVisible] = useState(false);

  const storageKey = sessionId ? ackPromptStorageKey(assetId, sessionId) : null;

  useEffect(() => {
    if (!storageKey) return;
    let handled = false;
    try {
      handled = window.localStorage.getItem(storageKey) != null;
    } catch {
      // localStorage unavailable (private mode quirks) — just show once.
    }
    if (handled) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const persistAndHide = useCallback(() => {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // ignore storage failures
      }
    }
    setVisible(false);
  }, [storageKey]);

  if (!sessionId || !visible) return null;

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
            onClick={persistAndHide}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <AcknowledgementForm
          shortCode={shortCode}
          brand={brand}
          onAcknowledged={persistAndHide}
        />

        <button
          type="button"
          onClick={persistAndHide}
          className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          I&apos;m staff — dismiss for this rental on this device
        </button>
      </div>
    </div>
  );
}
