/**
 * Smoke target resolution (Phase B5). Pure — no I/O, no process.exit, no printing.
 *
 * WHY A SECOND TARGET MODULE. `env-target.mjs` answers "which Supabase project am I pointed at?" from
 * `NEXT_PUBLIC_SUPABASE_URL`, which means it needs database credentials to say anything. Production
 * browser smoke must run with **no credentials at all** — no service-role key, no database password —
 * so it cannot use that gate. This module answers the different question smoke actually needs:
 *
 *     "which deployment is this URL?"
 *
 * from the URL alone. The two are complementary and both fail closed to production.
 *
 * DESIGN RULES (inherited from B1A):
 *   - The target is decided by the HOST, never by a human-readable name or an operator's assertion.
 *   - Anything unrecognised classifies as `production` — the environment where a mistake costs the most
 *     gets the benefit of the doubt.
 *   - Messages carry hosts only. Hosts are public by construction; no secret is ever accepted here.
 *
 * ON PINNING THE PRODUCTION ORIGIN: `https://mulemark.io` ships in the browser bundle as
 * `NEXT_PUBLIC_SITE_URL` and is printed on physical tags. It is public, not a secret. Pinning it is
 * what lets a runner refuse a production URL *by name* rather than trusting a flag.
 */
import { tagBaseUrlIssue } from "./env-target.mjs";

/** The live production origin. Public by construction — see the module note. */
export const CANONICAL_PRODUCTION_ORIGIN = "https://mulemark.io";

/**
 * The staging-only QR short code seeded by scripts/staging/seed-staging-qa.mjs. It exists in the
 * staging database and nowhere else, which makes it a behavioural proof of *which database* a
 * deployment is reading — independent of the URL check. Staging must resolve it; production must not.
 */
export const ISOLATION_PROBE_SHORT_CODE = "stg-only-isolation-probe";

export const SMOKE_TARGETS = /** @type {const} */ (["local", "staging", "production"]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1"]);

/** Host of a URL, or a stable placeholder — for messages. Never throws. */
function safeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "<unparseable-url>";
  }
}

/** Normalize to a bare origin with no trailing slash, or null when unparseable. */
export function normalizeOrigin(url) {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify the deployment a URL points at, from the host alone.
 *
 * @param {string} url
 * @returns {{ target: "local"|"staging"|"production"|"unknown", host: string, origin: string|null,
 *             reason: string }}
 *
 * `unknown` is returned ONLY when the URL cannot be parsed. A parseable host that is neither loopback
 * nor a Vercel preview classifies as `production` — fail closed.
 */
export function classifySmokeTarget(url) {
  const host = safeHost(url);
  if (host === "<unparseable-url>") {
    return { target: "unknown", host, origin: null, reason: "not a valid URL" };
  }
  const origin = normalizeOrigin(url);

  if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) {
    return { target: "local", host, origin, reason: "loopback host — local dev server" };
  }
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    return { target: "staging", host, origin, reason: "Vercel preview/deploy host" };
  }
  if (origin === CANONICAL_PRODUCTION_ORIGIN || host === new URL(CANONICAL_PRODUCTION_ORIGIN).hostname) {
    return { target: "production", host, origin, reason: "the canonical production origin" };
  }
  // A real, non-preview, non-loopback host we do not recognise. It could be `www.`, an apex alias, or a
  // future custom domain — all of which are far likelier to be production than a test environment.
  return {
    target: "production",
    host,
    origin,
    reason: "unrecognised public host — treated as production (fail closed)",
  };
}

/**
 * Assert the URL is the deployment the caller intended, BEFORE any request is made.
 * Throws an Error whose message contains only hosts and the reason.
 *
 * @param {"local"|"staging"|"production"} mode
 * @param {string} url
 * @returns {{ target: string, host: string, origin: string|null, reason: string }} on success
 */
export function assertSmokeTarget(mode, url) {
  if (!SMOKE_TARGETS.includes(mode)) {
    throw new Error(`unknown smoke target "${mode}" — expected one of: ${SMOKE_TARGETS.join(", ")}`);
  }
  if (!url) {
    throw new Error(`refusing to run ${mode} smoke: no base URL was supplied.`);
  }
  const resolved = classifySmokeTarget(url);
  if (resolved.target !== mode) {
    throw new Error(
      `refusing to run ${mode.toUpperCase()} smoke against a ${resolved.target.toUpperCase()} URL ` +
        `(host: ${resolved.host}) — ${resolved.reason}. No request was made.`
    );
  }
  // Staging must never be the permanent domain: a QA scan there would be indistinguishable from a real
  // tag scan, and would pollute production analytics.
  if (mode === "staging" && !tagBaseUrlIssue(resolved.origin ?? url)) {
    throw new Error(
      `refusing to run STAGING smoke against ${resolved.host}: it is a tag-safe production origin. ` +
        "Staging must use a disposable preview URL."
    );
  }
  // Production must be https. A plaintext production URL is either a misconfiguration or an attack.
  if (mode === "production" && !String(resolved.origin ?? url).startsWith("https://")) {
    throw new Error(`refusing to run PRODUCTION smoke over a non-https origin (host: ${resolved.host}).`);
  }
  return resolved;
}
