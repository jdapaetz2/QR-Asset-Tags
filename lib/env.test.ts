import { afterEach, describe, expect, it } from "vitest";
import { _internal, publicEnv } from "./env";

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
