import { describe, expect, it } from "vitest";

import { validatePassword, MIN_PASSWORD_LENGTH } from "./password";

describe("validatePassword", () => {
  it("accepts a long-enough matching password", () => {
    expect(validatePassword("longenough1", "longenough1")).toEqual({});
  });

  it("rejects a too-short password", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePassword(short, short).error).toMatch(/at least/i);
  });

  it("rejects a mismatch", () => {
    expect(validatePassword("longenough1", "different1").error).toMatch(
      /do not match/i
    );
  });
});
