import { describe, expect, it } from "vitest";

import { deviceTypeFromUserAgent, hashIp, parseClientIp } from "./scan";

describe("deviceTypeFromUserAgent", () => {
  it("classifies mobile, tablet, desktop, unknown", () => {
    expect(deviceTypeFromUserAgent("iPhone; CPU iPhone OS 17 like Mac")).toBe(
      "mobile"
    );
    expect(deviceTypeFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17)")).toBe("tablet");
    expect(deviceTypeFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64)")).toBe(
      "desktop"
    );
    expect(deviceTypeFromUserAgent(null)).toBe("unknown");
  });
});

describe("parseClientIp", () => {
  it("returns the first address or null", () => {
    expect(parseClientIp("203.0.113.5, 70.41.3.18")).toBe("203.0.113.5");
    expect(parseClientIp("  198.51.100.2 ")).toBe("198.51.100.2");
    expect(parseClientIp(null)).toBeNull();
    expect(parseClientIp("")).toBeNull();
  });
});

describe("hashIp", () => {
  it("is deterministic, salt-sensitive, and never returns the raw IP", () => {
    const a = hashIp("203.0.113.5", "salt1");
    const b = hashIp("203.0.113.5", "salt1");
    const c = hashIp("203.0.113.5", "salt2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203.0.113.5");
    expect(a).toHaveLength(32);
  });

  it("returns null without an IP", () => {
    expect(hashIp(null, "salt")).toBeNull();
  });
});
