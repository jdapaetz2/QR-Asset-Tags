import { describe, expect, it } from "vitest";

import { bulkPendingLabel, loginPendingLabel, statusPendingLabel } from "./pending-labels";

const ALL_STATUSES = ["new", "reviewed", "resolved", "archived"] as const;

describe("statusPendingLabel", () => {
  it("names the specific action for every status an operator can trigger", () => {
    expect(statusPendingLabel("resolved")).toBe("Resolving…");
    expect(statusPendingLabel("archived")).toBe("Archiving…");
    expect(statusPendingLabel("reviewed")).toBe("Marking reviewed…");
    expect(statusPendingLabel("new")).toBe("Reopening…");
  });

  /**
   * Null rather than a generic fallback. An unrecognised target means the button set and this module
   * have drifted; quietly saying "Working…" would hide that, and the caller can still show its own
   * (true) idle label.
   */
  it("returns null for anything it does not recognise", () => {
    for (const bad of ["", "deleted", "RESOLVED", "resolve", "pending"]) {
      expect(statusPendingLabel(bad)).toBeNull();
    }
  });
});

describe("bulkPendingLabel", () => {
  it("states the action and the scope", () => {
    expect(bulkPendingLabel("resolved", 12)).toBe("Resolving 12 submissions…");
    expect(bulkPendingLabel("archived", 3)).toBe("Archiving 3 submissions…");
    expect(bulkPendingLabel("reviewed", 7)).toBe("Marking reviewed 7 submissions…");
  });

  it("gets the singular right", () => {
    expect(bulkPendingLabel("resolved", 1)).toBe("Resolving 1 submission…");
  });

  it("never renders a negative count", () => {
    expect(bulkPendingLabel("resolved", -4)).toBe("Resolving 0 submissions…");
  });

  it("falls back to a truthful generic for an unknown target", () => {
    // Still true — something IS working — and it does not claim an action it cannot name.
    expect(bulkPendingLabel("nonsense", 2)).toBe("Working…");
  });
});

describe("loginPendingLabel", () => {
  it("distinguishes the two sign-in modes, which do different things", () => {
    expect(loginPendingLabel("password")).toBe("Signing in…");
    expect(loginPendingLabel("magic")).toBe("Sending link…");
  });
});

/**
 * The rule that makes this module worth centralising: a pending label describes work IN PROGRESS. The
 * moment one reads "Resolved" or "Archived" it is asserting a server outcome that has not happened —
 * a false optimistic success, which C8 explicitly forbids. This test is what stops that drifting in.
 */
describe("no label ever claims a completed outcome", () => {
  const COMPLETED = [
    "Resolved",
    "Archived",
    "Reviewed submission",
    "Signed in",
    "Sent",
    "Done",
    "Complete",
    "Saved",
  ];

  function assertInProgress(label: string) {
    expect(label.endsWith("…")).toBe(true);
    for (const finished of COMPLETED) {
      expect(label).not.toBe(finished);
    }
    // Past-participle endings that would read as an accomplished fact.
    expect(label).not.toMatch(/\b(resolved|archived|reopened|sent|saved|signed in|completed)\b/i);
  }

  it("single-status labels describe an action under way", () => {
    for (const s of ALL_STATUSES) {
      const label = statusPendingLabel(s);
      expect(label).not.toBeNull();
      assertInProgress(label as string);
    }
  });

  it("bulk labels describe an action under way", () => {
    for (const s of ALL_STATUSES) assertInProgress(bulkPendingLabel(s, 5));
  });

  it("login labels describe an action under way", () => {
    assertInProgress(loginPendingLabel("password"));
    assertInProgress(loginPendingLabel("magic"));
  });
});
