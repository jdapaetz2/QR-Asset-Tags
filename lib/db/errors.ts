/**
 * Format a PostgREST/Supabase error into a normal `Error` that RETAINS the diagnostic fields (Phase 3C.8.1).
 *
 * PostgREST errors carry `message`, `code`, `details`, and `hint` — the last three are exactly what identifies an
 * ambiguous embedded relationship, a missing column, a policy failure, or an invalid filter. Passing the raw error
 * object to `console.error("…", err)` serialized to `{}` in the dev overlay, and throwing an Error built only from
 * `.message` dropped the rest. This concatenates every present field into the Error message so server logs + the
 * dev error boundary keep enough to diagnose. Not shown in normal production UI (the generic error boundary is).
 */

export type DbError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function formatDbError(context: string, error: DbError): Error {
  const parts = [
    `message: ${error.message}`,
    error.code ? `code: ${error.code}` : null,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ].filter(Boolean);
  return new Error(`${context} (${parts.join(", ")})`);
}
