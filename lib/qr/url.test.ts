import { describe, expect, it } from "vitest";

import { buildPublicQrUrl } from "./url";

describe("buildPublicQrUrl", () => {
  it("joins base and short_code at /t/", () => {
    expect(buildPublicQrUrl("https://example.com", "demo-ex017")).toBe(
      "https://example.com/t/demo-ex017"
    );
  });

  it("strips trailing slashes from the base", () => {
    expect(buildPublicQrUrl("https://example.com/", "abc")).toBe(
      "https://example.com/t/abc"
    );
    expect(buildPublicQrUrl("http://localhost:3000//", "abc")).toBe(
      "http://localhost:3000/t/abc"
    );
  });
});
