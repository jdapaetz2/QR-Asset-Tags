/**
 * No-JavaScript fallback for the public scan page and forms.
 *
 * Those routes stream their `loading.tsx` skeleton first and swap the real page in with inline scripts, so without
 * JavaScript the skeleton never goes away. The skeleton carries a `<noscript>` refresh to `?nojs=1`
 * (components/public/noscript-continue.tsx), and these rewrites send that request to a copy of the route under
 * `app/nojs/`, which has no loading boundary and therefore renders the whole document in order. A request without
 * the query matches no rule, so JavaScript users and normal scans are untouched.
 *
 * Imported by next.config.ts — keep this module free of `@/` imports and runtime dependencies.
 */

export const NOJS_QUERY = "nojs";
export const NOJS_VALUE = "1";

/** Relative URL the skeleton refreshes to: the same path with the no-JavaScript flag. */
export const NOJS_CONTINUE_HREF = `?${NOJS_QUERY}=${NOJS_VALUE}`;

/** Marks UI that cannot work without JavaScript; hidden by the public return page's `<noscript>` style. */
export const REQUIRES_JAVASCRIPT_ATTRIBUTE = "data-requires-javascript";
export const REQUIRES_JAVASCRIPT_HIDE_CSS = `[${REQUIRES_JAVASCRIPT_ATTRIBUTE}]{display:none!important}`;

export type NoJsRewrite = {
  source: string;
  destination: string;
  has: { type: "query"; key: string; value: string }[];
};

/** The streamed public routes. Their `/thanks` children have no skeleton and render normally without JavaScript. */
const STREAMED_PUBLIC_ROUTES = [
  "/t/:shortCode",
  "/forms/:shortCode/damage",
  "/forms/:shortCode/support",
  "/forms/:shortCode/return",
] as const;

export function noJsRewrites(): NoJsRewrite[] {
  return STREAMED_PUBLIC_ROUTES.map((source) => ({
    source,
    destination: `/nojs${source}`,
    has: [{ type: "query", key: NOJS_QUERY, value: NOJS_VALUE }],
  }));
}
