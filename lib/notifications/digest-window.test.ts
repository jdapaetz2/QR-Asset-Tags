import { describe, expect, it } from "vitest";

import {
  DIGEST_MAX_LOOKBACK_DAYS,
  digestSlot,
  digestWindow,
  formatPacific,
  pacificParts,
  pacificWallTimeToUtc,
} from "./digest-window";

const at = (iso: string) => new Date(iso);
const DAY_MS = 24 * 60 * 60 * 1000;

describe("the two once-daily UTC slots (Vercel Hobby fires anywhere within the scheduled hour)", () => {
  it("summer (PDT): the 13:00 UTC slot is the 6 AM Pacific hour at any minute; 14:00 UTC is 7 AM", () => {
    for (const time of ["13:00:00", "13:31:12", "13:59:59"]) {
      expect(digestSlot(at(`2026-07-15T${time}Z`))).toMatchObject({ inWindow: true, pacificHour: 6, pacificDate: "2026-07-15" });
    }
    expect(digestSlot(at("2026-07-15T14:00:00Z"))).toEqual({ inWindow: false, pacificDate: "2026-07-15", pacificHour: 7 });
    expect(digestSlot(at("2026-07-15T14:59:59Z")).inWindow).toBe(false);
  });

  it("winter (PST): the 14:00 UTC slot is the 6 AM Pacific hour; 13:00 UTC is 5 AM", () => {
    for (const time of ["14:00:00", "14:45:00", "14:59:59"]) {
      expect(digestSlot(at(`2026-01-15T${time}Z`))).toMatchObject({ inWindow: true, pacificHour: 6, pacificDate: "2026-01-15" });
    }
    expect(digestSlot(at("2026-01-15T13:30:00Z"))).toEqual({ inWindow: false, pacificDate: "2026-01-15", pacificHour: 5 });
  });

  it("on every date of 2026 exactly one of the two slots proceeds", () => {
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1) + day * DAY_MS).toISOString().slice(0, 10);
      const early = digestSlot(at(`${date}T13:30:00Z`)).inWindow;
      const late = digestSlot(at(`${date}T14:30:00Z`)).inWindow;
      expect([early, late].filter(Boolean), `${date}`).toHaveLength(1);
    }
  });

  it("on the spring-forward date (2026-03-08) the 13:00 UTC slot runs", () => {
    expect(digestSlot(at("2026-03-08T13:30:00Z")).inWindow).toBe(true);
    expect(digestSlot(at("2026-03-08T14:30:00Z")).inWindow).toBe(false);
    expect(digestSlot(at("2026-03-07T14:30:00Z")).inWindow).toBe(true);
  });

  it("on a historical fall-back date (2025-11-02) the 14:00 UTC slot runs", () => {
    expect(digestSlot(at("2025-11-02T14:30:00Z")).inWindow).toBe(true);
    expect(digestSlot(at("2025-11-02T13:30:00Z")).inWindow).toBe(false);
    expect(digestSlot(at("2025-11-01T13:30:00Z")).inWindow).toBe(true);
  });

  /**
   * Follows whatever offset the runtime's time-zone database gives `America/Vancouver` (British Columbia may stay on
   * daylight time), so the assertion is the invariant, not a hard-coded change date: on every candidate change date one
   * slot proceeds and its cutoff is 06:00 local.
   */
  it.each(["2026-03-08", "2026-11-01", "2027-03-14", "2027-11-07"])(
    "%s: exactly one slot proceeds and its cutoff is 6:00 AM local",
    (date) => {
      const slots = [digestSlot(at(`${date}T13:30:00Z`)), digestSlot(at(`${date}T14:30:00Z`))];
      const inWindow = slots.filter((slot) => slot.inWindow);
      expect(inWindow).toHaveLength(1);
      const slot = inWindow[0];
      if (!slot.inWindow) throw new Error("unreachable");
      expect(pacificParts(slot.cutoff)).toMatchObject({ date, hour: 6, minute: 0 });
    }
  );

  it("the cutoff is 06:00 Pacific regardless of the minute the slot fired, so duplicate deliveries share a window", () => {
    const early = digestSlot(at("2026-07-15T13:02:00Z"));
    const late = digestSlot(at("2026-07-15T13:58:00Z"));
    expect(early.inWindow && early.cutoff.toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(late.inWindow && late.cutoff.toISOString()).toBe("2026-07-15T13:00:00.000Z");
    const winter = digestSlot(at("2026-01-15T14:10:00Z"));
    expect(winter.inWindow && winter.cutoff.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
});

describe("pacificWallTimeToUtc / pacificParts", () => {
  it("follows the time-zone database in both seasons and on historical change dates", () => {
    expect(pacificWallTimeToUtc(2026, 7, 15, 6).toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(pacificWallTimeToUtc(2026, 1, 15, 6).toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(pacificWallTimeToUtc(2026, 3, 8, 6).toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(pacificWallTimeToUtc(2025, 11, 2, 6).toISOString()).toBe("2025-11-02T14:00:00.000Z");
  });

  it("always lands on 6:00 AM local, whatever offset applies", () => {
    for (let day = 0; day < 730; day += 3) {
      const d = new Date(Date.UTC(2026, 0, 1) + day * DAY_MS);
      const utc = pacificWallTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 6);
      expect(pacificParts(utc), d.toISOString()).toMatchObject({ hour: 6, minute: 0 });
    }
  });

  it("reports the Pacific date across the UTC day boundary", () => {
    expect(pacificParts(at("2026-07-16T02:00:00Z"))).toMatchObject({ date: "2026-07-15", hour: 19 });
  });
});

describe("digestWindow — catch-up", () => {
  const cutoff = at("2026-07-15T13:00:00.000Z");

  it("first run covers the previous 24 hours", () => {
    expect(digestWindow(cutoff, null)).toEqual({ start: at("2026-07-14T13:00:00.000Z"), end: cutoff, clamped: false });
  });

  it("starts at the last successful summary, so a missed or failed day is included — late, never dropped", () => {
    const lastSuccess = at("2026-07-12T13:00:00.000Z");
    expect(digestWindow(cutoff, lastSuccess)).toEqual({ start: lastSuccess, end: cutoff, clamped: false });
  });

  it("with no success yet, resumes from the first failed attempt's own start instead of dropping it", () => {
    const firstAttemptStart = at("2026-07-13T13:00:00.000Z");
    expect(digestWindow(cutoff, null, firstAttemptStart)).toEqual({ start: firstAttemptStart, end: cutoff, clamped: false });
    // A success always wins over an older failed attempt.
    const lastSuccess = at("2026-07-14T13:00:00.000Z");
    expect(digestWindow(cutoff, lastSuccess, firstAttemptStart)?.start).toEqual(lastSuccess);
  });

  it("returns null when this cutoff was already summarized (duplicate invocation)", () => {
    expect(digestWindow(cutoff, cutoff)).toBeNull();
    expect(digestWindow(cutoff, at("2026-07-16T13:00:00.000Z"))).toBeNull();
  });

  it(`never lists further back than ${DIGEST_MAX_LOOKBACK_DAYS} days`, () => {
    const window = digestWindow(cutoff, at("2026-01-01T14:00:00.000Z"));
    expect(window?.clamped).toBe(true);
    expect(window?.start.toISOString()).toBe(new Date(cutoff.getTime() - DIGEST_MAX_LOOKBACK_DAYS * DAY_MS).toISOString());
  });
});

describe("formatPacific", () => {
  it("renders Pacific wall time with plain spaces", () => {
    const text = formatPacific(at("2026-07-15T13:00:00.000Z"));
    expect(text).toContain("6:00");
    expect(text).toContain("AM");
    expect(text).not.toMatch(/[  ]/);
  });
});
