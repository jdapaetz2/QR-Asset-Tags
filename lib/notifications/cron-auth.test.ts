import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "./cron-auth";

const SECRET = "s".repeat(24) + "0123456789abcdef";

describe("isAuthorizedCronRequest", () => {
  it("accepts exactly `Bearer <secret>`", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["empty header", ""],
    ["the secret without the Bearer prefix", SECRET],
    ["a lowercase scheme", `bearer ${SECRET}`],
    ["a wrong secret of the same length", `Bearer ${"t".repeat(SECRET.length)}`],
    ["a longer value", `Bearer ${SECRET}x`],
    ["a shorter value", `Bearer ${SECRET.slice(1)}`],
  ])("refuses %s", (_label, header) => {
    expect(isAuthorizedCronRequest(header, SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", null)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer anything", null)).toBe(false);
  });
});
