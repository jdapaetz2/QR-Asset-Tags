import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for use in Client Components / the browser.
 * Uses the public anon key and is subject to row-level security.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
