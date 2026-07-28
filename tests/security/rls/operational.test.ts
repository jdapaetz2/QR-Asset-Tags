import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ASSET, ORG_A, ORG_B, SUBMISSION, signInAs } from "../setup/fixtures";
import {
  expectChanged,
  expectInsertDenied,
  expectNoRows,
  expectRowsReturned,
  expectUnchanged,
} from "../setup/assertions";

// Executed RLS — operational tables. These are deliberately staff-writable (the outbound/return
// RPCs are SECURITY INVOKER), so the tests prove staff KEEPS access within its own org while every
// cross-tenant path returns nothing and disabled/suspended actors are fully locked out.

let adminA: SupabaseClient;
let staffA: SupabaseClient;
let adminB: SupabaseClient;
let disabledA: SupabaseClient;
let adminC: SupabaseClient; // active admin whose ORG is suspended

beforeAll(async () => {
  adminA = await signInAs("admin_a");
  staffA = await signInAs("staff_a");
  adminB = await signInAs("admin_b");
  disabledA = await signInAs("disabled_a");
  adminC = await signInAs("admin_c");
});

describe("assets — own-org access, staff still writes, cross-org denied", () => {
  it("customer_admin reads its own org's assets", async () => {
    const r = await adminA.from("assets").select("id").eq("organization_id", ORG_A);
    expectRowsReturned(r, "admin_a/assets/select-own");
  });

  it("customer_staff MAY still update an operational field on its own org's asset", async () => {
    const name = "renamed-by-staff";
    const { error } = await staffA.from("assets").update({ asset_name: name }).eq("id", ASSET.A_PRIVATE);
    expect(error?.message ?? null, "staff_a/assets/update-own").toBeNull();
    await expectChanged("assets", ASSET.A_PRIVATE, "asset_name", name, "staff_a/assets/update-own");
  });

  it("cross-org asset SELECT returns zero rows", async () => {
    const r = await adminA.from("assets").select("id").eq("organization_id", ORG_B);
    expectNoRows(r, "admin_a/assets/select-cross-org");
  });

  it("cross-org asset UPDATE does not take effect", async () => {
    await adminA.from("assets").update({ asset_name: "hijacked" }).eq("id", ASSET.B_PUBLIC);
    await expectUnchanged("assets", ASSET.B_PUBLIC, "asset_name", "B Public", "admin_a/assets/update-cross-org");
  });

  it("cross-org asset INSERT is denied", async () => {
    const r = await adminA.from("assets").insert({ organization_id: ORG_B, asset_code: "X", asset_name: "x" });
    expectInsertDenied(r, "admin_a/assets/insert-cross-org");
  });
});

describe("form_submissions / documents / qr_links — cross-org denial", () => {
  it("admin reads its own org submissions", async () => {
    const r = await adminA.from("form_submissions").select("id").eq("organization_id", ORG_A);
    expectRowsReturned(r, "admin_a/form_submissions/select-own");
  });

  it("cross-org submissions SELECT returns zero rows", async () => {
    const r = await adminA.from("form_submissions").select("id").eq("id", SUBMISSION.B_DAMAGE);
    expectNoRows(r, "admin_a/form_submissions/select-cross-org");
  });

  it("cross-org documents SELECT returns zero rows (private stays private)", async () => {
    const r = await adminA.from("documents").select("id").eq("organization_id", ORG_B);
    expectNoRows(r, "admin_a/documents/select-cross-org");
  });

  it("cross-org qr_links SELECT returns zero rows", async () => {
    const r = await adminA.from("qr_links").select("id").eq("organization_id", ORG_B);
    expectNoRows(r, "admin_a/qr_links/select-cross-org");
  });

  it("cross-org rental sessions SELECT returns zero rows", async () => {
    const r = await adminB.from("asset_rental_sessions").select("id").eq("organization_id", ORG_A);
    expectNoRows(r, "admin_b/asset_rental_sessions/select-cross-org");
  });
});

describe("disabled profile is locked out of its own org (current_org_id fails closed)", () => {
  it("disabled staff reads zero rows from its org's assets", async () => {
    const r = await disabledA.from("assets").select("id").eq("organization_id", ORG_A);
    expectNoRows(r, "disabled_a/assets/select-own");
  });

  it("disabled staff cannot insert into its org", async () => {
    const r = await disabledA.from("assets").insert({ organization_id: ORG_A, asset_code: "D", asset_name: "d" });
    expectInsertDenied(r, "disabled_a/assets/insert-own");
  });
});

describe("suspended organization locks out its own active admin (current_org_id requires active org)", () => {
  it("admin of a suspended org reads zero rows from its own assets", async () => {
    const r = await adminC.from("assets").select("id").eq("organization_id", "cccccccc-cccc-cccc-cccc-cccccccccccc");
    expectNoRows(r, "admin_c/assets/select-own-suspended");
  });

  it("admin of a suspended org cannot update its own org", async () => {
    await adminC.from("organizations").update({ support_phone: "555-suspended" }).eq("id", "cccccccc-cccc-cccc-cccc-cccccccccccc");
    await expectUnchanged("organizations", "cccccccc-cccc-cccc-cccc-cccccccccccc", "support_phone", null, "admin_c/organizations/update-suspended");
  });
});

describe("export data boundary (the DB half)", () => {
  // Export flag mutation is proven denied in org-profiles.test.ts (protect_commercial_fields). Here we
  // prove the other half: even with exports conceptually enabled, RLS still yields nothing cross-org, so
  // an export query can never read another tenant's rows.
  it("a customer admin cannot read another org's assets or submissions for export", async () => {
    const assets = await adminA.from("assets").select("id").eq("organization_id", ORG_B);
    const subs = await adminA.from("form_submissions").select("id").eq("organization_id", ORG_B);
    expectNoRows(assets, "admin_a/export/assets-cross-org");
    expectNoRows(subs, "admin_a/export/submissions-cross-org");
  });
});
