import "server-only";

/**
 * Phase C0 — server-side phase timing. **Disabled by default and inert unless explicitly switched on.**
 *
 * WHY THIS EXISTS: browser measurement can say a route's server stream closed in 678 ms, but it cannot
 * say how much of that was auth/profile/org work versus the page's own queries — both happen inside one
 * request, behind one response. The C0 baseline bounded that split but could not isolate it, and a
 * bottleneck you cannot name is one you cannot fix with confidence.
 *
 * WHAT IT IS NOT: not a vendor SDK, not a tracing dependency, not a request-semantics change. It writes
 * one structured console line and returns the value it was given. With the flag off, `time()` awaits the
 * work and returns — no clock reads, no allocation beyond the call itself, no log.
 *
 * PRIVACY: phase names are compile-time constants chosen from the union below. The helper accepts no
 * ids, names, emails, phone numbers, form text, short codes or URLs, and there is no parameter through
 * which a caller could pass one. The only variable data emitted is a route label and a duration.
 *
 * TO ENABLE: set `MULEMARK_DIAGNOSTIC_TIMING=1` in the target environment and redeploy. To retire it,
 * delete this file and its call sites; to keep it dormant, simply leave the variable unset.
 */

/** Phases worth separating. A closed union so a caller cannot invent a label carrying user data. */
export type TimingPhase =
  | "auth.session"
  | "auth.profile"
  | "auth.org_status"
  | "nav.submission_count"
  | "page.primary_queries"
  | "page.secondary_queries"
  | "media.signed_urls"
  | "scan.record"
  | "notify.send"
  | "request.total";

/**
 * Read the flag on every call rather than caching it at module load. Serverless module state outlives a
 * request, so caching would make the flag unturnoffable for the life of a warm instance.
 */
function enabled(): boolean {
  // `.trim()` is not cosmetic. Setting this variable through a shell pipe appends a newline, and on
  // Windows a CRLF — a strict `=== "1"` then silently fails and the diagnostic no-ops while every
  // dashboard and listing shows it "set". That exact failure cost a deploy cycle to find, because an
  // invisible character produces no error, just silence.
  return process.env.MULEMARK_DIAGNOSTIC_TIMING?.trim() === "1";
}

/**
 * Time one phase. Returns exactly what `work` resolves to, so wrapping a call can never change
 * behaviour — including when `work` throws: the rejection propagates untouched, and the phase is logged
 * with `ok: false` so a failing phase is still visible in the timing record.
 */
export async function time<T>(
  route: string,
  phase: TimingPhase,
  work: () => Promise<T>
): Promise<T> {
  if (!enabled()) return work();
  const started = performance.now();
  let ok = true;
  try {
    return await work();
  } catch (err) {
    ok = false;
    throw err;
  } finally {
    const durationMs = Math.round((performance.now() - started) * 10) / 10;
    console.info(
      "[timing]",
      JSON.stringify({ tag: "timing", route, phase, durationMs, ok })
    );
  }
}

/**
 * Mark a whole request. Usage mirrors `time()`; kept separate so the total is greppable on its own and
 * so a route can report a total without every phase being instrumented.
 */
export async function timeRequest<T>(route: string, work: () => Promise<T>): Promise<T> {
  return time(route, "request.total", work);
}

/** Exposed so a test can assert the default-off contract without reaching into process.env directly. */
export const _internal = { enabled };
