import { describe, expect, it } from "vitest";

import { readSubmissionReference } from "./reference";
import { submissionReference } from "@/lib/submissions/inbox";
import { PLATFORM_NAME } from "@/lib/constants";

describe("readSubmissionReference", () => {
  it("accepts the canonical SUB-YYYY-XXXXXX form", () => {
    expect(readSubmissionReference("SUB-2026-1A2B3C")).toBe("SUB-2026-1A2B3C");
  });

  it("accepts exactly what submissionReference produces (renter === admin)", () => {
    const canonical = submissionReference(
      "2b1f9c4e-0a7d-4b2e-9f10-abc1234f7a2c",
      "2026-03-14T10:00:00Z"
    );
    expect(readSubmissionReference(canonical)).toBe(canonical);
  });

  it("rejects the old last-6 form, garbage, and non-strings", () => {
    expect(readSubmissionReference("SUB-4F7A2C")).toBeNull(); // no year → not canonical
    expect(readSubmissionReference("SUB-2026-1a2b3c")).toBeNull(); // lowercase hex
    expect(readSubmissionReference("SUB-2026-ZZZZZZ")).toBeNull(); // non-hex
    expect(readSubmissionReference("<script>")).toBeNull();
    expect(readSubmissionReference(null)).toBeNull();
    expect(readSubmissionReference(undefined)).toBeNull();
    expect(readSubmissionReference("")).toBeNull();
  });
});

describe("public platform brand", () => {
  it("uses the canonical MuleMark platform name in the footer", () => {
    expect(PLATFORM_NAME).toBe("MuleMark");
  });
});
