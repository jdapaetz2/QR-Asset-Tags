/**
 * Engineering Phase D3B — when the daily return-exceptions summary runs and which period it covers. Pure, no I/O;
 * every function takes the instant it reasons about, so tests inject any clock.
 *
 * The requirement is one summary per Pacific calendar day in the 6:00–6:59 AM `America/Vancouver` hour, safe across
 * daylight-saving changes. Vercel Hobby cron schedules are UTC and fire anywhere within their hour, so two schedules
 * call the same route — 13:00 UTC (6 AM PDT) and 14:00 UTC (6 AM PST) — and only the invocation whose Pacific hour is
 * 6 proceeds. DST changes happen at 2 AM local, so on every date exactly one slot passes (design §9.6).
 */

export const DIGEST_TIME_ZONE = "America/Vancouver";
export const DIGEST_LOCAL_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A backlog is never listed further back than this (e.g. a summary turned back on after months off). */
export const DIGEST_MAX_LOOKBACK_DAYS = 14;

export type PacificParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** `YYYY-MM-DD` in Pacific time — a safe, bounded log/key value. */
  date: string;
};

const PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DIGEST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function pacificParts(instant: Date): PacificParts {
  const parts = Object.fromEntries(
    PARTS_FORMAT.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * The UTC instant of a Pacific wall-clock time. Unambiguous for 6 AM (DST changes happen at 2 AM). Iterates on the
 * offset rather than hard-coding PST/PDT, so it follows the time-zone database.
 */
export function pacificWallTimeToUtc(year: number, month: number, day: number, hour: number): Date {
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = pacificParts(new Date(guess));
    const diff = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export type DigestSlot =
  | { inWindow: false; pacificDate: string; pacificHour: number }
  | { inWindow: true; pacificDate: string; pacificHour: number; cutoff: Date };

/** Whether `now` is inside the 6 AM Pacific hour, and if so today's 6:00 AM Pacific cutoff. */
export function digestSlot(now: Date): DigestSlot {
  const p = pacificParts(now);
  if (p.hour !== DIGEST_LOCAL_HOUR) return { inWindow: false, pacificDate: p.date, pacificHour: p.hour };
  return {
    inWindow: true,
    pacificDate: p.date,
    pacificHour: p.hour,
    cutoff: pacificWallTimeToUtc(p.year, p.month, p.day, DIGEST_LOCAL_HOUR),
  };
}

export type DigestWindow = { start: Date; end: Date; clamped: boolean };

/**
 * The period a run covers, ending at this cutoff (inclusive):
 *   - after a successful summary: from that summary's cutoff (exclusive) — so any failed or missed day since is
 *     included;
 *   - with no success yet but an earlier attempt (failed or stuck): from that first attempt's own start, so a failed
 *     first-ever run is retried rather than dropped;
 *   - otherwise: the previous 24 hours.
 * Never earlier than DIGEST_MAX_LOOKBACK_DAYS. Null when this cutoff was already summarized successfully.
 */
export function digestWindow(
  cutoff: Date,
  lastSuccessfulEnd: Date | null,
  firstAttemptStart: Date | null = null
): DigestWindow | null {
  if (lastSuccessfulEnd && lastSuccessfulEnd.getTime() >= cutoff.getTime()) return null;
  const floor = cutoff.getTime() - DIGEST_MAX_LOOKBACK_DAYS * DAY_MS;
  const wanted = lastSuccessfulEnd
    ? lastSuccessfulEnd.getTime()
    : firstAttemptStart && firstAttemptStart.getTime() < cutoff.getTime()
      ? firstAttemptStart.getTime()
      : cutoff.getTime() - DAY_MS;
  return {
    start: new Date(Math.max(wanted, floor)),
    end: cutoff,
    clamped: wanted < floor,
  };
}

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: DIGEST_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** e.g. "Thu, Sep 10, 6:00 AM" — Pacific wall time for the summary's covered period. */
export function formatPacific(instant: Date): string {
  // Newer ICU puts a narrow no-break space (U+202F) before AM/PM; normalize it for plain-text mail clients.
  return DISPLAY_FORMAT.format(instant).replace(/[  ]/g, " ");
}
