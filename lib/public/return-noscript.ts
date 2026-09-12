import { mailtoHref, telHref } from "@/lib/contact/links";
import { readableTextOn, safeBrandColor } from "@/lib/public/brand";
import type { SupportContact } from "@/lib/public/equipment";
import { REQUIRES_JAVASCRIPT_HIDE_CSS } from "@/lib/public/nojs";

/**
 * The no-JavaScript notice for the public return checklist (Engineering Phase D4.1, Part H). Pure — no I/O.
 *
 * The guided checklist posts its answers from client state, so without JavaScript it cannot be completed. The notice
 * says so, hides the form, and offers only honest next steps: back to the equipment page, and a call or email to the
 * rental company when a contact survives the same strict link builders the confirmation page uses. It never offers
 * another form in its place — a damage report is not a return — and it never redirects.
 *
 * Returned as raw HTML because React's server renderer does not emit JSX children of `<noscript>`. Every value that
 * reaches the markup is either a constant, a validated `#RRGGBB` color, a `tel:`/`mailto:` href from `telHref` /
 * `mailtoHref` (restricted character sets), a URL-encoded short code, or HTML-escaped text.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export const RETURN_NOSCRIPT_HEADLINE = "The return checklist needs JavaScript.";
export const RETURN_NOSCRIPT_INSTRUCTION = "Turn on JavaScript and reload this page to complete it.";

const ACTION_BASE = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium";

export type ReturnNoScriptInput = {
  shortCode: string;
  orgName: string | null;
  brandColor: string | null;
  contact: SupportContact;
};

export function returnChecklistNoScriptHtml(input: ReturnNoScriptInput): string {
  const brand = safeBrandColor(input.brandColor);
  const brandText = readableTextOn(brand);
  const phoneHref = telHref(input.contact.phone);
  const emailHref = mailtoHref(input.contact.email);
  const company = input.orgName?.trim() ? escapeHtml(input.orgName.trim()) : "the rental company";

  const actions = [
    `<a data-noscript-action="back" class="${ACTION_BASE}" style="background-color:${brand};color:${brandText}" href="/t/${encodeURIComponent(input.shortCode)}">Back to equipment page</a>`,
    phoneHref
      ? `<a data-noscript-action="call" class="${ACTION_BASE} border-2 bg-background text-foreground" style="border-color:${brand}" href="${escapeHtml(phoneHref)}">Call ${company}</a>`
      : "",
    emailHref
      ? `<a data-noscript-action="email" class="${ACTION_BASE} border-2 bg-background text-foreground" style="border-color:${brand}" href="${escapeHtml(emailHref)}">Email support</a>`
      : "",
  ].join("");

  return (
    `<style>${REQUIRES_JAVASCRIPT_HIDE_CSS}</style>` +
    `<div class="rounded-lg border bg-muted/40 p-4 text-sm" data-return-noscript-notice="">` +
    `<p class="font-medium">${RETURN_NOSCRIPT_HEADLINE}</p>` +
    `<p class="mt-1 text-muted-foreground">${RETURN_NOSCRIPT_INSTRUCTION}</p>` +
    `<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">${actions}</div>` +
    `</div>`
  );
}
