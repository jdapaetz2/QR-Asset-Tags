/**
 * Typed, validated access to environment variables.
 *
 * Public (`NEXT_PUBLIC_*`) vars are safe in the browser bundle. Server-only
 * vars (notably `SUPABASE_SERVICE_ROLE_KEY`) must never be read from client
 * code — `requireServerEnv` throws if it is somehow invoked in the browser.
 *
 * See docs/CODE_HANDOFF.md "Environment variables".
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireServerEnv(name: string): string {
  if (typeof window !== "undefined") {
    throw new Error(
      `Refusing to read server-only env var "${name}" in the browser`
    );
  }
  return requireEnv(name);
}

/** Public Supabase config — safe to expose to the client. */
export const publicEnv = {
  get supabaseUrl(): string {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get siteUrl(): string {
    return requireEnv("NEXT_PUBLIC_SITE_URL");
  },
};

/** Server-only secrets — never import these into client components. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  /**
   * Salt for hashing scan-event IPs. Optional: returns "" if unset so scan
   * logging never crashes (a hash with an empty salt still stores no raw IP).
   */
  get scanIpHashSalt(): string {
    if (typeof window !== "undefined") {
      throw new Error('Refusing to read server-only env var "SCAN_IP_HASH_SALT" in the browser');
    }
    return process.env.SCAN_IP_HASH_SALT ?? "";
  },
};

// Exposed for unit testing.
export const _internal = { requireEnv, requireServerEnv };
