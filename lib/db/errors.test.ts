import { describe, expect, it } from "vitest";

import { formatDbError } from "./errors";

describe("formatDbError (Phase 3C.8.1)", () => {
  it("retains message, code, details, and hint", () => {
    const err = formatDbError("session-browser: session load failed", {
      message: "Could not embed because more than one relationship was found",
      code: "PGRST201",
      details: "two relationships",
      hint: "use a disambiguating hint",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("session-browser: session load failed");
    expect(err.message).toContain("message: Could not embed");
    expect(err.message).toContain("code: PGRST201");
    expect(err.message).toContain("details: two relationships");
    expect(err.message).toContain("hint: use a disambiguating hint");
  });

  it("omits absent fields cleanly", () => {
    const err = formatDbError("ctx", { message: "boom" });
    expect(err.message).toBe("ctx (message: boom)");
    expect(err.message).not.toContain("code:");
    expect(err.message).not.toContain("hint:");
  });

  it("treats null fields as absent", () => {
    const err = formatDbError("ctx", { message: "boom", code: null, details: null, hint: null });
    expect(err.message).toBe("ctx (message: boom)");
  });
});
