import { describe, expect, it } from "vitest";

import { STAGING_PROBE_PATH, assertStagingBackend, publicRouteVerdict, stagingProbeVerdict } from "./staging-probe.mjs";

// The Phase E1 staging-backend probe (scripts/lib/staging-probe.mjs).

const STAGING = "https://qr-asset-tags-git-pilot-credibility-jdapaetz2-s-projects.vercel.app";
const RESOLVED = "<html><h1>Staging QA Trailer</h1><p>STG-QA-PUB</p></html>";
const UNAVAILABLE = "<html><h1>This page isn&#x27;t available</h1></html>";

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { status, text: async () => body };
  };
}

describe("stagingProbeVerdict", () => {
  it("passes only a 200 that shows the staging QA asset and no unavailable notice", () => {
    expect(stagingProbeVerdict({ status: 200, body: RESOLVED }).ok).toBe(true);
    expect(stagingProbeVerdict({ status: 200, body: UNAVAILABLE })).toMatchObject({ ok: false, reason: /not reading staging/ });
    expect(stagingProbeVerdict({ status: 200, body: "<html>This page isn’t available</html>" }).ok).toBe(false);
    expect(stagingProbeVerdict({ status: 200, body: "<html>something else</html>" }).ok).toBe(false);
    expect(stagingProbeVerdict({ status: 401, body: RESOLVED })).toMatchObject({ ok: false, reason: /HTTP 401/ });
  });
});

describe("publicRouteVerdict (showcase health check)", () => {
  const page = "<html><p>EXCAVATOR-017</p><h1>Excavator 017</h1></html>";
  it("requires a 200 that shows the asset code and no unavailable notice", () => {
    expect(publicRouteVerdict({ status: 200, body: page, assetCode: "EXCAVATOR-017" })).toEqual({ ok: true, resolved: true, reason: "resolves to EXCAVATOR-017" });
    expect(publicRouteVerdict({ status: 200, body: page, assetCode: "TRAILER-014" })).toMatchObject({ ok: false, reason: "does not show TRAILER-014" });
    expect(publicRouteVerdict({ status: 200, body: UNAVAILABLE, assetCode: "EXCAVATOR-017" })).toMatchObject({ ok: false, resolved: false });
    expect(publicRouteVerdict({ status: 307, body: "", assetCode: "EXCAVATOR-017" })).toMatchObject({ ok: false, reason: "HTTP 307" });
  });
  it("requires the unavailable notice for a route that must not resolve", () => {
    expect(publicRouteVerdict({ status: 200, body: UNAVAILABLE, expectResolves: false })).toMatchObject({ ok: true, resolved: false });
    expect(publicRouteVerdict({ status: 200, body: page, expectResolves: false })).toMatchObject({ ok: false, reason: "resolves, but must not" });
  });
});

describe("assertStagingBackend", () => {
  it("probes the scan-free /nojs page with the supplied headers and never follows redirects", async () => {
    const calls = [];
    await expect(
      assertStagingBackend({ baseUrl: `${STAGING}/some/path`, headers: { "x-vercel-protection-bypass": "x" }, fetchImpl: fakeFetch(200, RESOLVED, calls) })
    ).resolves.toMatchObject({ reason: "staging-only probe resolved" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${STAGING}${STAGING_PROBE_PATH}`);
    expect(STAGING_PROBE_PATH.startsWith("/nojs/t/")).toBe(true);
    expect(calls[0].init).toMatchObject({ redirect: "manual", headers: { "x-vercel-protection-bypass": "x" } });
  });

  it("refuses a deployment that is reading Production (the probe does not resolve)", async () => {
    await expect(assertStagingBackend({ baseUrl: STAGING, fetchImpl: fakeFetch(200, UNAVAILABLE) })).rejects.toThrow(
      /staging probe failed on .*vercel\.app: .*not reading staging\. No write was made/
    );
  });

  it("refuses when the probe cannot be reached, naming the host only", async () => {
    const failing = async () => {
      throw new Error("getaddrinfo ENOTFOUND\nstack trace");
    };
    await expect(assertStagingBackend({ baseUrl: STAGING, fetchImpl: failing })).rejects.toThrow(/could not reach .*vercel\.app/);
    await expect(assertStagingBackend({ baseUrl: "not a url", fetchImpl: failing })).rejects.toThrow(/not a valid URL/);
  });
});
