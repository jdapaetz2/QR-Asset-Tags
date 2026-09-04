import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { readScanRequestMeta, recordScan } from "./record";
import { hashIp } from "./scan";

type ScanRow = Record<string, unknown>;

const SALT = "test-salt";
const IP = "203.0.113.9";

/** A `Headers`-shaped stub: only `.get()` is used, which is the whole point of the narrow type. */
function headerStub(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

/**
 * Source with comments stripped. The doc comments in these modules deliberately *discuss* `headers()`
 * and `next/headers` — explaining why they are absent — so a raw text match would fail on the very
 * prose that documents the rule. Only real code is checked.
 */
function codeOf(url: string): string {
  return readFileSync(fileURLToPath(new URL(url, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("readScanRequestMeta", () => {
  it("hashes the IP and never returns the raw address", () => {
    const meta = readScanRequestMeta(
      headerStub({ "x-forwarded-for": `${IP}, 70.41.3.18`, "user-agent": "Mozilla/5.0 (iPhone)" }),
      SALT
    );

    // The stored value is the salted digest of the FIRST forwarded address.
    expect(meta.ipHash).toBe(hashIp(IP, SALT));
    expect(meta.ipHash).toMatch(/^[0-9a-f]{32}$/);

    // The raw address must not survive anywhere in the object that gets captured by the callback.
    expect(JSON.stringify(meta)).not.toContain(IP);
    expect(JSON.stringify(meta)).not.toContain("70.41.3.18");
  });

  it("carries user agent and referrer through, and derives the device class", () => {
    const meta = readScanRequestMeta(
      headerStub({
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148",
        referer: "https://example.test/from",
        "x-forwarded-for": IP,
      }),
      SALT
    );
    expect(meta.userAgent).toContain("iPhone");
    expect(meta.referrer).toBe("https://example.test/from");
    expect(meta.deviceType).toBe("mobile");
  });

  it("is null-safe when the request carries none of the optional headers", () => {
    const meta = readScanRequestMeta(headerStub({}), SALT);
    expect(meta).toEqual({
      userAgent: null,
      referrer: null,
      // No IP to hash is not a failure — it is simply nothing to store.
      ipHash: null,
      deviceType: "unknown",
    });
  });
});

/**
 * The real regression guard for the Next.js Server Component contract: a page may not call `headers()`
 * inside an `after` callback, so the deferred recorder must not reach for one. A comment saying so
 * would not survive a refactor; this does.
 */
describe("the recorder holds no request API", () => {
  const source = codeOf("./record.ts");

  it("does not import next/headers", () => {
    expect(source).not.toContain("next/headers");
  });

  it("does not call headers() or cookies()", () => {
    expect(source).not.toMatch(/\bheaders\(\)/);
    expect(source).not.toMatch(/\bcookies\(\)/);
  });
});

describe("recordScan", () => {
  const target = { qrLinkId: "qr-1", assetId: "asset-1", organizationId: "org-1" };
  const meta = {
    userAgent: "UA",
    referrer: "https://example.test",
    ipHash: "a".repeat(32),
    deviceType: "mobile",
  };

  it("inserts exactly the scan row, with the hash and never a raw IP field", async () => {
    const insert = vi.fn(async (_row: ScanRow) => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    await recordScan({ from } as never, target, meta);

    expect(from).toHaveBeenCalledWith("scan_events");
    expect(insert).toHaveBeenCalledWith({
      qr_link_id: "qr-1",
      asset_id: "asset-1",
      organization_id: "org-1",
      user_agent: "UA",
      ip_hash: "a".repeat(32),
      referrer: "https://example.test",
      device_type: "mobile",
    });
    // There is no column through which a raw address could be written.
    expect(Object.keys(insert.mock.calls[0][0])).not.toContain("ip");
  });

  /**
   * Best-effort is the existing product policy, and C5 changes only WHEN this runs. A page that is
   * otherwise fine must never fail because analytics did.
   */
  it("swallows a rejecting client", async () => {
    const from = () => ({
      insert: async () => {
        throw new Error("network");
      },
    });
    await expect(recordScan({ from } as never, target, meta)).resolves.toBeUndefined();
  });

  it("swallows a returned Supabase error", async () => {
    const from = () => ({ insert: async () => ({ error: { code: "42501" } }) });
    await expect(recordScan({ from } as never, target, meta)).resolves.toBeUndefined();
  });
});
