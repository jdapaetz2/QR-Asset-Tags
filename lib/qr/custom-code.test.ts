import { describe, expect, it } from "vitest";

import {
  CUSTOM_CODE_MAX,
  CUSTOM_CODE_MIN,
  RESERVED_SHORT_CODES,
  normalizeCustomShortCode,
  validateCustomShortCode,
} from "./custom-code";

describe("normalizeCustomShortCode", () => {
  it("trims and lowercases", () => {
    expect(normalizeCustomShortCode("  Meter-204  ")).toBe("meter-204");
    expect(normalizeCustomShortCode("EXCAVATOR")).toBe("excavator");
  });
});

describe("validateCustomShortCode", () => {
  it("accepts a normalized url-safe code", () => {
    expect(validateCustomShortCode("meter-204")).toEqual({ code: "meter-204" });
    expect(validateCustomShortCode("  Excavator-17 ")).toEqual({ code: "excavator-17" });
    expect(validateCustomShortCode("abcd")).toEqual({ code: "abcd" });
  });

  it("enforces the length bounds", () => {
    expect(validateCustomShortCode("ab")).toHaveProperty("error"); // < min
    expect(validateCustomShortCode("a".repeat(CUSTOM_CODE_MIN))).toEqual({
      code: "a".repeat(CUSTOM_CODE_MIN),
    });
    expect(validateCustomShortCode("a".repeat(CUSTOM_CODE_MAX))).toEqual({
      code: "a".repeat(CUSTOM_CODE_MAX),
    });
    expect(validateCustomShortCode("a".repeat(CUSTOM_CODE_MAX + 1))).toHaveProperty(
      "error"
    );
  });

  it("rejects leading/trailing and consecutive hyphens", () => {
    expect(validateCustomShortCode("-meter")).toHaveProperty("error");
    expect(validateCustomShortCode("meter-")).toHaveProperty("error");
    expect(validateCustomShortCode("me--ter")).toHaveProperty("error");
  });

  it("rejects non-url-safe characters and whitespace within", () => {
    expect(validateCustomShortCode("Meter 204")).toHaveProperty("error"); // inner space
    expect(validateCustomShortCode("meter_204")).toHaveProperty("error"); // underscore
    expect(validateCustomShortCode("méter")).toHaveProperty("error"); // accent
    expect(validateCustomShortCode("meter/204")).toHaveProperty("error"); // slash
    // Uppercase is normalized to lowercase, so it is accepted (not an error).
    expect(validateCustomShortCode("METER204")).toEqual({ code: "meter204" });
  });

  it("rejects the empty string", () => {
    expect(validateCustomShortCode("   ")).toHaveProperty("error");
  });

  it("rejects every reserved word", () => {
    for (const word of RESERVED_SHORT_CODES) {
      const result = validateCustomShortCode(word.toUpperCase());
      expect(result).toHaveProperty("error");
    }
  });
});
