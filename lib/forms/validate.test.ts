import { describe, expect, it } from "vitest";

import { validateDamageReport } from "./validate";

const base = {
  name: "Sam",
  email: "sam@example.com",
  phone: null,
  urgency: "high",
  description: "Cracked hydraulic line.",
};

describe("validateDamageReport", () => {
  it("accepts a valid report", () => {
    expect(validateDamageReport(base)).toBeNull();
  });

  it("requires name and description", () => {
    expect(validateDamageReport({ ...base, name: "  " })).toMatch(/name/i);
    expect(validateDamageReport({ ...base, description: null })).toMatch(
      /description/i
    );
  });

  it("requires at least one of email/phone", () => {
    expect(
      validateDamageReport({ ...base, email: null, phone: null })
    ).toMatch(/email or a phone/i);
    expect(
      validateDamageReport({ ...base, email: null, phone: "555-0100" })
    ).toBeNull();
  });

  it("validates email format and urgency", () => {
    expect(validateDamageReport({ ...base, email: "nope" })).toMatch(/email/i);
    expect(validateDamageReport({ ...base, urgency: "extreme" })).toMatch(
      /urgency/i
    );
    expect(validateDamageReport({ ...base, urgency: null })).toBeNull();
  });
});
