import { describe, expect, it } from "vitest";

import {
  validateDamageReport,
  validateReturnChecklist,
  validateSupportRequest,
} from "./validate";

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

describe("validateSupportRequest", () => {
  const support = {
    name: "Sam",
    email: "sam@example.com",
    phone: null,
    preferred_contact_method: "email",
    description: "Won't start.",
  };

  it("accepts a valid request", () => {
    expect(validateSupportRequest(support)).toBeNull();
  });

  it("requires name, description, and a contact", () => {
    expect(validateSupportRequest({ ...support, name: null })).toMatch(/name/i);
    expect(validateSupportRequest({ ...support, description: " " })).toMatch(
      /issue/i
    );
    expect(
      validateSupportRequest({ ...support, email: null, phone: null })
    ).toMatch(/email or a phone/i);
  });

  it("validates email and preferred contact method", () => {
    expect(validateSupportRequest({ ...support, email: "bad" })).toMatch(/email/i);
    expect(
      validateSupportRequest({ ...support, preferred_contact_method: "carrier-pigeon" })
    ).toMatch(/contact method/i);
    expect(
      validateSupportRequest({ ...support, preferred_contact_method: null })
    ).toBeNull();
  });
});

describe("validateReturnChecklist", () => {
  const ret = {
    name: null,
    email: null,
    phone: null,
    condition_notes: null,
    fuel_or_charge_level: null,
    cleaned: "yes",
    accessories_returned: "no",
    damage_observed: "no",
  };

  it("accepts a valid checklist with no contact info (contact is optional)", () => {
    expect(validateReturnChecklist(ret)).toBeNull();
  });

  it("validates email when provided and the yes/no answers", () => {
    expect(validateReturnChecklist({ ...ret, email: "nope" })).toMatch(/email/i);
    expect(validateReturnChecklist({ ...ret, cleaned: "maybe" })).toMatch(
      /yes\/no/i
    );
  });
});
