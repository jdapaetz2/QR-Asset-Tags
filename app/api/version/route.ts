import { NextResponse } from "next/server";

import { deploymentContext } from "@/lib/env";

// Which build this deployment serves, read fresh on every request.
export const dynamic = "force-dynamic";

/**
 * Engineering Phase E2C — the deployment's commit and environment, from Vercel's own system variables, so a release can
 * be checked against the exact approved commit (not an unrelated Ready deployment). Nothing secret is read or returned.
 */
export function GET() {
  return NextResponse.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null, environment: deploymentContext() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
