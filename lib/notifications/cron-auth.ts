import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Engineering Phase D3B — authorization for Vercel cron invocations. Pure.
 *
 * Vercel sends `CRON_SECRET` as `Authorization: Bearer <secret>`. The comparison hashes both sides first so the
 * constant-time check never depends on (or reveals) the secret's length. A missing secret refuses everything; a secret
 * in a query string is never read.
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | null): boolean {
  if (!secret || !authorizationHeader) return false;
  return timingSafeEqual(digest(authorizationHeader), digest(`Bearer ${secret}`));
}
