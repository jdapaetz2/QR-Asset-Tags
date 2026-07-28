import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ASSET, QR, SUBMISSION, anonClient, signInAs } from "../setup/fixtures";
import { expectUnchanged, readColumn } from "../setup/assertions";

// Executed RPC boundaries. Grant-level anon revocation for every RPC is asserted against the
// Postgres catalog in catalog.test.ts; here we prove BEHAVIOR: anon is refused at call time and a
// wrong-org caller cannot act on another tenant's row even though the RPC is SECURITY INVOKER.

let adminA: SupabaseClient;
let adminB: SupabaseClient;
let anon: SupabaseClient;

beforeAll(async () => {
  adminA = await signInAs("admin_a");
  adminB = await signInAs("admin_b");
  anon = anonClient();
});

describe("mark_return_and_resolve (SECURITY INVOKER)", () => {
  it("a wrong-org caller cannot resolve another tenant's return submission", async () => {
    const { data } = await adminB.rpc("mark_return_and_resolve", { p_submission_id: SUBMISSION.A_RETURN });
    expect(data, "admin_b/mark_return_and_resolve/cross-org result").toBe("not_found");
    await expectUnchanged("form_submissions", SUBMISSION.A_RETURN, "status", "new", "admin_b/mark_return_and_resolve/cross-org");
  });

  it("anon cannot execute it (execute revoked)", async () => {
    const { error } = await anon.rpc("mark_return_and_resolve", { p_submission_id: SUBMISSION.A_RETURN });
    expect(error, "anon/mark_return_and_resolve should be DENIED").toBeTruthy();
  });

  it("the owning org's admin CAN resolve it (positive control)", async () => {
    const { data, error } = await adminA.rpc("mark_return_and_resolve", { p_submission_id: SUBMISSION.A_RETURN });
    expect(error?.message ?? null, "admin_a/mark_return_and_resolve/own").toBeNull();
    expect(["returned", "resolved_only"], "admin_a/mark_return_and_resolve/own result").toContain(data);
    const status = await readColumn("form_submissions", SUBMISSION.A_RETURN, "status");
    expect(status, "admin_a/mark_return_and_resolve/own status").toBe("resolved");
  });
});

describe("set_qr_production_primary (SECURITY INVOKER)", () => {
  it("anon cannot execute it (execute revoked)", async () => {
    const { error } = await anon.rpc("set_qr_production_primary", { p_qr_link_id: QR.A });
    expect(error, "anon/set_qr_production_primary should be DENIED").toBeTruthy();
  });
});

describe("get_asset_return_template (SECURITY DEFINER, anon-executable)", () => {
  it("anon MAY call it (grant present) and it does not error", async () => {
    const { error } = await anon.rpc("get_asset_return_template", { p_asset_id: ASSET.A_PUBLIC });
    expect(error?.message ?? null, "anon/get_asset_return_template/callable").toBeNull();
  });

  it("it returns no template for a PRIVATE asset (no leakage through the definer)", async () => {
    const { data, error } = await anon.rpc("get_asset_return_template", { p_asset_id: ASSET.A_PRIVATE });
    expect(error?.message ?? null, "anon/get_asset_return_template/private").toBeNull();
    expect((data ?? []).length, "anon/get_asset_return_template/private leaked a template").toBe(0);
  });
});
