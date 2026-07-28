import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ORG_A,
  ORG_B,
  TEST_PASSWORD,
  anonClient,
  serviceClient,
  signInAs,
} from "../setup/fixtures";
import { expectChanged, expectUnchanged, readColumn } from "../setup/assertions";

// Executed RLS — organizations + profiles (Phase A3.2). Every assertion runs through a real
// signed-in PostgREST client, proving Postgres behavior, not source strings.

let owner: SupabaseClient;
let adminA: SupabaseClient;
let staffA: SupabaseClient;

beforeAll(async () => {
  owner = await signInAs("owner");
  adminA = await signInAs("admin_a");
  staffA = await signInAs("staff_a");
});

describe("organizations — role-aware writes (migration 0032 + commercial triggers)", () => {
  it("customer_admin MAY update its own org's branding fields", async () => {
    const phone = "555-admin-a";
    const { error } = await adminA.from("organizations").update({ support_phone: phone }).eq("id", ORG_A);
    expect(error?.message ?? null, "admin_a/organizations/update-own").toBeNull();
    await expectChanged("organizations", ORG_A, "support_phone", phone, "admin_a/organizations/update-own");
  });

  it("customer_staff MAY NOT update its own org's configuration", async () => {
    await serviceClient().from("organizations").update({ support_phone: "555-baseline" }).eq("id", ORG_A);
    await staffA.from("organizations").update({ support_phone: "555-staff-hijack" }).eq("id", ORG_A);
    // USING excludes the row for a non-admin -> 0 rows affected, value unchanged.
    await expectUnchanged("organizations", ORG_A, "support_phone", "555-baseline", "staff_a/organizations/update-own");
  });

  it("customer_admin MAY NOT update another org (cross-tenant)", async () => {
    await serviceClient().from("organizations").update({ support_phone: "555-b-baseline" }).eq("id", ORG_B);
    await adminA.from("organizations").update({ support_phone: "555-a-crossorg" }).eq("id", ORG_B);
    await expectUnchanged("organizations", ORG_B, "support_phone", "555-b-baseline", "admin_a/organizations/update-cross-org");
  });

  it("platform_owner MAY update commercial fields", async () => {
    const { error } = await owner.from("organizations").update({ monthly_fee: 321 }).eq("id", ORG_A);
    expect(error?.message ?? null, "owner/organizations/update-commercial").toBeNull();
    await expectChanged("organizations", ORG_A, "monthly_fee", 321, "owner/organizations/update-commercial");
  });

  it("customer_admin MAY NOT mutate commercial or export-control fields (protect_commercial_fields)", async () => {
    // Commercial columns are settable only at INSERT or by a platform owner — protect_commercial_fields
    // coerces every other caller (including the service role, whose auth.uid() is null). So we capture the
    // live baseline rather than forcing one, keeping this test independent of prior tests' ordering.
    const feeBefore = await readColumn("organizations", ORG_A, "monthly_fee");
    const exportsBefore = await readColumn("organizations", ORG_A, "customer_exports_enabled");
    await adminA
      .from("organizations")
      .update({ monthly_fee: 999999, customer_exports_enabled: true })
      .eq("id", ORG_A);
    await expectUnchanged("organizations", ORG_A, "monthly_fee", feeBefore, "admin_a/organizations/commercial-coerced");
    await expectUnchanged("organizations", ORG_A, "customer_exports_enabled", exportsBefore, "admin_a/organizations/export-flag-coerced");
  });

  it("cross-org SELECT returns zero rows (no leakage)", async () => {
    const { data, error } = await adminA.from("organizations").select("id").eq("id", ORG_B);
    expect(error?.message ?? null, "admin_a/organizations/select-cross-org").toBeNull();
    expect((data ?? []).length, "admin_a/organizations/select-cross-org leaked").toBe(0);
  });
});

describe("profiles — privileged-column protection (migration 0032 trigger)", () => {
  async function ownProfileId(client: SupabaseClient): Promise<string> {
    const { data } = await client.from("profiles").select("id, role").limit(1000);
    // The signed-in client can read its own row (+ its org's). Find self by role uniqueness is unsafe;
    // instead read auth user id and match.
    const { data: userData } = await client.auth.getUser();
    const uid = userData.user?.id;
    const { data: self } = await client.from("profiles").select("id").eq("auth_user_id", uid).single();
    void data;
    return self!.id as string;
  }

  it("customer_admin CANNOT self-escalate profiles.role to platform_owner", async () => {
    const id = await ownProfileId(adminA);
    await adminA.from("profiles").update({ role: "platform_owner" }).eq("id", id);
    await expectUnchanged("profiles", id, "role", "customer_admin", "admin_a/profiles/self-escalate-role");
  });

  it("customer_staff CANNOT self-escalate profiles.role", async () => {
    const id = await ownProfileId(staffA);
    await staffA.from("profiles").update({ role: "customer_admin" }).eq("id", id);
    await expectUnchanged("profiles", id, "role", "customer_staff", "staff_a/profiles/self-escalate-role");
  });

  it("customer_staff CANNOT move itself to another organization", async () => {
    const id = await ownProfileId(staffA);
    await staffA.from("profiles").update({ organization_id: ORG_B }).eq("id", id);
    await expectUnchanged("profiles", id, "organization_id", ORG_A, "staff_a/profiles/self-move-org");
  });

  it("the invite -> active self-activation carve-out still works (role/org unchanged)", async () => {
    // An ephemeral invited user proves the narrow carve-out without polluting shared fixtures.
    const admin = serviceClient();
    const email = "invitee@orga.a3test";
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const prior = list?.users.find((u) => u.email === email);
    if (prior) await admin.auth.admin.deleteUser(prior.id);
    const { data: created } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
    const authId = created!.user!.id;
    const { data: prof } = await admin
      .from("profiles")
      .insert({ auth_user_id: authId, organization_id: ORG_A, email, role: "customer_staff", status: "invited" })
      .select("id")
      .single();
    const invitee = await (async () => {
      const c = anonClient();
      await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
      return c;
    })();
    const { error } = await invitee.from("profiles").update({ status: "active" }).eq("id", prof!.id);
    expect(error?.message ?? null, "invitee/profiles/self-activate").toBeNull();
    await expectChanged("profiles", prof!.id as string, "status", "active", "invitee/profiles/self-activate");
    await admin.auth.admin.deleteUser(authId);
  });

  it("cross-org profile visibility is blocked (admin_a cannot see org B profiles)", async () => {
    const { data } = await adminA.from("profiles").select("id, organization_id").eq("organization_id", ORG_B);
    expect((data ?? []).length, "admin_a/profiles/select-cross-org leaked").toBe(0);
  });
});

describe("profiles — insert is platform-owner only", () => {
  it("customer_admin CANNOT insert a profile (profiles_insert requires is_platform_owner)", async () => {
    const admin = serviceClient();
    const email = "rogue@orga.a3test";
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const prior = list?.users.find((u) => u.email === email);
    if (prior) await admin.auth.admin.deleteUser(prior.id);
    const { data: created } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
    const authId = created!.user!.id;
    const { error } = await adminA
      .from("profiles")
      .insert({ auth_user_id: authId, organization_id: ORG_A, email, role: "customer_staff", status: "active" });
    expect(error, "admin_a/profiles/insert should be DENIED").toBeTruthy();
    await admin.auth.admin.deleteUser(authId);
  });
});
