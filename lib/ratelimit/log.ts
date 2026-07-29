import "server-only";

/**
 * Phase A4 — structured abuse logging. Emits ONE JSON line per public-intake outcome, tagged
 * `[rate-limit]`, carrying only non-sensitive fields. It deliberately never receives (and so can never
 * log) a raw IP, auth cookies, full form text, private media URLs, or the salt/secret. The short code is
 * passed pre-hashed by the caller.
 */

export type AbuseLogFields = {
  action: string;
  correlationId: string;
  /** Salted hash of the short code — never the raw short code. */
  shortCodeHash: string;
  limiter: "allowed" | "limited" | "failopen";
  fileCount?: number;
  totalBytes?: number;
  cleanup?: "clean" | "partial" | "failed" | "none";
  /** Coarse failure class (e.g. "upload", "insert", "duplicate", "notify") — never an error message body. */
  failure?: string;
};

export function logAbuseEvent(fields: AbuseLogFields): void {
  const payload = { tag: "rate-limit", ...fields };
  // A limited or failed outcome is noteworthy (error stream); an allowed one is info.
  if (fields.limiter === "limited" || fields.failure) {
    console.error("[rate-limit]", JSON.stringify(payload));
  } else {
    console.info("[rate-limit]", JSON.stringify(payload));
  }
}
