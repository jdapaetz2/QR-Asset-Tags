import { describe, expect, it } from "vitest";

import { formatSubmissionReference } from "./reference";

describe("formatSubmissionReference", () => {
  it("derives SUB-<last 6 hex, uppercased> from a UUID", () => {
    expect(formatSubmissionReference("2b1f9c4e-0a7d-4b2e-9f10-abc1234f7a2c")).toBe(
      "SUB-4F7A2C"
    );
  });

  it("ignores non-hex separators when taking the last 6", () => {
    expect(formatSubmissionReference("0000-0000-0000-00ab-cdef")).toBe("SUB-ABCDEF");
  });

  it("returns null for missing / too-short / non-string input", () => {
    expect(formatSubmissionReference(null)).toBeNull();
    expect(formatSubmissionReference(undefined)).toBeNull();
    expect(formatSubmissionReference("")).toBeNull();
    expect(formatSubmissionReference("abc")).toBeNull();
    expect(formatSubmissionReference("xyz-!!!")).toBeNull();
  });
});
