import { describe, expect, it } from "vitest";

import {
  ACKNOWLEDGEMENT_STATEMENT,
  validateAcknowledgement,
} from "./acknowledgements";

describe("validateAcknowledgement", () => {
  it("requires a name", () => {
    expect(validateAcknowledgement({ name: null, acknowledged: true })).toMatch(
      /name/i
    );
  });

  it("requires the checkbox to be checked", () => {
    expect(
      validateAcknowledgement({ name: "Jamie", acknowledged: false })
    ).toMatch(/acknowledge/i);
  });

  it("passes with a name and a checked box", () => {
    expect(
      validateAcknowledgement({ name: "Jamie", acknowledged: true })
    ).toBeNull();
  });
});

describe("ACKNOWLEDGEMENT_STATEMENT", () => {
  it("mentions instructions, safety, and support", () => {
    expect(ACKNOWLEDGEMENT_STATEMENT).toMatch(/instructions/i);
    expect(ACKNOWLEDGEMENT_STATEMENT).toMatch(/safety/i);
    expect(ACKNOWLEDGEMENT_STATEMENT).toMatch(/support/i);
  });
});
