import { unstable_rethrow } from "next/navigation";

import { SEND_FAILED_MESSAGE } from "@/lib/forms/upload-contract";

/**
 * Keep a form on screen when its server action cannot even be delivered.
 *
 * When a server action request fails outside the action — Vercel's 413 for an oversized body, a network drop, a
 * 5xx before the action runs — Next throws on the client, React rethrows it from `useActionState`, and with no
 * error boundary the whole form is replaced by the built-in "This page couldn't load". The renter loses every answer
 * and photo. Wrapping the action returns a form error instead, so the form stays mounted with its inputs intact.
 *
 * `unstable_rethrow` passes Next's own control-flow errors through untouched: a successful submit ends in
 * `redirect()` (and a staff guard may `notFound()`), which must still navigate.
 */
export function withActionErrorRecovery<S extends { error?: string }>(
  action: (state: S, formData: FormData) => Promise<S>,
  message: string = SEND_FAILED_MESSAGE
): (state: S, formData: FormData) => Promise<S> {
  return async function recoveringAction(state: S, formData: FormData): Promise<S> {
    try {
      return await action(state, formData);
    } catch (err) {
      unstable_rethrow(err);
      return { ...state, error: message };
    }
  };
}
