import { describe, expect, it } from "vitest";

import {
  canQuickResolveReturn,
  returnActionOutcome,
  returnChecklistFlags,
  returnDoneMessage,
} from "./returns";

describe("canQuickResolveReturn", () => {
  it("is true only for an unresolved return checklist", () => {
    expect(canQuickResolveReturn({ formType: "return_checklist", status: "new" })).toBe(true);
    expect(
      canQuickResolveReturn({ formType: "return_checklist", status: "reviewed" })
    ).toBe(true);
  });

  it("is false for a resolved/archived return or the wrong form type", () => {
    expect(
      canQuickResolveReturn({ formType: "return_checklist", status: "resolved" })
    ).toBe(false);
    expect(
      canQuickResolveReturn({ formType: "return_checklist", status: "archived" })
    ).toBe(false);
    expect(canQuickResolveReturn({ formType: "damage_report", status: "new" })).toBe(false);
    expect(canQuickResolveReturn({ formType: "support_request", status: "new" })).toBe(false);
  });
});

describe("returnChecklistFlags", () => {
  it("flags observed damage", () => {
    expect(returnChecklistFlags({ damage_observed: "yes" })).toEqual({
      damage: true,
      missing: false,
      flagged: true,
    });
  });

  it("flags missing accessories", () => {
    expect(returnChecklistFlags({ accessories_returned: "no" })).toEqual({
      damage: false,
      missing: true,
      flagged: true,
    });
  });

  it("does not flag a clean return", () => {
    expect(
      returnChecklistFlags({ damage_observed: "no", accessories_returned: "yes" })
    ).toEqual({ damage: false, missing: false, flagged: false });
  });

  it("treats null / non-object data as no flags", () => {
    expect(returnChecklistFlags(null).flagged).toBe(false);
    expect(returnChecklistFlags(undefined).flagged).toBe(false);
    expect(returnChecklistFlags("nope").flagged).toBe(false);
    expect(returnChecklistFlags({ damage_observed: null }).flagged).toBe(false);
  });
});

describe("returnActionOutcome", () => {
  it("maps a completed return to the returned banner", () => {
    expect(returnActionOutcome("returned")).toEqual({
      ok: true,
      done: "returned",
      message: "Asset marked returned and checklist resolved.",
    });
  });

  it("maps resolved-only / already-resolved to the already-available banner", () => {
    for (const code of ["resolved_only", "already_resolved"]) {
      expect(returnActionOutcome(code)).toEqual({
        ok: true,
        done: "already",
        message: "Checklist resolved. Asset was already available.",
      });
    }
  });

  it("maps rejection codes to an error", () => {
    expect(returnActionOutcome("not_return").ok).toBe(false);
    expect(returnActionOutcome("not_found").ok).toBe(false);
    expect(returnActionOutcome("something_unexpected").ok).toBe(false);
  });
});

describe("returnDoneMessage", () => {
  it("returns the banner text for each done flag, else null", () => {
    expect(returnDoneMessage("returned")).toBe(
      "Asset marked returned and checklist resolved."
    );
    expect(returnDoneMessage("already")).toBe(
      "Checklist resolved. Asset was already available."
    );
    expect(returnDoneMessage(undefined)).toBeNull();
    expect(returnDoneMessage("bogus")).toBeNull();
  });
});
