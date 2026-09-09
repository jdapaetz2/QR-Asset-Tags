import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase C7 — the freshness endpoint's authorization and disclosure contract.
 *
 * Two properties matter more than the happy path:
 *   1. **Every refusal looks identical.** If a suspended organization refused differently from a
 *      signed-out caller, the endpoint would answer questions nobody is entitled to ask.
 *   2. **The success body is exactly two fields.** This is a polling endpoint; anything that leaks into
 *      it gets fetched every minute by every open inbox.
 */

const { getProfile, ownOrgActive, createClient, countNewSubmissions, latestSubmissionAt } = vi.hoisted(
  () => ({
    getProfile: vi.fn(),
    ownOrgActive: vi.fn(),
    createClient: vi.fn(),
    countNewSubmissions: vi.fn(),
    latestSubmissionAt: vi.fn(),
  })
);

vi.mock("@/lib/auth/session", () => ({ getProfile, ownOrgActive }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/submissions/counts", () => ({ countNewSubmissions, latestSubmissionAt }));

import { GET } from "./route";

const RLS_CLIENT = { marker: "rls-scoped" };

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    auth_user_id: "u1",
    organization_id: "org-1",
    name: "Admin",
    email: "admin@example.test",
    role: "customer_admin",
    status: "active",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue(RLS_CLIENT);
  ownOrgActive.mockResolvedValue(true);
  countNewSubmissions.mockResolvedValue(3);
  latestSubmissionAt.mockResolvedValue("2026-09-09T10:00:00.000Z");
});

describe("an authorized active-org customer gets the token", () => {
  for (const role of ["customer_admin", "customer_staff"]) {
    it(`allows ${role} — both roles see the inbox and its badge`, async () => {
      getProfile.mockResolvedValue(profile({ role }));

      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ newCount: 3, latest: "2026-09-09T10:00:00.000Z" });
    });
  }

  it("returns EXACTLY two fields — no rows, ids, names, emails or URLs", async () => {
    getProfile.mockResolvedValue(profile());

    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["latest", "newCount"]);
  });

  it("is never cached", async () => {
    getProfile.mockResolvedValue(profile());

    const res = await GET();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("reads through the RLS-scoped client, which is what enforces tenant isolation", async () => {
    getProfile.mockResolvedValue(profile());

    await GET();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(countNewSubmissions).toHaveBeenCalledWith(RLS_CLIENT);
    expect(latestSubmissionAt).toHaveBeenCalledWith(RLS_CLIENT);
  });

  it("handles an organization with no submissions", async () => {
    getProfile.mockResolvedValue(profile());
    countNewSubmissions.mockResolvedValue(0);
    latestSubmissionAt.mockResolvedValue(null);

    expect(await (await GET()).json()).toEqual({ newCount: 0, latest: null });
  });
});

describe("every refusal is indistinguishable, and reads nothing", () => {
  const cases: [string, () => void, number][] = [
    ["signed out / no profile / disabled profile", () => getProfile.mockResolvedValue(null), 401],
    [
      "platform owner",
      () => getProfile.mockResolvedValue(profile({ role: "platform_owner", organization_id: null })),
      403,
    ],
    ["customer with no organization", () => getProfile.mockResolvedValue(profile({ organization_id: null })), 403],
    [
      "suspended organization",
      () => {
        getProfile.mockResolvedValue(profile());
        ownOrgActive.mockResolvedValue(false);
      },
      403,
    ],
  ];

  for (const [name, arrange, status] of cases) {
    it(`refuses ${name} with the same body and no data read`, async () => {
      arrange();

      const res = await GET();
      expect(res.status).toBe(status);
      // Identical body for every reason — the shape reveals nothing about why.
      expect(await res.json()).toEqual({ ok: false });
      expect(countNewSubmissions).not.toHaveBeenCalled();
      expect(latestSubmissionAt).not.toHaveBeenCalled();
    });
  }

  it("a refusal is never cached either", async () => {
    getProfile.mockResolvedValue(null);
    expect((await GET()).headers.get("cache-control")).toContain("no-store");
  });
});

describe("the endpoint never reaches for the service role", () => {
  /**
   * Freshness is customer data and must be RLS-scoped. The service-role client bypasses RLS entirely, so
   * one import here would silently turn a per-tenant count into an org-wide one.
   */
  it("does not import the admin client", () => {
    const source = readFileSync(fileURLToPath(new URL("./route.ts", import.meta.url)), "utf8");
    expect(source).not.toContain("supabase/admin");
    expect(source).not.toContain("createAdminClient");
  });
});
