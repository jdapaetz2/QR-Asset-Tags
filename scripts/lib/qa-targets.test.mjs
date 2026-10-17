import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PROTECTED, QA_FIXTURES, assertQaRunnerTarget, isProtectedShortCode, qaRunnerRefusal } from "./qa-targets.mjs";

// The Phase E1 QA runner guard (scripts/lib/qa-targets.mjs).

const MANIFEST = JSON.parse(
  readFileSync(new URL("../../docs/phase-e/manifests/protected-demo-routes.json", import.meta.url), "utf8")
);
const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";

describe("protected set", () => {
  it("is read from the tracked route registry: all twelve Northridge codes, the org and the route assets", () => {
    const registry = [...MANIFEST.routes, ...MANIFEST.other_northridge_qr_rows].map((r) => r.short_code);
    expect(registry).toHaveLength(12);
    for (const code of registry) expect(PROTECTED.shortCodes.has(code)).toBe(true);
    expect([...PROTECTED.organizationIds]).toEqual([NORTHRIDGE]);
    for (const route of MANIFEST.routes) expect(PROTECTED.assetIds.has(route.asset_id)).toBe(true);
  });

  it("covers the seed-only demo codes and anything with the seed's demo- prefix", () => {
    for (const code of ["demo-sl021", "demo-cm005", "DEMO-EX017", "demo-anything-new"]) {
      expect(isProtectedShortCode(code)).toBe(true);
    }
    expect(isProtectedShortCode("stg-qa-public")).toBe(false);
    expect(isProtectedShortCode("")).toBe(false);
  });
});

describe("qaRunnerRefusal", () => {
  it("allows each hosted target only its own QA fixtures", () => {
    expect(qaRunnerRefusal({ target: "staging", shortCode: "stg-qa-public" })).toBeNull();
    expect(qaRunnerRefusal({ target: "staging", organizationId: "5ac00000-0000-4000-8000-00000057a610" })).toBeNull();
    expect(qaRunnerRefusal({ target: "production", shortCode: "prod-qa-perf-probe" })).toBeNull();
    expect(
      qaRunnerRefusal({ target: "production", organizationId: "c0000000-0000-4000-8000-00000000c0a1", shortCode: "prod-qa-perf-probe" })
    ).toBeNull();
  });

  it("refuses every Northridge code on every target, including codes that exist on staging", () => {
    for (const target of ["local", "staging", "production"]) {
      for (const code of ["demo-ex017", "ezzs9ueg", "demo-tr014", "67uqc3q7", "eb43bf3r", "demo-comp004"]) {
        expect(qaRunnerRefusal({ target, shortCode: code })).toMatch(/Northridge showcase/);
      }
      expect(qaRunnerRefusal({ target, organizationId: NORTHRIDGE })).toMatch(/Northridge showcase/);
      expect(qaRunnerRefusal({ target, assetId: MANIFEST.routes[0].asset_id })).toMatch(/protected Northridge/);
    }
  });

  it("fails closed on hosted targets for codes and organizations that are not fixtures", () => {
    expect(qaRunnerRefusal({ target: "production", shortCode: "a-customer-code" })).toMatch(/not a production QA fixture/);
    expect(qaRunnerRefusal({ target: "production", shortCode: "stg-qa-public" })).toMatch(/not a production QA fixture/);
    expect(qaRunnerRefusal({ target: "staging", shortCode: "prod-qa-perf-probe" })).toMatch(/not a staging QA fixture/);
    // The A6.3 org is a staging fixture, so staging-qa-data.mjs is refused on Production by construction.
    expect(qaRunnerRefusal({ target: "production", organizationId: "a6300000-0000-4000-8000-0000000a63a0" })).toMatch(
      /not a production QA fixture/
    );
    expect(qaRunnerRefusal({ target: "staging", organizationId: "4a863fa0-0000-4000-8000-000000000000" })).toMatch(/not a staging QA fixture/);
  });

  it("allows non-protected codes on disposable loopback targets", () => {
    expect(qaRunnerRefusal({ target: "local", shortCode: "a3-a-pub" })).toBeNull();
  });

  it("rejects an unknown target and an empty code instead of guessing", () => {
    expect(qaRunnerRefusal({ target: "prod", shortCode: "prod-qa-perf-probe" })).toMatch(/unknown QA target/);
    expect(qaRunnerRefusal({ target: "staging", shortCode: "  " })).toMatch(/no short code/);
  });

  it("throws from the assert form with the target named", () => {
    expect(() => assertQaRunnerTarget({ target: "staging", shortCode: "demo-ex017" })).toThrow(/refusing to run against STAGING/);
    expect(() => assertQaRunnerTarget({ target: "staging", shortCode: "stg-qa-rented" })).not.toThrow();
  });

  it("keeps the QA registries disjoint from the protected set", () => {
    for (const fixtures of Object.values(QA_FIXTURES)) {
      for (const code of fixtures.shortCodes) expect(isProtectedShortCode(code)).toBe(false);
      for (const org of fixtures.organizationIds) expect(PROTECTED.organizationIds.has(org)).toBe(false);
    }
  });
});
