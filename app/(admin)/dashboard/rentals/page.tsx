import { redirect } from "next/navigation";

import { requireOrgId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Protected index for the rental-session evidence area (Phase 3C.3). Session evidence is always viewed for a
 * specific session at `/dashboard/rentals/[sessionId]`; the bare path has no useful content, so it redirects
 * to the submissions inbox. This exists so a link built without a session id (the falsy-guard fallback) can
 * never 404 — it lands on a safe, authenticated redirect instead.
 */
export default async function RentalsIndexPage() {
  await requireOrgId();
  redirect("/dashboard/submissions");
}
