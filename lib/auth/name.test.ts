import { describe, expect, it } from "vitest";

import { firstNameFrom, firstNameToken, initialsFrom } from "./name";

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

describe("firstNameToken", () => {
  it("returns the first token, or null when there is no name", () => {
    expect(firstNameToken("Josh Hartley")).toBe("Josh");
    expect(firstNameToken("  Marcus ")).toBe("Marcus");
    expect(firstNameToken(null)).toBeNull();
    expect(firstNameToken("   ")).toBeNull();
  });
});

describe("initialsFrom", () => {
  it("uses first+last initials, then a single token, then email", () => {
    expect(initialsFrom("Josh Hartley")).toBe("JH");
    expect(initialsFrom("Josh")).toBe("JO");
    expect(initialsFrom(null, "dispatch@x.io")).toBe("DI");
    expect(initialsFrom(null, null)).toBe("?");
  });
});
