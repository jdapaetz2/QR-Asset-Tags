import { describe, expect, it } from "vitest";

import { callNowContact, confirmationUrl, readCallNowFlag } from "./confirmation";

describe("callNowContact", () => {
  it("keeps the visible number and normalizes the tel: URI", () => {
    expect(callNowContact({ phone: "(604) 555-0100", email: null })).toEqual({
      label: "(604) 555-0100",
      href: "tel:6045550100",
    });
    expect(callNowContact({ phone: " +1 604 555 0100 ext 4 ", email: null })).toEqual({
      label: "+1 604 555 0100 ext 4",
      href: "tel:+16045550100",
    });
  });

  it("returns null for a missing or unusable phone, so no broken button renders", () => {
    expect(callNowContact({ phone: null, email: "help@yard.test" })).toBeNull();
    expect(callNowContact({ phone: "call the office", email: null })).toBeNull();
    expect(callNowContact({ phone: "   ", email: null })).toBeNull();
  });
});

describe("readCallNowFlag", () => {
  it("is true only for exactly '1'", () => {
    expect(readCallNowFlag("1")).toBe(true);
    for (const value of ["0", "true", "", undefined, ["1"]]) expect(readCallNowFlag(value)).toBe(false);
  });
});

describe("confirmationUrl", () => {
  it("adds the display-only flag only when asked", () => {
    expect(confirmationUrl("/forms/x/damage/thanks", "SUB-2026-ABCDEF", true)).toBe(
      "/forms/x/damage/thanks?ref=SUB-2026-ABCDEF&call=1"
    );
    expect(confirmationUrl("/forms/x/damage/thanks", "SUB-2026-ABCDEF", false)).toBe(
      "/forms/x/damage/thanks?ref=SUB-2026-ABCDEF"
    );
  });
});
