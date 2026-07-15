import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared private-media signing for submission attachments (Wave 3N.3). Both the admin session-evidence page
 * and the admin/staff submission-detail surfaces store media as storage paths in the private `submissions`
 * bucket; this signs a batch of paths ONCE into a path→url map that every photo grid reuses. Centralized so
 * the "signed media logic" is never forked across the admin and staff renderers. Uses the passed RLS server
 * client (never the service-role admin client) — a path the caller can't read simply signs to a URL that 403s.
 */

export const SUBMISSIONS_BUCKET = "submissions";
const SIGNED_URL_TTL_SECONDS = 3600;

/** Collect the media paths from a set of submission rows (safe on non-array `media_urls`). */
export function collectMediaPaths(
  rows: ReadonlyArray<{ media_urls: unknown }>
): string[] {
  return rows.flatMap((r) =>
    Array.isArray(r.media_urls) ? (r.media_urls as unknown[]).filter((p): p is string => typeof p === "string") : []
  );
}

/**
 * Sign every path into a `Map<path, signedUrl | null>` (null when signing fails). One `createSignedUrl` per
 * unique path, run concurrently. Empty input → empty map (no I/O).
 */
export async function signMediaPaths(
  supabase: SupabaseClient,
  paths: readonly string[]
): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(paths.filter((p) => typeof p === "string" && p.length > 0)));
  const signedByPath = new Map<string, string | null>();
  await Promise.all(
    unique.map(async (path) => {
      const { data } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      signedByPath.set(path, data?.signedUrl ?? null);
    })
  );
  return signedByPath;
}
