import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

/**
 * Anonymous Supabase client for public surfaces (the /t/{short_code} scan page).
 * Uses the public anon key with NO session/cookies, so every request runs as the
 * Postgres `anon` role and is gated by the public RLS policies — the page behaves
 * identically for logged-out and logged-in visitors. Never use for admin data.
 */
export function createPublicClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
