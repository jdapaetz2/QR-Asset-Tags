import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ORG_A, ORG_B, ORG_C_SUSPENDED, QR, anonClient, serviceClient, signInAs } from "../setup/fixtures";
import { expectUnchanged, readColumn } from "../setup/assertions";

// Engineering Phase E2C, executed against the local stack:
// - migration 0040: only the platform owner can take an active production-primary (printed) QR link out of service;
// - migration 0041: is_demo_organization answers yes/no for one active organization, and anon can call nothing else
//   through it.

let owner: SupabaseClient;
let adminA: SupabaseClient;
let staffA: SupabaseClient;
let anon: SupabaseClient;

beforeAll(async () => {
  owner = await signInAs("owner");
  adminA = await signInAs("admin_a");
  staffA = await signInAs("staff_a");
  anon = anonClient();
});

afterAll(async () => {
  // Leave the shared fixtures as seeded. Plan fields are owner-only (0016/0019): only the platform owner can reset them.
  await serviceClient().from("qr_links").update({ status: "active" }).eq("id", QR.A);
  await owner.from("organizations").update({ plan_key: null }).in("id", [ORG_A, ORG_B, ORG_C_SUSPENDED]);
});

describe("0040: disabling the printed QR link", () => {
  it("the seeded link is the asset's active production primary (precondition)", async () => {
    expect(await readColumn("qr_links", QR.A, "is_production_primary")).toBe(true);
    expect(await readColumn("qr_links", QR.A, "status")).toBe("active");
  });

  it("an organization admin and staff member are refused with a clear error, and nothing changes", async () => {
    for (const [label, client] of [["admin_a", adminA], ["staff_a", staffA]] as const) {
      const { error } = await client.from("qr_links").update({ status: "disabled" }).eq("id", QR.A);
      expect(error?.code, `${label}/disable primary should be refused`).toBe("42501");
      expect(error?.message ?? "", `${label}/disable primary message`).toContain("qr_primary_disable_forbidden");
      await expectUnchanged("qr_links", QR.A, "status", "active", `${label}/disable primary`);
    }
  });

  it("the platform owner may (positive control), and the link can be reactivated", async () => {
    const { error } = await owner.from("qr_links").update({ status: "disabled" }).eq("id", QR.A);
    expect(error?.message ?? null, "owner/disable primary").toBeNull();
    expect(await readColumn("qr_links", QR.A, "status")).toBe("disabled");
    const { error: back } = await owner.from("qr_links").update({ status: "active" }).eq("id", QR.A);
    expect(back?.message ?? null, "owner/reactivate").toBeNull();
    expect(await readColumn("qr_links", QR.A, "status")).toBe("active");
  });

  it("a trusted server context (no signed-in user) is unaffected", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("qr_links").update({ status: "disabled" }).eq("id", QR.A);
    expect(error?.message ?? null, "service role/disable primary").toBeNull();
    await admin.from("qr_links").update({ status: "active" }).eq("id", QR.A);
  });
});

describe("0041: is_demo_organization", () => {
  it("only the platform owner can put an organization on the Demo plan", async () => {
    await adminA.from("organizations").update({ plan_key: "demo" }).eq("id", ORG_A);
    expect(await readColumn("organizations", ORG_A, "plan_key"), "admin_a/plan_key coerced back").not.toBe("demo");
    await serviceClient().from("organizations").update({ plan_key: "demo" }).eq("id", ORG_A);
    expect(await readColumn("organizations", ORG_A, "plan_key"), "service role/plan_key coerced back").not.toBe("demo");
  });

  it("anon can ask, and the answer follows the Demo plan of an active organization only", async () => {
    await owner.from("organizations").update({ plan_key: "demo" }).in("id", [ORG_A, ORG_C_SUSPENDED]);
    await owner.from("organizations").update({ plan_key: "standard" }).eq("id", ORG_B);
    expect(await readColumn("organizations", ORG_A, "plan_key"), "owner/plan_key").toBe("demo");
    const ask = async (org: string) => {
      const { data, error } = await anon.rpc("is_demo_organization", { p_organization_id: org });
      expect(error?.message ?? null, `anon/is_demo_organization ${org}`).toBeNull();
      return data;
    };
    expect(await ask(ORG_A)).toBe(true);
    expect(await ask(ORG_B)).toBe(false);
    expect(await ask(ORG_C_SUSPENDED)).toBe(false);
    expect(await ask("00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("anon still cannot read the plan itself", async () => {
    const { data, error } = await anon.from("organizations").select("plan_key").eq("id", ORG_A);
    expect(error !== null || (data ?? []).every((row) => !("plan_key" in row) || row.plan_key === null), "anon must not read plan_key").toBe(true);
  });
});
