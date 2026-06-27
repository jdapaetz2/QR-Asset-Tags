"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { HONEYPOT_FIELD } from "@/lib/forms/validate";
import {
  submitAcknowledgement,
  type AcknowledgementState,
} from "@/lib/acknowledgements/actions";
import {
  ACKNOWLEDGEMENT_STATEMENT,
  ACKNOWLEDGEMENT_DISCLAIMER,
} from "@/lib/acknowledgements/acknowledgements";

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring";

/**
 * Optional public acknowledgement, shown on the scan page. On success it shows an
 * inline confirmation (no redirect). This is a lightweight record, not a signature.
 */
export function AcknowledgementForm({
  shortCode,
  brand,
  onAcknowledged,
}: {
  shortCode: string;
  brand: string;
  /** Called once after a successful submit (e.g. to persist the prompt-dismiss key). */
  onAcknowledged?: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    AcknowledgementState,
    FormData
  >(submitAcknowledgement.bind(null, shortCode), {});

  useEffect(() => {
    if (state.ok) onAcknowledged?.();
  }, [state.ok, onAcknowledged]);

  return (
    <section
      className="rounded-lg border border-l-4 bg-card p-4"
      style={{ borderLeftColor: brand }}
    >
      <h2 className="mb-2 text-sm font-semibold">Acknowledgement</h2>

      {state.ok ? (
        <p className="text-sm text-muted-foreground" role="status">
          Thanks — your acknowledgement has been recorded.
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Your name *</span>
            <input className={fieldClass} name="name" autoComplete="name" required />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Email (optional)</span>
              <input
                className={fieldClass}
                type="email"
                name="email"
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Phone (optional)</span>
              <input
                className={fieldClass}
                type="tel"
                name="phone"
                autoComplete="tel"
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="acknowledged"
              required
              className="mt-0.5 size-4"
            />
            <span>{ACKNOWLEDGEMENT_STATEMENT}</span>
          </label>

          <p className="text-xs text-muted-foreground">
            {ACKNOWLEDGEMENT_DISCLAIMER}
          </p>

          {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
          <div aria-hidden className="hidden">
            <label>
              Company website
              <input
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Recording…" : "Acknowledge"}
          </Button>
        </form>
      )}
    </section>
  );
}
