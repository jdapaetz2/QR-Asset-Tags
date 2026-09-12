import { NOJS_CONTINUE_HREF } from "@/lib/public/nojs";

/**
 * No-JavaScript exit from a public route skeleton (lib/public/nojs.ts). Without JavaScript the streamed page never
 * replaces the skeleton, so the browser is refreshed to the same URL with `?nojs=1`, which serves a copy of the route
 * that does not stream. The link covers browsers that block meta refresh.
 *
 * Raw markup on purpose: React hoists a rendered `<meta>` into `<head>`, where the refresh would also fire for
 * JavaScript users. As `<noscript>` inner HTML it stays inert whenever scripting is on. The string is a constant.
 */
const NOSCRIPT_HTML =
  `<meta http-equiv="refresh" content="0; url=${NOJS_CONTINUE_HREF}">` +
  `<p class="text-sm"><a class="underline underline-offset-4" href="${NOJS_CONTINUE_HREF}">Continue without JavaScript</a></p>`;

export function NoScriptContinue() {
  return <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_HTML }} />;
}
