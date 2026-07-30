/**
 * Environment target resolution (Phase B1A). Pure — no I/O, no process.exit, no printing.
 *
 * WHY THIS EXISTS: Phase A7 found that the Vercel preview deployment reads and writes the PRODUCTION
 * Supabase project using the production service-role key. Removing that coupling needs one trustworthy
 * answer to "which project am I actually pointed at?" — shared by every verifier and every destructive
 * script, rather than re-implemented (and drifted) in each.
 *
 * DESIGN RULES (from the B1A brief):
 *   - A target is NEVER inferred from a human-readable name. Only the project ref / host decides.
 *   - Anything ambiguous fails closed to `production` — the most dangerous target gets the benefit of
 *     the doubt, so an unrecognised host is treated as "assume it's real" rather than "assume it's safe".
 *   - Errors carry the host and the ref ONLY. Both are public by construction (see below). Key material
 *     is never accepted into this module in the first place, so it cannot leak through a message.
 *
 * ON COMMITTING THE PRODUCTION REF: a Supabase project ref is the hostname inside
 * `NEXT_PUBLIC_SUPABASE_URL`, which is compiled into the browser bundle and served to every visitor.
 * It is public by construction, not a secret. Committing it is what lets the staging verifier refuse
 * production *by name* rather than merely hoping an operator set the right variable.
 */

/** The live production Supabase project. Public by construction — see the module note above. */
export const KNOWN_PRODUCTION_REF = "apeiswnkheiwrpvumder";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1"]);

export const TARGETS = /** @type {const} */ (["local", "staging", "production"]);

/**
 * Extract the Supabase project ref from an API URL.
 * `https://abcdefghijklmnop.supabase.co` → `abcdefghijklmnop`. Returns null for local stacks, custom
 * domains, or anything that is not a recognisable hosted Supabase URL.
 */
export function parseSupabaseRef(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (LOOPBACK_HOSTS.has(host)) return null;
  const m = /^([a-z0-9]{16,})\.supabase\.(co|in)$/.exec(host);
  return m ? m[1] : null;
}

/** Whether a Supabase API URL points at a local Docker stack. */
export function isLocalSupabase(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Host of a URL, or a stable placeholder — for messages. Never throws. */
export function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "<unparseable-url>";
  }
}

/**
 * Classify the target a Supabase URL points at.
 *
 * @param {{ supabaseUrl: string, expectedStagingRef?: string|null }} input
 * @returns {{ target: "local"|"staging"|"production"|"unknown", ref: string|null, host: string,
 *             reason: string }}
 *
 * `unknown` is returned ONLY when the URL is unparseable. A hosted ref that is neither the known
 * production ref nor the declared staging ref classifies as `production` — fail closed.
 */
export function classifyTarget({ supabaseUrl, expectedStagingRef = null }) {
  const host = safeHost(supabaseUrl);
  if (host === "<unparseable-url>") {
    return { target: "unknown", ref: null, host, reason: "Supabase URL is not a valid URL" };
  }
  if (isLocalSupabase(supabaseUrl)) {
    return { target: "local", ref: null, host, reason: "loopback host — local Docker stack" };
  }
  const ref = parseSupabaseRef(supabaseUrl);
  if (ref && ref === KNOWN_PRODUCTION_REF) {
    return { target: "production", ref, host, reason: "matches the known production project ref" };
  }
  if (ref && expectedStagingRef && ref === expectedStagingRef) {
    return { target: "staging", ref, host, reason: "matches the declared staging project ref" };
  }
  // Remote, but not a ref we can positively identify → treat as production (fail closed).
  return {
    target: "production",
    ref,
    host,
    reason: ref
      ? "remote project ref is not the declared staging ref — treated as production (fail closed)"
      : "remote host is not a recognisable Supabase project — treated as production (fail closed)",
  };
}

/**
 * Assert that the resolved target is the one the caller intended.
 * Throws an Error whose message contains only the host, the refs, and the reason.
 *
 * @param {"local"|"staging"|"production"} mode
 * @param {{ supabaseUrl: string, expectedStagingRef?: string|null }} input
 * @returns {{ target: string, ref: string|null, host: string, reason: string }} on success
 */
export function assertTarget(mode, input) {
  if (!TARGETS.includes(mode)) {
    throw new Error(`unknown target mode "${mode}" — expected one of: ${TARGETS.join(", ")}`);
  }
  // Staging must be declared explicitly; without a ref to compare against there is nothing to verify.
  if (mode === "staging" && !input.expectedStagingRef) {
    throw new Error(
      "refusing to treat any project as staging: no expected staging project ref was supplied. " +
        "Set STAGING_SUPABASE_REF to the staging project ref (it is public, not a secret). " +
        "Fail-closed by design — see docs/STAGING_ENVIRONMENT_SETUP.md."
    );
  }
  const resolved = classifyTarget(input);
  if (resolved.target !== mode) {
    throw new Error(
      `refusing to run: expected the ${mode.toUpperCase()} target but resolved ${resolved.target.toUpperCase()} ` +
        `(host: ${resolved.host}${resolved.ref ? `, ref: ${resolved.ref}` : ""}) — ${resolved.reason}.`
    );
  }
  return resolved;
}

/**
 * Whether a site URL is safe to etch onto a PERMANENT physical tag.
 * Mirrors `productionBaseUrlIssue` in lib/qr/production.ts (authoritative + unit-tested there);
 * duplicated here only so scripts can answer the question without importing TypeScript.
 * Returns a human-readable issue string, or null when the URL is tag-safe.
 */
export function tagBaseUrlIssue(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "is not a valid URL";
  }
  if (parsed.protocol !== "https:") return "must use https";
  const host = parsed.hostname.toLowerCase();
  if (
    LOOPBACK_HOSTS.has(host) ||
    host === "example.com" ||
    host === "placeholder" ||
    host.startsWith("placeholder.") ||
    host.endsWith(".localhost")
  ) {
    return "is a localhost/placeholder host";
  }
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    return "is a Vercel preview/deploy host (disposable — tags made from it would break)";
  }
  return null;
}

/** True when notifications will run in dry-run (no provider configured). */
export function isDryRunEmail(env = process.env) {
  return !env.RESEND_API_KEY && !env.NOTIFICATION_FROM_EMAIL;
}
