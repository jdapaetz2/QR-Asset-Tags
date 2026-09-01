import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCTION_ORIGIN,
  assertSmokeTarget,
  classifySmokeTarget,
  normalizeOrigin,
} from "./smoke-target.mjs";

const STAGING = "https://qr-asset-tags-git-pilot-credibility-jdapaetz2-s-projects.vercel.app";

describe("classifySmokeTarget", () => {
  it("recognises the canonical production origin", () => {
    expect(classifySmokeTarget(CANONICAL_PRODUCTION_ORIGIN).target).toBe("production");
    expect(classifySmokeTarget("https://mulemark.io/t/abc").target).toBe("production");
  });

  it("recognises Vercel preview hosts as staging", () => {
    expect(classifySmokeTarget(STAGING).target).toBe("staging");
    expect(classifySmokeTarget("https://anything.vercel.app").target).toBe("staging");
  });

  it("recognises loopback as local", () => {
    expect(classifySmokeTarget("http://localhost:3000").target).toBe("local");
    expect(classifySmokeTarget("http://127.0.0.1:3100").target).toBe("local");
  });

  /**
   * The whole point of the module. An unfamiliar public host is far likelier to be production (an
   * apex alias, `www`, a future custom domain) than a test environment, so it must never be treated
   * as safe to write to.
   */
  it("fails closed to production for any unrecognised public host", () => {
    expect(classifySmokeTarget("https://www.mulemark.io").target).toBe("production");
    expect(classifySmokeTarget("https://getmulemark.com").target).toBe("production");
    expect(classifySmokeTarget("https://mulemark.ca").target).toBe("production");
    expect(classifySmokeTarget("https://something-unknown.example").target).toBe("production");
  });

  it("returns unknown only for an unparseable URL", () => {
    expect(classifySmokeTarget("not a url").target).toBe("unknown");
    expect(classifySmokeTarget("").target).toBe("unknown");
  });

  it("is not fooled by a preview host that merely contains the production name", () => {
    expect(classifySmokeTarget("https://mulemark.io.vercel.app").target).toBe("staging");
  });
});

describe("normalizeOrigin", () => {
  it("strips path and trailing slash and lowercases", () => {
    expect(normalizeOrigin("https://MuleMark.io/t/abc/")).toBe("https://mulemark.io");
  });
  it("returns null for junk", () => {
    expect(normalizeOrigin("nope")).toBeNull();
  });
});

describe("assertSmokeTarget — crossover protection", () => {
  it("allows each runner its own environment", () => {
    expect(assertSmokeTarget("production", CANONICAL_PRODUCTION_ORIGIN).target).toBe("production");
    expect(assertSmokeTarget("staging", STAGING).target).toBe("staging");
  });

  /** The acceptance check: crossover is refused before the first request, in both directions. */
  it("refuses staging smoke pointed at production", () => {
    expect(() => assertSmokeTarget("staging", CANONICAL_PRODUCTION_ORIGIN)).toThrow(/refusing to run STAGING/i);
  });

  it("refuses production smoke pointed at a preview URL", () => {
    expect(() => assertSmokeTarget("production", STAGING)).toThrow(/refusing to run PRODUCTION/i);
  });

  it("refuses production smoke pointed at localhost", () => {
    expect(() => assertSmokeTarget("production", "http://localhost:3000")).toThrow(/refusing to run PRODUCTION/i);
  });

  it("refuses either runner with no URL at all, rather than defaulting", () => {
    expect(() => assertSmokeTarget("staging", "")).toThrow(/no base URL/i);
    expect(() => assertSmokeTarget("production", "")).toThrow(/no base URL/i);
  });

  /**
   * Belt and braces on top of the target check: even a URL that somehow classified as staging must not
   * be a permanent, tag-safe origin — a QA scan there would be indistinguishable from a real tag scan.
   */
  it("refuses staging smoke against any tag-safe origin", () => {
    expect(() => assertSmokeTarget("staging", "https://tags.example.org")).toThrow();
  });

  it("refuses production smoke over plain http", () => {
    expect(() => assertSmokeTarget("production", "http://mulemark.io")).toThrow(/non-https/i);
  });

  it("rejects an unknown mode rather than guessing", () => {
    expect(() => assertSmokeTarget("prod", CANONICAL_PRODUCTION_ORIGIN)).toThrow(/unknown smoke target/i);
  });

  it("never puts anything but the host in the message", () => {
    try {
      assertSmokeTarget("production", `${STAGING}?token=super-secret-value`);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.message).not.toContain("super-secret-value");
      expect(err.message).toContain("vercel.app");
    }
  });
});
