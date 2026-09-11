import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ORG_A,
  ORG_B,
  ORG_C_SUSPENDED,
  anonClient,
  serviceClient,
  signInAs,
} from "../setup/fixtures";
import { expectChanged, expectUnchanged } from "../setup/assertions";

// Executed RLS — Engineering Phase D3A notification routing settings (migration 0034). The new organization columns
// ride the existing organizations_update policy (0032): a customer_admin of its own ACTIVE organization, or the
// platform owner. Customer staff, other organizations, suspended organizations and anon are denied; anon cannot even
// read them. Every assertion runs through a real signed-in PostgREST client and reads the row back.

const ROUTING_COLUMNS = [
  "notify_urgent_reports",
  "urgent_notification_email",
  "return_notification_mode",
  "notify_include_photo_previews",
] as const;

const BASELINE = {
  notify_urgent_reports: false,
  urgent_notification_email: null,
  return_notification_mode: "off",
  notify_include_photo_previews: true,
};

async function resetRouting(orgId: string): Promise<void> {
  const { error } = await serviceClient().from("organizations").update(BASELINE).eq("id", orgId);
  expect(error?.message ?? null, `baseline reset ${orgId}`).toBeNull();
}

async function expectBaseline(orgId: string, label: string): Promise<void> {
  for (const column of ROUTING_COLUMNS) {
    await expectUnchanged("organizations", orgId, column, BASELINE[column], `${label}/${column}`);
  }
}

const HIJACK = {
  notify_urgent_reports: true,
  urgent_notification_email: "attacker@evil.test",
  return_notification_mode: "instant_renter",
  notify_include_photo_previews: false,
};

let owner: SupabaseClient;
let adminA: SupabaseClient;
let staffA: SupabaseClient;
let adminC: SupabaseClient;

beforeAll(async () => {
  owner = await signInAs("owner");
  adminA = await signInAs("admin_a");
  staffA = await signInAs("staff_a");
  adminC = await signInAs("admin_c");
});

beforeEach(async () => {
  for (const orgId of [ORG_A, ORG_B, ORG_C_SUSPENDED]) await resetRouting(orgId);
});

afterAll(async () => {
  for (const orgId of [ORG_A, ORG_B, ORG_C_SUSPENDED]) await resetRouting(orgId);
  await serviceClient().from("organizations").update({ notification_email: null }).eq("id", ORG_A);
});

describe("organizations — D3A routing settings (migration 0034)", () => {
  it("customer_admin MAY update its own active org's routing settings", async () => {
    const { error } = await adminA
      .from("organizations")
      .update({
        notification_email: "ops@orga.a3test",
        notify_urgent_reports: true,
        urgent_notification_email: "oncall@orga.a3test",
        return_notification_mode: "daily_exceptions",
        notify_include_photo_previews: false,
      })
      .eq("id", ORG_A);
    expect(error?.message ?? null, "admin_a/organizations/routing-update-own").toBeNull();
    await expectChanged("organizations", ORG_A, "notify_urgent_reports", true, "admin_a/routing/urgent");
    await expectChanged("organizations", ORG_A, "urgent_notification_email", "oncall@orga.a3test", "admin_a/routing/urgent-email");
    await expectChanged("organizations", ORG_A, "return_notification_mode", "daily_exceptions", "admin_a/routing/mode");
    await expectChanged("organizations", ORG_A, "notify_include_photo_previews", false, "admin_a/routing/previews");
  });

  it("the database refuses the urgent route switched on without an address, even through the API", async () => {
    for (const address of [null, "   "]) {
      const { error } = await adminA
        .from("organizations")
        .update({ notify_urgent_reports: true, urgent_notification_email: address })
        .eq("id", ORG_A);
      expect(error, "admin_a/routing/urgent-without-address should violate the CHECK").toBeTruthy();
      expect(error?.code).toBe("23514");
    }
    await expectBaseline(ORG_A, "admin_a/routing/urgent-without-address");
  });

  it("the database refuses an unknown return mode", async () => {
    const { error } = await adminA.from("organizations").update({ return_notification_mode: "weekly" }).eq("id", ORG_A);
    expect(error?.code, "admin_a/routing/unknown-mode").toBe("23514");
    await expectBaseline(ORG_A, "admin_a/routing/unknown-mode");
  });

  it("customer_staff MAY NOT change routing settings", async () => {
    await staffA.from("organizations").update(HIJACK).eq("id", ORG_A);
    await expectBaseline(ORG_A, "staff_a/routing/update-own");
  });

  it("customer_admin MAY NOT change another org's routing settings (cross-tenant)", async () => {
    await adminA.from("organizations").update(HIJACK).eq("id", ORG_B);
    await expectBaseline(ORG_B, "admin_a/routing/update-cross-org");
  });

  it("a suspended org's admin MAY NOT change its routing settings", async () => {
    await adminC.from("organizations").update(HIJACK).eq("id", ORG_C_SUSPENDED);
    await expectBaseline(ORG_C_SUSPENDED, "admin_c/routing/update-suspended");
  });

  it("platform_owner retains sanctioned access", async () => {
    const { error } = await owner
      .from("organizations")
      .update({ return_notification_mode: "instant_renter", notify_include_photo_previews: false })
      .eq("id", ORG_A);
    expect(error?.message ?? null, "owner/routing/update").toBeNull();
    await expectChanged("organizations", ORG_A, "return_notification_mode", "instant_renter", "owner/routing/mode");
    await expectChanged("organizations", ORG_A, "notify_include_photo_previews", false, "owner/routing/previews");
  });

  it("anon MAY NOT read any routing column (not in the anon column grant)", async () => {
    await serviceClient()
      .from("organizations")
      .update({ notify_urgent_reports: true, urgent_notification_email: "oncall@orga.a3test" })
      .eq("id", ORG_A);
    for (const column of ROUTING_COLUMNS) {
      const { data, error } = await anonClient().from("organizations").select(column).eq("id", ORG_A);
      expect(error, `anon/organizations/select-${column} should be denied`).toBeTruthy();
      expect(JSON.stringify(data ?? [])).not.toContain("oncall@orga.a3test");
    }
  });

  it("anon MAY NOT change routing settings", async () => {
    await anonClient().from("organizations").update(HIJACK).eq("id", ORG_A);
    await expectBaseline(ORG_A, "anon/routing/update");
  });
});
