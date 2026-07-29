/**
 * Phase A4 — centralized, pure rate-limit policy for public intake. No I/O, no crypto here (keys are
 * assembled from already-hashed inputs), so this whole module is trivially unit-testable and safe to
 * import anywhere server-side.
 *
 * Keying is per (action, hashed IP, hashed short code). Keying by short code (not by IP alone) is
 * deliberately NAT-friendly: a busy yard/jobsite behind one NAT hits many different short codes, and
 * each asset is bounded independently, so ordinary shared-IP traffic is not penalized while per-asset
 * abuse is still capped. Raw IP is never used here — the caller passes a salted hash.
 */

export type RateLimitAction = "acknowledgement" | "damage_support" | "return";

/** One fixed window: at most `max` events per `window` seconds. */
export type RateRule = { max: number; window: number };

const MINUTE = 60;
const HOUR = 3600;

/**
 * Thresholds tuned for a pilot: permit ordinary retries, tolerate a handful of NAT-shared users on one
 * asset, stricter for media-bearing writes (storage cost), generous for one-time renter actions. Each
 * action gets a short BURST window + a longer ABUSE window; a request is limited if it trips either.
 */
export const RATE_LIMIT_RULES: {
  acknowledgement: RateRule[];
  damage_support_text: RateRule[];
  damage_support_media: RateRule[];
  return: RateRule[];
} = {
  // A tap, no media — cheap; allow retries and several people on one asset.
  acknowledgement: [
    { max: 10, window: MINUTE },
    { max: 60, window: HOUR },
  ],
  // Text-only damage/support — cheap write, ordinary retries.
  damage_support_text: [
    { max: 5, window: MINUTE },
    { max: 30, window: HOUR },
  ],
  // Media-bearing damage/support — stricter: each attempt can store up to MAX_FILES × MAX_FILE_BYTES.
  damage_support_media: [
    { max: 3, window: MINUTE },
    { max: 15, window: HOUR },
  ],
  // Return checklist (basic + guided) — media-heavy, normally done once; leave retry headroom.
  return: [
    { max: 3, window: MINUTE },
    { max: 20, window: HOUR },
  ],
};

/** Pick the rule set for an action, accounting for whether media is attached (damage/support only). */
export function selectRules(action: RateLimitAction, hasMedia: boolean): RateRule[] {
  switch (action) {
    case "acknowledgement":
      return RATE_LIMIT_RULES.acknowledgement;
    case "return":
      return RATE_LIMIT_RULES.return;
    case "damage_support":
      return hasMedia ? RATE_LIMIT_RULES.damage_support_media : RATE_LIMIT_RULES.damage_support_text;
  }
}

/**
 * Assemble the opaque limiter key from already-hashed parts. Never receives a raw IP — `ipHash` is the
 * salted SHA-256 from lib/scan/scan.ts and `shortCodeHash` is a salted hash too. Prefix + colons keep
 * keys namespaced and fixed-shape.
 */
export function buildBucketKey(action: RateLimitAction, ipHash: string, shortCodeHash: string): string {
  return `rl:${action}:${ipHash}:${shortCodeHash}`;
}

/** Renter-facing copy for a limited request. Deliberately generic — no asset/org state, no exact timing. */
export const RATE_LIMITED_MESSAGE =
  "Too many attempts right now. Please wait a moment and try again.";
