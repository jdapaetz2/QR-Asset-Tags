import { describe, expect, it } from "vitest";

import {
  ackPromptStorageKey,
  isCloseStatus,
  isRentalStatus,
  normalizeRentalStart,
  quickStartStorageKey,
  shouldAutoExpandQuickStart,
  shouldShowAckPrompt,
} from "./rentals";

describe("isRentalStatus / isCloseStatus", () => {
  it("validates known statuses", () => {
    expect(isRentalStatus("active")).toBe(true);
    expect(isRentalStatus("returned")).toBe(true);
    expect(isRentalStatus("bogus")).toBe(false);
  });
  it("identifies closing statuses", () => {
    expect(isCloseStatus("returned")).toBe(true);
    expect(isCloseStatus("cancelled")).toBe(true);
    expect(isCloseStatus("active")).toBe(false);
  });
});

describe("normalizeRentalStart", () => {
  it("trims and treats empty as null", () => {
    expect(
      normalizeRentalStart({ rental_reference: "  RA-100 ", renter_label: "" })
    ).toEqual({ rental_reference: "RA-100", renter_label: null });
  });
});

describe("shouldShowAckPrompt", () => {
  it("shows only with an active session that hasn't been handled", () => {
    expect(shouldShowAckPrompt({ hasActiveSession: true, alreadyHandled: false })).toBe(true);
    expect(shouldShowAckPrompt({ hasActiveSession: true, alreadyHandled: true })).toBe(false);
    expect(shouldShowAckPrompt({ hasActiveSession: false, alreadyHandled: false })).toBe(false);
  });
});

describe("ackPromptStorageKey", () => {
  it("includes both asset and session so a new session re-prompts", () => {
    expect(ackPromptStorageKey("a1", "s1")).toBe("ackPrompt:a1:s1");
    expect(ackPromptStorageKey("a1", "s2")).not.toBe(ackPromptStorageKey("a1", "s1"));
  });
});

describe("quickStartStorageKey", () => {
  it("uses a distinct namespace from the ack key and keys on asset + session", () => {
    expect(quickStartStorageKey("a1", "s1")).toBe(
      "mulemark:quick-start-seen:a1:s1"
    );
    // Must not collide with the ack prompt key (different prefix).
    expect(quickStartStorageKey("a1", "s1")).not.toBe(ackPromptStorageKey("a1", "s1"));
    // A new session yields a new key → Quick Start can auto-expand again.
    expect(quickStartStorageKey("a1", "s2")).not.toBe(
      quickStartStorageKey("a1", "s1")
    );
  });
});

describe("shouldAutoExpandQuickStart", () => {
  it("expands only on the first scan of an active session", () => {
    // No active session → collapsed.
    expect(
      shouldAutoExpandQuickStart({ hasActiveSession: false, alreadySeen: false })
    ).toBe(false);
    // First view of an active session → expand.
    expect(
      shouldAutoExpandQuickStart({ hasActiveSession: true, alreadySeen: false })
    ).toBe(true);
    // Already seen this session → collapsed (still manually expandable).
    expect(
      shouldAutoExpandQuickStart({ hasActiveSession: true, alreadySeen: true })
    ).toBe(false);
  });
});
