import { describe, expect, it } from "vitest";

import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  shortCodeFromBytes,
} from "./short-code";

describe("shortCodeFromBytes", () => {
  it("produces a code of the expected length", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(shortCodeFromBytes(bytes)).toHaveLength(SHORT_CODE_LENGTH);
  });

  it("uses only the safe alphabet", () => {
    const bytes = new Uint8Array([255, 254, 200, 130, 64, 33, 7, 99]);
    for (const ch of shortCodeFromBytes(bytes)) {
      expect(SHORT_CODE_ALPHABET).toContain(ch);
    }
    // No ambiguous characters.
    expect(shortCodeFromBytes(bytes)).not.toMatch(/[01loi]/);
  });

  it("is deterministic for the same bytes", () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(shortCodeFromBytes(bytes)).toBe(shortCodeFromBytes(bytes));
  });
});
