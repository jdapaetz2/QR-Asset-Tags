/**
 * Engineering Phase D2 — the public confirmation page's call-now support. Pure, client-safe, no I/O.
 *
 * The call-now flag travels in the confirmation URL (`?ref=…&call=1`). It is DISPLAY-ONLY: it decides whether the page
 * shows a prominent "call the rental company now" block, using the same public support phone the equipment page
 * already shows. It unlocks no data and changes no state, so a hand-edited URL reveals nothing new.
 */
import { telHref } from "@/lib/contact/links";
import type { SupportContact } from "@/lib/public/equipment";

export const CALL_NOW_PARAM = "call";

export type CallNowContact = {
  /** The number as the rental company entered it — shown to the renter. */
  label: string;
  /** A conservatively normalized `tel:` URI. */
  href: string;
};

/** A usable call target for the support phone, or null when there is no phone or it cannot be dialled safely. */
export function callNowContact(support: SupportContact): CallNowContact | null {
  const label = support.phone?.trim() ?? "";
  const href = telHref(label);
  return href && label ? { label, href } : null;
}

/** Whether the confirmation URL asks for the call-now block. Anything but exactly "1" is false. */
export function readCallNowFlag(value: string | string[] | undefined): boolean {
  return value === "1";
}

/** The confirmation path the submit action redirects to. */
export function confirmationUrl(thanksPath: string, reference: string, callNow: boolean): string {
  return `${thanksPath}?ref=${reference}${callNow ? `&${CALL_NOW_PARAM}=1` : ""}`;
}
