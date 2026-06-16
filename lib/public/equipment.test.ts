import { describe, expect, it } from "vitest";

import { resolveSupportContact } from "./equipment";

describe("resolveSupportContact", () => {
  it("prefers the asset override, then falls back to the org", () => {
    expect(
      resolveSupportContact(
        { support_phone_override: "111", support_email_override: null },
        { support_phone: "999", support_email: "org@x.com" }
      )
    ).toEqual({ phone: "111", email: "org@x.com" });
  });

  it("uses org values when no overrides", () => {
    expect(
      resolveSupportContact(
        { support_phone_override: null, support_email_override: null },
        { support_phone: "999", support_email: "org@x.com" }
      )
    ).toEqual({ phone: "999", email: "org@x.com" });
  });

  it("returns nulls when nothing is set", () => {
    expect(resolveSupportContact(null, null)).toEqual({
      phone: null,
      email: null,
    });
  });
});
