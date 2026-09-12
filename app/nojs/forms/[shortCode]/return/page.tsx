import type { Metadata } from "next";

/**
 * No-JavaScript copy of /forms/[shortCode]/return (lib/public/nojs.ts): the same page with no loading boundary above
 * it, so the whole document renders in order — which, without JavaScript, shows the checklist's notice
 * (components/public/return-checklist-noscript.tsx). Reached only through the `?nojs=1` rewrite.
 */
export { default } from "@/app/forms/[shortCode]/return/(form)/page";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { robots: { index: false } };
