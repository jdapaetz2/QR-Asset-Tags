import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 "proxy" (formerly middleware). Runs only on the authenticated
 * areas — public routes (home, future /t/{short_code} pages) are intentionally
 * left untouched so they stay fast and anonymous.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/owner/:path*"],
};
