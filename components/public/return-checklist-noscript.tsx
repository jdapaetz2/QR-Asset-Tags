import { REQUIRES_JAVASCRIPT_HIDE_CSS } from "@/lib/public/nojs";

/**
 * The guided return checklist posts every answer through inputs that client state fills in (ChoiceButtons, the
 * acknowledgement — Phase 3C.1.1 / 3C.5), so without JavaScript it would submit empty. Instead of a form that cannot
 * work, a renter without JavaScript sees this notice and a way to report damage, which works without it; the
 * checklist form (`data-requires-javascript`) is hidden. Rendered only on the public return page.
 *
 * Raw markup on purpose: React's server renderer does not emit JSX children of `<noscript>`, so the notice is inner
 * HTML. Everything is constant except the short code, which is URL-encoded (no quotes or angle brackets survive).
 */
function noticeHtml(shortCode: string): string {
  const damageHref = `/forms/${encodeURIComponent(shortCode)}/damage`;
  return (
    `<style>${REQUIRES_JAVASCRIPT_HIDE_CSS}</style>` +
    `<div class="rounded-lg border bg-muted/40 p-4 text-sm" data-return-noscript-notice="">` +
    `<p class="font-medium">The return checklist needs JavaScript.</p>` +
    `<p class="mt-1 text-muted-foreground">Turn it on and reload this page — or report damage, which works without it.</p>` +
    `<a class="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4" href="${damageHref}">Report damage</a>` +
    `</div>`
  );
}

export function ReturnChecklistNoScript({ shortCode }: { shortCode: string }) {
  return <noscript dangerouslySetInnerHTML={{ __html: noticeHtml(shortCode) }} />;
}
