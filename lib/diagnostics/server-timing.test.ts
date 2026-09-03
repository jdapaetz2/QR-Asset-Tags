import { afterEach, describe, expect, it, vi } from "vitest";

import { _internal, time, timeRequest } from "@/lib/diagnostics/server-timing";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MULEMARK_DIAGNOSTIC_TIMING;
});

describe("diagnostic timing — default off", () => {
  /**
   * The contract that makes this safe to merge: with the flag unset the helper is inert. If this ever
   * fails, a diagnostic is logging on every production request.
   */
  it("is disabled unless the flag is exactly '1'", () => {
    expect(_internal.enabled()).toBe(false);
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "true";
    expect(_internal.enabled()).toBe(false);
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "0";
    expect(_internal.enabled()).toBe(false);
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    expect(_internal.enabled()).toBe(true);
  });

  /**
   * Regression: setting this through a shell pipe appends a newline (CRLF on Windows). A strict
   * equality check then no-ops silently while every listing shows the variable "set" — which is
   * exactly how this was lost for a deploy cycle. Whitespace must not disable a diagnostic.
   */
  it("tolerates surrounding whitespace from shell-set values", () => {
    for (const raw of ["1\n", "1\r\n", " 1 ", "\t1"]) {
      process.env.MULEMARK_DIAGNOSTIC_TIMING = raw;
      expect(_internal.enabled()).toBe(true);
    }
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "11";
    expect(_internal.enabled()).toBe(false);
  });

  it("logs nothing when disabled", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await time("/dashboard/assets", "auth.profile", async () => "value");
    expect(info).not.toHaveBeenCalled();
  });

  /**
   * Read per call, never cached at module load: serverless module state outlives a request, so a cached
   * flag could not be switched off for the life of a warm instance.
   */
  it("re-reads the flag on every call", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await time("/r", "auth.profile", async () => 1);
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    await time("/r", "auth.profile", async () => 1);
    expect(info).toHaveBeenCalledTimes(1);
  });
});

describe("diagnostic timing — behaviour is never altered", () => {
  it("returns the wrapped value unchanged, enabled or disabled", async () => {
    expect(await time("/r", "page.primary_queries", async () => ({ a: 1 }))).toEqual({ a: 1 });
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await time("/r", "page.primary_queries", async () => ({ a: 1 }))).toEqual({ a: 1 });
  });

  it("propagates a rejection untouched and still records the phase", async () => {
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      time("/r", "scan.record", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const line = info.mock.calls[0].join(" ");
    expect(line).toContain('"ok":false');
    expect(line).toContain('"phase":"scan.record"');
  });
});

describe("diagnostic timing — emits no user data", () => {
  it("logs only tag, route, phase, duration and ok", async () => {
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await time("/dashboard/submissions", "media.signed_urls", async () => "secret-value");
    const payload = JSON.parse(info.mock.calls[0][1]);
    expect(Object.keys(payload).sort()).toEqual(["durationMs", "ok", "phase", "route", "tag"]);
    // The wrapped value never reaches the log — only its duration does.
    expect(info.mock.calls[0].join(" ")).not.toContain("secret-value");
    expect(typeof payload.durationMs).toBe("number");
  });

  it("timeRequest records the total under a fixed phase name", async () => {
    process.env.MULEMARK_DIAGNOSTIC_TIMING = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await timeRequest("/t/[shortCode]", async () => null);
    expect(info.mock.calls[0].join(" ")).toContain('"phase":"request.total"');
  });
});
