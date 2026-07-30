import { describe, it, expect } from "vitest";

import {
  KNOWN_PRODUCTION_REF,
  assertTarget,
  classifyTarget,
  isDryRunEmail,
  isLocalSupabase,
  parseSupabaseRef,
  tagBaseUrlIssue,
} from "./env-target.mjs";

const PROD_URL = `https://${KNOWN_PRODUCTION_REF}.supabase.co`;
const STAGING_REF = "stagingrefabcdefgh";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LOCAL_URL = "http://127.0.0.1:54321";
/**
 * A JWT-SHAPED fake, used only to prove key material can never reach an error message.
 * Assembled at runtime rather than written as a literal: a literal would be a JWT-shaped string in a
 * tracked file, which the gitleaks default ruleset flags — and adding an allowlist entry for a
 * synthetic value would blunt the allowlist for real findings.
 */
const FAKE_KEY = ["eyJ", "hbGciOi", "JIUzI1NiJ9"].join("") + ".NOT-A-REAL-SECRET.signature";

describe("parseSupabaseRef", () => {
  it("extracts the ref from a hosted Supabase URL", () => {
    expect(parseSupabaseRef(PROD_URL)).toBe(KNOWN_PRODUCTION_REF);
    expect(parseSupabaseRef(STAGING_URL)).toBe(STAGING_REF);
  });

  it("returns null for local stacks and unparseable input", () => {
    expect(parseSupabaseRef(LOCAL_URL)).toBeNull();
    expect(parseSupabaseRef("not-a-url")).toBeNull();
  });

  it("returns null for a non-Supabase host", () => {
    expect(parseSupabaseRef("https://example.com")).toBeNull();
  });
});

describe("classifyTarget", () => {
  it("identifies local, production and staging", () => {
    expect(classifyTarget({ supabaseUrl: LOCAL_URL }).target).toBe("local");
    expect(classifyTarget({ supabaseUrl: PROD_URL }).target).toBe("production");
    expect(
      classifyTarget({ supabaseUrl: STAGING_URL, expectedStagingRef: STAGING_REF }).target
    ).toBe("staging");
  });

  it("fails closed: an unrecognised remote ref is treated as production", () => {
    const r = classifyTarget({ supabaseUrl: "https://someotherprojectref.supabase.co" });
    expect(r.target).toBe("production");
    expect(r.reason).toMatch(/fail closed/);
  });

  it("fails closed: a remote non-Supabase host is treated as production", () => {
    expect(classifyTarget({ supabaseUrl: "https://db.example.com" }).target).toBe("production");
  });

  it("does not treat the production ref as staging even if it is declared as such", () => {
    // Guards against a copy-paste that names production as the staging ref.
    const r = classifyTarget({ supabaseUrl: PROD_URL, expectedStagingRef: KNOWN_PRODUCTION_REF });
    expect(r.target).toBe("production");
  });

  it("never infers a target from a human-readable name", () => {
    // A host containing the word "staging" is still classified by ref, not by its name.
    expect(classifyTarget({ supabaseUrl: "https://staging.example.com" }).target).toBe("production");
  });
});

describe("assertTarget", () => {
  it("staging rejects the production host/ref", () => {
    expect(() =>
      assertTarget("staging", { supabaseUrl: PROD_URL, expectedStagingRef: STAGING_REF })
    ).toThrow(/expected the STAGING target but resolved PRODUCTION/);
  });

  it("production rejects the staging host/ref", () => {
    expect(() =>
      assertTarget("production", { supabaseUrl: STAGING_URL, expectedStagingRef: STAGING_REF })
    ).toThrow(/expected the PRODUCTION target but resolved STAGING/);
  });

  it("local rejects a remote host", () => {
    expect(() => assertTarget("local", { supabaseUrl: PROD_URL })).toThrow(
      /expected the LOCAL target but resolved PRODUCTION/
    );
  });

  it("staging fails closed when no expected ref is supplied", () => {
    expect(() => assertTarget("staging", { supabaseUrl: STAGING_URL })).toThrow(
      /no expected staging project ref was supplied/
    );
  });

  it("passes and returns the resolution when the target matches", () => {
    const r = assertTarget("staging", { supabaseUrl: STAGING_URL, expectedStagingRef: STAGING_REF });
    expect(r).toMatchObject({ target: "staging", ref: STAGING_REF });
  });

  it("rejects an unknown mode", () => {
    expect(() => assertTarget("preview", { supabaseUrl: LOCAL_URL })).toThrow(/unknown target mode/);
  });

  it("never includes key material in the error message", () => {
    // The module accepts no key at all, so a leak is structurally impossible — assert it anyway,
    // because this is the property that matters most if the signature ever changes.
    let message = "";
    try {
      assertTarget("staging", {
        supabaseUrl: PROD_URL,
        expectedStagingRef: STAGING_REF,
        // deliberately smuggled in; must be ignored and never echoed
        serviceRoleKey: FAKE_KEY,
      });
    } catch (e) {
      message = e.message;
    }
    expect(message).not.toContain(FAKE_KEY);
    expect(message).not.toContain("NOT-A-REAL-SECRET");
    expect(message).not.toMatch(/^ey[A-Za-z0-9_-]+\./m);
    // It SHOULD name the host so the operator can diagnose.
    expect(message).toContain(`${KNOWN_PRODUCTION_REF}.supabase.co`);
  });
});

describe("tagBaseUrlIssue", () => {
  it("a preview URL is never tag-safe", () => {
    expect(tagBaseUrlIssue("https://qr-asset-tags-abc123.vercel.app")).toMatch(/Vercel preview/);
    expect(tagBaseUrlIssue("https://vercel.app")).toMatch(/Vercel preview/);
  });

  it("rejects http and localhost/placeholder hosts", () => {
    expect(tagBaseUrlIssue("http://tags.example.org")).toBe("must use https");
    expect(tagBaseUrlIssue("https://localhost:3000")).toMatch(/localhost\/placeholder/);
    expect(tagBaseUrlIssue("https://example.com")).toMatch(/localhost\/placeholder/);
  });

  it("accepts a real https production origin", () => {
    expect(tagBaseUrlIssue("https://tags.mulemark.test")).toBeNull();
  });
});

describe("isLocalSupabase / isDryRunEmail", () => {
  it("detects loopback stacks", () => {
    expect(isLocalSupabase(LOCAL_URL)).toBe(true);
    expect(isLocalSupabase(PROD_URL)).toBe(false);
  });

  it("dry-run means neither provider variable is set", () => {
    expect(isDryRunEmail({})).toBe(true);
    expect(isDryRunEmail({ RESEND_API_KEY: "x" })).toBe(false);
    expect(isDryRunEmail({ NOTIFICATION_FROM_EMAIL: "a@b.c" })).toBe(false);
  });
});
