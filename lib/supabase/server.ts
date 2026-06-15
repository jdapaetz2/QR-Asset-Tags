import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Uses the public anon key with the caller's session cookies, so it is still
 * subject to row-level security. `cookies()` is async in Next.js 16.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` can be called from a Server Component, where setting
            // cookies is not allowed. Session refresh is handled by middleware,
            // so this is safe to ignore.
          }
        },
      },
    }
  );
}
