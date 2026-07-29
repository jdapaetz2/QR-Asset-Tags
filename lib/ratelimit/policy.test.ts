import { describe, expect, it } from "vitest";

import {
  RATE_LIMITED_MESSAGE,
  RATE_LIMIT_RULES,
  buildBucketKey,
  selectRules,
} from "@/lib/ratelimit/policy";

describe("selectRules", () => {
  it("returns the media-agnostic set for acknowledgement and return", () => {
    expect(selectRules("acknowledgement", false)).toBe(RATE_LIMIT_RULES.acknowledgement);
    expect(selectRules("acknowledgement", true)).toBe(RATE_LIMIT_RULES.acknowledgement);
    expect(selectRules("return", false)).toBe(RATE_LIMIT_RULES.return);
    expect(selectRules("return", true)).toBe(RATE_LIMIT_RULES.return);
  });

  it("branches damage/support on whether media is attached, stricter for media", () => {
    expect(selectRules("damage_support", false)).toBe(RATE_LIMIT_RULES.damage_support_text);
    expect(selectRules("damage_support", true)).toBe(RATE_LIMIT_RULES.damage_support_media);
    // Media burst cap must be <= text burst cap (stricter for storage-bearing writes).
    const textBurst = RATE_LIMIT_RULES.damage_support_text[0].max;
    const mediaBurst = RATE_LIMIT_RULES.damage_support_media[0].max;
    expect(mediaBurst).toBeLessThanOrEqual(textBurst);
  });

  it("every rule set has a short burst window and a longer abuse window", () => {
    for (const rules of Object.values(RATE_LIMIT_RULES)) {
      expect(rules.length).toBeGreaterThanOrEqual(2);
      const windows = rules.map((r) => r.window);
      expect(Math.min(...windows)).toBeLessThanOrEqual(60); // a per-minute burst
      expect(Math.max(...windows)).toBeGreaterThanOrEqual(3600); // an hourly abuse window
    }
  });
});

describe("buildBucketKey", () => {
  it("namespaces by action + hashed IP + hashed short code (never a raw IP)", () => {
    const key = buildBucketKey("damage_support", "abc123iphash", "def456codehash");
    expect(key).toBe("rl:damage_support:abc123iphash:def456codehash");
  });

  it("keys for different actions / short codes are distinct (per-asset isolation)", () => {
    const a = buildBucketKey("return", "ip", "codeA");
    const b = buildBucketKey("return", "ip", "codeB");
    const c = buildBucketKey("acknowledgement", "ip", "codeA");
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("RATE_LIMITED_MESSAGE", () => {
  it("is generic — leaks no asset/organization state", () => {
    const m = RATE_LIMITED_MESSAGE.toLowerCase();
    for (const leak of ["asset", "organization", "org", "not found", "suspended", "private"]) {
      expect(m).not.toContain(leak);
    }
    expect(m).toContain("try again");
  });
});
