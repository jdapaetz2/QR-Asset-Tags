import { afterEach, describe, expect, it, vi } from "vitest";

import { logQueryFailure, throwOnEssentialFailure } from "@/lib/diagnostics/query-failure";

afterEach(() => vi.restoreAllMocks());

describe("essential read failure", () => {
  /**
   * The defect this exists to prevent: before C2 a failed `assets` query was discarded and rendered as
   * an empty list, so a database problem looked exactly like "this organization has no equipment". An
   * operator cannot tell those apart, and the wrong one is quietly reassuring.
   */
  it("throws so the segment error boundary renders instead of an empty list", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => throwOnEssentialFailure("/dashboard/assets", "assets", { code: "57014" })).toThrow(
      /Essential read failed: assets/
    );
  });

  it("does nothing when there is no error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => throwOnEssentialFailure("/dashboard/assets", "assets", null)).not.toThrow();
    expect(err).not.toHaveBeenCalled();
  });

  it("logs the route, read and code before throwing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => throwOnEssentialFailure("/dashboard/assets", "assets", { code: "42501" })).toThrow();
    const line = err.mock.calls[0].join(" ");
    expect(line).toContain('"route":"/dashboard/assets"');
    expect(line).toContain('"read":"assets"');
    expect(line).toContain('"code":"42501"');
    expect(line).toContain('"essential":true');
  });
});

describe("secondary read failure", () => {
  it("logs and does not throw, so the page degrades rather than disappearing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => logQueryFailure("/dashboard/assets", "qr_links", { code: "08006" })).not.toThrow();
    const line = err.mock.calls[0].join(" ");
    expect(line).toContain('"read":"qr_links"');
    expect(line).toContain('"degraded":true');
  });

  it("is silent when the read succeeded", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryFailure("/dashboard/assets", "qr_links", null);
    logQueryFailure("/dashboard/assets", "qr_links", undefined);
    expect(err).not.toHaveBeenCalled();
  });
});

describe("what is never logged", () => {
  /**
   * PostgREST error messages routinely quote column names, constraint names and fragments of the
   * failing statement. A query also often fails BECAUSE of its inputs, which makes those inputs the
   * most tempting and least safe thing to log.
   */
  it("never emits the provider message, even when one is present", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryFailure("/dashboard/assets", "open_submissions", {
      code: "42P01",
      // @ts-expect-error — deliberately passing a shape richer than the accepted type
      message: 'relation "form_submissions" does not exist',
      details: "renter@example.com searched for ACME-001",
      hint: "internal hint",
    });
    const line = err.mock.calls[0].join(" ");
    expect(line).not.toContain("relation");
    expect(line).not.toContain("renter@example.com");
    expect(line).not.toContain("ACME-001");
    expect(line).not.toContain("internal hint");
  });

  it("emits only the five intended fields", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryFailure("/dashboard/assets", "categories", { code: "XX000" });
    const payload = JSON.parse(err.mock.calls[0][1]);
    expect(Object.keys(payload).sort()).toEqual(["code", "degraded", "read", "route", "tag"]);
  });

  it("reports a missing or non-string code as unknown rather than guessing", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryFailure("/dashboard/assets", "covered_count", { code: null });
    expect(err.mock.calls[0].join(" ")).toContain('"code":"unknown"');
  });
});
