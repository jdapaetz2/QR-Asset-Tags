import { describe, expect, it } from "vitest";

import { firstNameFrom } from "./name";

describe("firstNameFrom", () => {
  it("takes the first token of a full name", () => {
    expect(firstNameFrom("Josh Hartley")).toBe("Josh");
    expect(firstNameFrom("  Marcus  Reyes ")).toBe("Marcus");
  });

  it("falls back to a capitalized email local-part", () => {
    expect(firstNameFrom(null, "josh@northridge.example")).toBe("Josh");
    expect(firstNameFrom("", "dispatch@x.io")).toBe("Dispatch");
  });

  it("returns a neutral default when nothing is usable", () => {
    expect(firstNameFrom(null, null)).toBe("there");
    expect(firstNameFrom("   ", "")).toBe("there");
  });
});
