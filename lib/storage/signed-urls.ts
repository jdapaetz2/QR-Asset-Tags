import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bounded batch signing for private Storage objects (Phase C4).
 *
 * Every call site previously issued ONE `createSignedUrl` request per object. On lists and evidence
 * pages that is a bounded N+1: N Storage round trips to render N thumbnails. `createSignedUrls`
 * (plural) does the same work in one request, and is present in the installed `@supabase/storage-js`
 * 2.108.2 — verified against `dist/index.d.mts`, not assumed from a different SDK version.
 *
 * SECURITY IS UNCHANGED. This takes the caller's RLS-scoped client, never the service-role client, and
 * the batch endpoint requires the same `objects: select` permission as the single-path one. A path the
 * caller cannot read does not get signed. The bucket stays private, the TTL stays exactly as the caller
 * passes it, and nothing here caches a URL beyond the call.
 *
 * WHY THE RESULT IS MAPPED BY `path` AND NOT BY INDEX. The response type is
 * `{ error, path: string | null, signedUrl: string | null }[]`, and nothing in the contract promises
 * the array is ordered to match the input. Index alignment would appear to work in testing and could
 * silently hand row A the signed URL for row B's photo — a private-media mix-up between rows that may
 * belong to different assets. Mapping by the returned path cannot do that.
 */

/** What a caller gets back: every requested path, mapped to its URL or to an explicit `null`. */
export type SignedPathMap = Map<string, string | null>;

/**
 * Sign a bounded list of paths in one request.
 *
 * Returns a map covering **every** de-duplicated input path. A path that could not be signed — because
 * the batch failed, because the entry carried an error, or because the response simply did not mention
 * it — maps to `null`. `null` is the point: it lets a caller render "unavailable" and is impossible to
 * mistake for a usable URL, unlike a raw storage path or an empty string.
 *
 * Never throws. A signing failure must not take down a page that is otherwise fine.
 */
export async function signPaths(
  supabase: SupabaseClient,
  bucket: string,
  paths: readonly string[],
  ttlSeconds: number,
  callSite: string
): Promise<SignedPathMap> {
  const unique = Array.from(
    new Set(
      paths
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    )
  );

  const signed: SignedPathMap = new Map();
  // No paths → no request. Rendering a list with no attachments must cost nothing.
  if (unique.length === 0) return signed;

  // Seed every requested path as null, so a path the response omits is already correct and the map
  // always covers exactly what was asked for.
  for (const path of unique) signed.set(path, null);

  let results: { error: string | null; path: string | null; signedUrl: string | null }[] | null = null;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, ttlSeconds);
    if (error) {
      logSigningFailure(callSite, bucket, unique.length, unique.length);
      return signed;
    }
    results = data;
  } catch {
    logSigningFailure(callSite, bucket, unique.length, unique.length);
    return signed;
  }

  let failed = 0;
  for (const entry of results ?? []) {
    // Mapped by the returned path — see the module note on why index alignment is unsafe here.
    if (!entry?.path) {
      failed++;
      continue;
    }
    if (entry.error || !entry.signedUrl) {
      failed++;
      continue;
    }
    // Ignore anything the caller did not ask for rather than widening the map.
    if (signed.has(entry.path)) signed.set(entry.path, entry.signedUrl);
  }

  if (failed > 0) logSigningFailure(callSite, bucket, unique.length, failed);
  return signed;
}

/**
 * Count and call site only.
 *
 * A storage path identifies a private object and encodes the owning organization; a signed URL *is* an
 * access credential for the duration of its TTL. Neither belongs in a log, which is exactly why this
 * takes numbers rather than the values themselves — there is no parameter through which a caller could
 * pass one by mistake.
 */
function logSigningFailure(callSite: string, bucket: string, requested: number, failed: number): void {
  try {
    console.error(
      "[storage]",
      JSON.stringify({ tag: "storage", op: "sign", callSite, bucket, requested, failed })
    );
  } catch {
    // A logging problem must never become the page's problem.
  }
}
