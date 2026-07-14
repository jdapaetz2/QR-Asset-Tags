import { describe, expect, it } from "vitest";

import { staffOutboundState } from "./workflow-state";

describe("staffOutboundState (Phase 3C.7)", () => {
  it("available when not rented", () => {
    expect(staffOutboundState({ rented: false, sessionLoaded: false, hasBaseline: false })).toBe(
      "available"
    );
    // Not-rented always wins, even if stale flags say otherwise.
    expect(staffOutboundState({ rented: false, sessionLoaded: true, hasBaseline: true })).toBe(
      "available"
    );
  });

  it("attach when rented with a loaded session but no baseline", () => {
    expect(staffOutboundState({ rented: true, sessionLoaded: true, hasBaseline: false })).toBe(
      "attach"
    );
  });

  it("recorded when rented with a loaded session and an existing baseline", () => {
    expect(staffOutboundState({ rented: true, sessionLoaded: true, hasBaseline: true })).toBe(
      "recorded"
    );
  });

  it("error when rented but the session row could not be loaded", () => {
    expect(staffOutboundState({ rented: true, sessionLoaded: false, hasBaseline: false })).toBe(
      "error"
    );
  });
});
