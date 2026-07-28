import { describe, expect, it } from "vitest";

import { assertLocal, getStackConfig } from "./setup/stack";

// The destructive suite must refuse to run against anything but a loopback stack. This proves the
// guard fires and that its message never contains key material.
describe("non-local safety guard", () => {
  it("aborts for a non-loopback Supabase host", () => {
    expect(() => assertLocal("https://abcdefgh.supabase.co")).toThrow(/refusing to run destructive security tests/i);
  });

  it("aborts for a cloud host without leaking any key from status", () => {
    const { serviceRoleKey, anonKey } = getStackConfig();
    try {
      assertLocal("https://project.supabase.co");
      throw new Error("guard did not fire");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain(serviceRoleKey);
      expect(message).not.toContain(anonKey);
    }
  });

  it("permits the loopback stack", () => {
    expect(() => assertLocal("http://127.0.0.1:54321")).not.toThrow();
    expect(() => assertLocal("http://localhost:54321")).not.toThrow();
  });
});
