import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Engineering Phase D3B — the cron endpoint's authorization and disclosure contract. It runs only on Production,
 * only with `Authorization: Bearer ${CRON_SECRET}`, refuses everything else identically, and an authorized response
 * carries counts only.
 */

const { runReturnDigest, createDigestStore, sendNotificationEmail } = vi.hoisted(() => ({
  runReturnDigest: vi.fn(),
  createDigestStore: vi.fn(() => ({ marker: "store" })),
  sendNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/notifications/digest-worker", () => ({ runReturnDigest }));
vi.mock("@/lib/notifications/digest-store", () => ({ createDigestStore }));
vi.mock("@/lib/notifications/send", () => ({ sendNotificationEmail }));

import { GET } from "./route";

const SECRET = "c".repeat(40);
const COMPLETED = {
  outcome: "completed",
  pacificDate: "2026-07-15",
  pacificHour: 6,
  organizations: 3,
  sent: 1,
  quiet: 1,
  failed: 0,
  skipped: 1,
};

function request(headers: Record<string, string> = {}, url = "https://mulemark.io/api/cron/return-digest"): Request {
  return new Request(url, { headers });
}

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERCEL_ENV = "production";
  process.env.CRON_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://mulemark.io";
  runReturnDigest.mockResolvedValue(COMPLETED);
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("refusals are identical and do no work", () => {
  const cases: [string, () => Request][] = [
    ["no Authorization header", () => request()],
    ["a wrong secret", () => request({ authorization: `Bearer ${"x".repeat(40)}` })],
    ["the secret in a query string only", () => request({}, `https://mulemark.io/api/cron/return-digest?secret=${SECRET}`)],
    [
      "Preview",
      () => {
        process.env.VERCEL_ENV = "preview";
        return request({ authorization: `Bearer ${SECRET}` });
      },
    ],
    [
      "local development",
      () => {
        delete process.env.VERCEL_ENV;
        return request({ authorization: `Bearer ${SECRET}` });
      },
    ],
    [
      "a missing CRON_SECRET",
      () => {
        delete process.env.CRON_SECRET;
        return request({ authorization: "Bearer " });
      },
    ],
    [
      "a CRON_SECRET shorter than 32 characters",
      () => {
        process.env.CRON_SECRET = "short-secret";
        return request({ authorization: "Bearer short-secret" });
      },
    ],
  ];

  for (const [name, build] of cases) {
    it(`refuses ${name} with a bare 401`, async () => {
      const res = await GET(build());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false });
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(runReturnDigest).not.toHaveBeenCalled();
      expect(createDigestStore).not.toHaveBeenCalled();
    });
  }
});

describe("an authorized Vercel invocation", () => {
  it("runs the worker and returns counts only", async () => {
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, outcome: "completed", organizations: 3, sent: 1, quiet: 1, failed: 0, skipped: 1 });
    expect(Object.keys(body).sort()).toEqual(["failed", "ok", "organizations", "outcome", "quiet", "sent", "skipped"]);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(runReturnDigest).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://mulemark.io", store: { marker: "store" } })
    );
  });

  it("an incomplete run is a 500, never a silent success", async () => {
    runReturnDigest.mockResolvedValue({ ...COMPLETED, outcome: "incomplete" });
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, outcome: "incomplete" });
  });

  it("an unexpected error is a bare 500", async () => {
    runReturnDigest.mockRejectedValue(new Error("boom with detail"));
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });
});

describe("the route source", () => {
  const source = readFileSync(fileURLToPath(new URL("./route.ts", import.meta.url)), "utf8");

  it("never imports the service-role client directly and never reads a query string", () => {
    expect(source).not.toContain("supabase/admin");
    expect(source).not.toContain("searchParams");
  });

  it("declares the Node runtime and a bounded maxDuration", () => {
    expect(source).toMatch(/export const runtime = "nodejs"/);
    expect(source).toMatch(/export const maxDuration = 300/);
  });
});
