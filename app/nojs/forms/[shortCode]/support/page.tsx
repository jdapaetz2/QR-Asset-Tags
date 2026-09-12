import type { Metadata } from "next";

/**
 * No-JavaScript copy of /forms/[shortCode]/support (lib/public/nojs.ts): the same page with no loading boundary above
 * it, so the whole document renders in order. Reached only through the `?nojs=1` rewrite.
 */
export { default } from "@/app/forms/[shortCode]/support/(form)/page";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { robots: { index: false } };
