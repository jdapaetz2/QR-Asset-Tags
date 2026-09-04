import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Captures whatever `scheduleScanOnce` hands to `after()`, so the callback can be run deliberately. */
const scheduled: (() => unknown)[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    scheduled.push(fn);
  },
}));

/**
 * A stand-in for React's request-scoped `cache`, and the fidelity here is load-bearing.
 *
 * Two properties are modelled deliberately:
 *
 * 1. **Memoization is per REQUEST SCOPE, not per module.** `withRequest()` installs a fresh scope, so
 *    two scopes within ONE module instance get separate latches. This is what makes the
 *    "a new request schedules again" test able to fail: `vi.resetModules()` alone would also reset a
 *    module-level `let`, so a global-latch bug would sail straight through it. Verified by mutation —
 *    replacing the latch with a module-level flag fails this suite.
 * 2. **Outside a render scope React's `cache` does not memoize at all** — it calls straight through.
 *    That is mirrored below rather than smoothed over, because it is the reason `claimScan` is
 *    separated from its storage in the first place.
 */
let currentScope: Map<unknown, unknown> | null = null;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      return (...args: A): R => {
        const scope = currentScope;
        if (!scope) return fn(...args); // no render scope → no memoization, as in React
        if (!scope.has(fn)) scope.set(fn, fn(...args));
        return scope.get(fn) as R;
      };
    },
  };
});

/** Run `body` inside its own request scope, the way one HTTP request renders. */
function withRequest<T>(body: () => T): T {
  const previous = currentScope;
  currentScope = new Map();
  try {
    return body();
  } finally {
    currentScope = previous;
  }
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

type ScanRow = Record<string, unknown>;

const target = { qrLinkId: "qr-1", assetId: "asset-1", organizationId: "org-1" };
const meta = {
  userAgent: "UA",
  referrer: null,
  ipHash: "b".repeat(32),
  deviceType: "mobile",
};

const okClient = () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) as never;

beforeEach(() => {
  scheduled.length = 0;
  currentScope = null;
});
afterEach(() => vi.restoreAllMocks());

describe("claimScan", () => {
  it("hands out the slot exactly once per latch", async () => {
    const { claimScan } = await import("./schedule");
    const latch = { scheduled: false };
    expect(claimScan(latch)).toBe(true);
    expect(claimScan(latch)).toBe(false);
    expect(claimScan(latch)).toBe(false);
  });

  it("treats separate latches independently", async () => {
    const { claimScan } = await import("./schedule");
    expect(claimScan({ scheduled: false })).toBe(true);
    expect(claimScan({ scheduled: false })).toBe(true);
  });
});

describe("scheduleScanOnce", () => {
  it("schedules exactly one deferred insert no matter how often it is called", async () => {
    const { scheduleScanOnce } = await import("./schedule");

    withRequest(() => {
      expect(scheduleScanOnce(okClient(), target, meta)).toBe(true);
      expect(scheduleScanOnce(okClient(), target, meta)).toBe(false);
      expect(scheduleScanOnce(okClient(), target, meta)).toBe(false);
    });

    // One request, one row. This is what stops a re-render becoming a double count.
    expect(scheduled).toHaveLength(1);
  });

  /**
   * The property that separates a request-scoped latch from a module-level flag, tested WITHIN a single
   * module instance so the module registry cannot mask the difference. If the latch were global, the
   * second request would schedule nothing — one scan for the lifetime of the server instance, and
   * silent loss of every scan after the first.
   */
  it("schedules again for a new request, in the same module instance", async () => {
    const { scheduleScanOnce } = await import("./schedule");

    withRequest(() => expect(scheduleScanOnce(okClient(), target, meta)).toBe(true));
    withRequest(() => expect(scheduleScanOnce(okClient(), target, meta)).toBe(true));
    withRequest(() => expect(scheduleScanOnce(okClient(), target, meta)).toBe(true));

    expect(scheduled).toHaveLength(3);
  });

  it("the deferred callback writes the row from the values captured at render time", async () => {
    const { scheduleScanOnce } = await import("./schedule");
    const insert = vi.fn(async (_row: ScanRow) => ({ error: null }));
    const client = { from: vi.fn(() => ({ insert })) } as never;

    withRequest(() => scheduleScanOnce(client, target, meta));
    // Nothing written yet: the work belongs after the response, not during the render.
    expect(insert).not.toHaveBeenCalled();

    await scheduled[0]();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      qr_link_id: "qr-1",
      asset_id: "asset-1",
      organization_id: "org-1",
      ip_hash: "b".repeat(32),
      device_type: "mobile",
    });
  });

  it("a failing insert inside the callback does not reject", async () => {
    const { scheduleScanOnce } = await import("./schedule");
    const client = {
      from: () => ({
        insert: async () => {
          throw new Error("network");
        },
      }),
    } as never;

    withRequest(() => scheduleScanOnce(client, target, meta));
    // If this rejected it would surface as an unhandled rejection in the runtime after the response.
    await expect(scheduled[0]()).resolves.toBeUndefined();
  });
});

describe("the scheduler holds no request API", () => {
  const source = codeOf("./schedule.ts");

  it("does not import next/headers", () => {
    expect(source).not.toContain("next/headers");
  });

  it("does not call headers() or cookies() — forbidden inside after() in a Server Component", () => {
    expect(source).not.toMatch(/\bheaders\(\)/);
    expect(source).not.toMatch(/\bcookies\(\)/);
  });
});
