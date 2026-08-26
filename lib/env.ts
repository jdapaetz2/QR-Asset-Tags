/**
 * Typed, validated access to environment variables.
 *
 * Public (`NEXT_PUBLIC_*`) vars are safe in the browser bundle. Server-only
 * vars (notably `SUPABASE_SERVICE_ROLE_KEY`) must never be read from client
 * code — `requireServerEnv` throws if it is somehow invoked in the browser.
 *
 * Deployment context comes from Vercel's `VERCEL_ENV` (`production` | `preview`
 * | `development`); it is undefined locally / in CI / in unit tests, which we
 * treat as `development`. Production/preview tighten validation so misconfig
 * fails fast instead of degrading silently. Error messages NEVER include a
 * secret value. See docs/CODE_HANDOFF.md "Environment variables".
 */

/** Minimum length for `SCAN_IP_HASH_SALT` in preview/production (unpredictable chars). */
export const SCAN_IP_HASH_SALT_MIN_LENGTH = 32;

export type DeploymentContext = "production" | "preview" | "development";

/** Resolve the deployment context from `VERCEL_ENV` (server-only; browser → development). */
export function deploymentContext(): DeploymentContext {
  const v = process.env.VERCEL_ENV;
  if (v === "production" || v === "preview") return v;
  return "development";
}

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

/** Hosts that are never a valid production tag/site destination. */
export function isPlaceholderHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "example.com" ||
    h === "www.example.com" ||
    h === "example.org" ||
    h === "changeme" ||
    h === "placeholder" ||
    h.startsWith("placeholder.")
  );
}

/**
 * Normalize a site URL to a single canonical origin: lowercased scheme+host(+port),
 * no path, no trailing slash. Throws if the value is not a valid absolute URL.
 */
export function normalizeSiteOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is not a valid absolute URL (expected e.g. https://tags.example.com)`
    );
  }
  return url.origin.toLowerCase();
}

/** Public Supabase config — safe to expose to the client. */
export const publicEnv = {
  get supabaseUrl(): string {
    return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /**
   * The app's canonical origin (used for QR base, auth redirects, invite/notification
   * links). Always normalized to a bare origin. In Vercel **production** it must be
   * HTTPS and a real host (no localhost/placeholder). Preview/local are unrestricted
   * here — separate, stricter rules gate physical-tag output (see lib/qr/production.ts).
   */
  get siteUrl(): string {
    const origin = normalizeSiteOrigin(requireEnv("NEXT_PUBLIC_SITE_URL"));
    if (deploymentContext() === "production") {
      const url = new URL(origin);
      if (url.protocol !== "https:") {
        throw new Error("NEXT_PUBLIC_SITE_URL must use https in production");
      }
      if (isPlaceholderHost(url.hostname)) {
        throw new Error(
          "NEXT_PUBLIC_SITE_URL must be a real production host in production (not localhost/placeholder)"
        );
      }
    }
    return origin;
  },
};

/** Server-only secrets — never import these into client components. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  /**
   * Salt for hashing scan-event IPs. **Fails closed in preview/production**: it must be
   * set and at least SCAN_IP_HASH_SALT_MIN_LENGTH chars, else this throws (the value is
   * never included in the error). In local development / unit tests it fails soft
   * (returns "") so scan logging never crashes — a hash with an empty salt still stores
   * no raw IP, only weaker anonymization.
   */
  get scanIpHashSalt(): string {
    if (typeof window !== "undefined") {
      throw new Error('Refusing to read server-only env var "SCAN_IP_HASH_SALT" in the browser');
    }
    const salt = process.env.SCAN_IP_HASH_SALT ?? "";
    const ctx = deploymentContext();
    if (ctx === "production" || ctx === "preview") {
      if (salt.length < SCAN_IP_HASH_SALT_MIN_LENGTH) {
        throw new Error(
          `SCAN_IP_HASH_SALT must be set to at least ${SCAN_IP_HASH_SALT_MIN_LENGTH} characters in ${ctx}`
        );
      }
    }
    return salt;
  },
  /**
   * Resend API key for notification emails. Optional: returns "" when unset so the
   * notifier falls back to dry-run (logs, no send) instead of crashing. In production
   * an unset key is an intentional dry-run — document the intent per environment.
   */
  get resendApiKey(): string {
    if (typeof window !== "undefined") {
      throw new Error('Refusing to read server-only env var "RESEND_API_KEY" in the browser');
    }
    return process.env.RESEND_API_KEY ?? "";
  },
  /** From address for notification emails (e.g. "Mulemark <notifications@notify.mulemark.io>"). Optional. */
  get notificationFromEmail(): string {
    if (typeof window !== "undefined") {
      throw new Error('Refusing to read server-only env var "NOTIFICATION_FROM_EMAIL" in the browser');
    }
    return process.env.NOTIFICATION_FROM_EMAIL ?? "";
  },
  /**
   * Reply-To for notification emails (Phase B4). Optional and independent of the sender: the `from`
   * must be on the Resend-verified sending subdomain, while replies should reach a HUMAN mailbox on
   * the root domain (`support@mulemark.io`, Google Workspace). Unset → the header is omitted entirely
   * and replies go to the no-reply sending address, which is a worse experience but never an error.
   */
  get notificationReplyToEmail(): string {
    if (typeof window !== "undefined") {
      throw new Error('Refusing to read server-only env var "NOTIFICATION_REPLY_TO_EMAIL" in the browser');
    }
    return process.env.NOTIFICATION_REPLY_TO_EMAIL ?? "";
  },
};

// Exposed for unit testing.
export const _internal = { requireEnv, requireServerEnv };
