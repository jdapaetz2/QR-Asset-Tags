import "server-only";

/**
 * Structured logging for a failed read inside a parallel query group (Phase C2).
 *
 * WHY THIS EXISTS: the Assets route discarded every query error — `const { data } = await …` then
 * `data ?? []`. A failed query became an empty array, so a database problem rendered as "no assets".
 * That is worse than an error page: it is a page that confidently states something false, and it left
 * no trace anywhere. Parallelizing those reads without fixing that would have multiplied the silence.
 *
 * WHAT IT LOGS: the route, which read failed, and the Postgres error CODE. Nothing else.
 *
 * WHAT IT DOES NOT LOG, and why:
 *   - the error MESSAGE — PostgREST messages routinely quote column names, constraint names and
 *     fragments of the failing statement, which is database internals leaking into a log;
 *   - any row, id, name, email or search term — a failing query often fails *because* of its inputs,
 *     which makes the inputs exactly the thing most tempting and least safe to log.
 */

/** The reads a route can report on. A closed union, so a caller cannot label a log with user data. */
export type QueryGroupRead =
  // Assets (C2)
  | "assets"
  | "qr_links"
  | "equipment_pages"
  | "rental_sessions"
  | "open_submissions"
  | "categories"
  | "covered_count"
  | "organization_plan"
  // Submissions inbox (C3)
  | "submissions"
  | "asset_options"
  | "new_count"
  | "total_count"
  | "export_flags";

type SupabaseishError = { code?: string | null } | null | undefined;

/**
 * Record that a non-essential read failed and its data is being treated as absent.
 *
 * Returns void: the caller decides how to degrade. This never throws — a logging failure must not
 * become the page's failure.
 */
export function logQueryFailure(
  route: string,
  read: QueryGroupRead,
  error: SupabaseishError
): void {
  if (!error) return;
  try {
    console.error(
      "[query]",
      JSON.stringify({
        tag: "query",
        route,
        read,
        // Code only. See the module note on why the message is deliberately absent.
        code: typeof error.code === "string" ? error.code : "unknown",
        degraded: true,
      })
    );
  } catch {
    // Never let a logging problem surface as a request problem.
  }
}

/**
 * The essential-read counterpart. Throws so the route segment's `error.tsx` renders, because an empty
 * list is indistinguishable from "this organization has no assets" — a lie the operator cannot detect.
 *
 * The thrown message is fixed and carries no database detail; the code is logged, not surfaced.
 */
export function throwOnEssentialFailure(
  route: string,
  read: QueryGroupRead,
  error: SupabaseishError
): void {
  if (!error) return;
  try {
    console.error(
      "[query]",
      JSON.stringify({
        tag: "query",
        route,
        read,
        code: typeof error.code === "string" ? error.code : "unknown",
        essential: true,
      })
    );
  } catch {
    // fall through to the throw below regardless
  }
  throw new Error(`Essential read failed: ${read}`);
}
