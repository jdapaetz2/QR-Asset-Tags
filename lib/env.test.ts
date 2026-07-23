import { afterEach, describe, expect, it } from "vitest";
import {
  _internal,
  publicEnv,
  serverEnv,
  deploymentContext,
  isPlaceholderHost,
  normalizeSiteOrigin,
  SCAN_IP_HASH_SALT_MIN_LENGTH,
} from "./env";

describe("env", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns a present variable", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(publicEnv.supabaseUrl).toBe("https://example.supabase.co");
  });

  it("throws a clear error when a required variable is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => publicEnv.supabaseAnonKey).toThrowError(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/
    );
  });

  it("treats an empty string as missing", () => {
    expect(() => _internal.requireEnv("DEFINITELY_UNSET_VAR_XYZ")).toThrowError(
      /DEFINITELY_UNSET_VAR_XYZ/
    );
  });
});

describe("deploymentContext", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("maps VERCEL_ENV to the context, defaulting to development", () => {
    process.env.VERCEL_ENV = "production";
    expect(deploymentContext()).toBe("production");
    process.env.VERCEL_ENV = "preview";
    expect(deploymentContext()).toBe("preview");
    delete process.env.VERCEL_ENV;
    expect(deploymentContext()).toBe("development");
    process.env.VERCEL_ENV = "something-else";
    expect(deploymentContext()).toBe("development");
  });
});

describe("normalizeSiteOrigin", () => {
  it("reduces to a canonical lowercase origin with no trailing slash or path", () => {
    expect(normalizeSiteOrigin("https://Tags.Example.com/")).toBe("https://tags.example.com");
    expect(normalizeSiteOrigin("https://tags.example.com/anything/here")).toBe("https://tags.example.com");
    expect(normalizeSiteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("throws on a non-URL value", () => {
    expect(() => normalizeSiteOrigin("not a url")).toThrowError(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe("isPlaceholderHost", () => {
  it("flags localhost/placeholder hosts", () => {
    for (const h of ["localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "placeholder.local"]) {
      expect(isPlaceholderHost(h)).toBe(true);
    }
  });
  it("passes a real host", () => {
    expect(isPlaceholderHost("tags.northridge-rentals.com")).toBe(false);
  });
});

describe("publicEnv.siteUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("normalizes to a canonical origin in development", () => {
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000/";
    expect(publicEnv.siteUrl).toBe("http://localhost:3000");
  });

  it("rejects http in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "http://tags.example-rentals.com";
    expect(() => publicEnv.siteUrl).toThrowError(/https in production/);
  });

  it("rejects a placeholder/localhost host in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://localhost";
    expect(() => publicEnv.siteUrl).toThrowError(/real production host/);
  });

  it("accepts a real https host in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://tags.northridge-rentals.com";
    expect(publicEnv.siteUrl).toBe("https://tags.northridge-rentals.com");
  });
});

describe("serverEnv.scanIpHashSalt", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("fails soft in development (returns empty when unset)", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.SCAN_IP_HASH_SALT;
    expect(serverEnv.scanIpHashSalt).toBe("");
  });

  it("fails closed in production/preview when missing or too short, without leaking the value", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SCAN_IP_HASH_SALT = "too-short";
    expect(() => serverEnv.scanIpHashSalt).toThrowError(
      new RegExp(`at least ${SCAN_IP_HASH_SALT_MIN_LENGTH} characters`)
    );
    // The error must never contain the actual salt value.
    try {
      void serverEnv.scanIpHashSalt;
    } catch (e) {
      expect((e as Error).message).not.toContain("too-short");
    }
  });

  it("returns a strong salt in production", () => {
    process.env.VERCEL_ENV = "production";
    const strong = "x".repeat(SCAN_IP_HASH_SALT_MIN_LENGTH);
    process.env.SCAN_IP_HASH_SALT = strong;
    expect(serverEnv.scanIpHashSalt).toBe(strong);
  });
});
