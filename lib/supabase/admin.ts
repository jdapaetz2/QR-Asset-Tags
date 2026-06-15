import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. **Server-only** — this BYPASSES row-level
 * security, so it must never be imported into client code or exposed to the
 * browser. The `server-only` import above turns any client-side import into a
 * build error.
 *
 * Use only in trusted server contexts (e.g. deriving `organization_id` during
 * public submission intake). See docs/SECURITY_MODEL.md.
 */
export function createAdminClient() {
  return createSupabaseClient(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
