import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ORG_A, ORG_B, signInAs } from "../setup/fixtures";
import { expectInsertAllowed, expectInsertDenied, expectNoRows, expectRowsReturned } from "../setup/assertions";

// Executed RLS — administrative config tables (migration 0032 role-aware writes). The invariant
// under test: customer_staff keeps the SELECTs its operational screens need, but every WRITE now
// requires an active customer_admin; cross-org is denied for everyone but the platform owner.

let owner: SupabaseClient;
let adminA: SupabaseClient;
let staffA: SupabaseClient;

const def = { fields: [] };

beforeAll(async () => {
  owner = await signInAs("owner");
  adminA = await signInAs("admin_a");
  staffA = await signInAs("staff_a");
});

describe("inspection_templates", () => {
  it("customer_staff MAY read (operational screens depend on it)", async () => {
    const r = await staffA.from("inspection_templates").select("id").eq("organization_id", ORG_A);
    expectRowsReturned(r, "staff_a/inspection_templates/select-own");
  });

  it("customer_staff MAY NOT write", async () => {
    const r = await staffA.from("inspection_templates").insert({
      organization_id: ORG_A, family_key: "staff-attempt", version: 1, status: "draft",
      name: "x", source_system_template_key: "generic_return", definition_json: def,
    });
    expectInsertDenied(r, "staff_a/inspection_templates/insert");
  });

  it("customer_admin MAY write its own org", async () => {
    const r = await adminA.from("inspection_templates").insert({
      organization_id: ORG_A, family_key: "admin-created", version: 1, status: "draft",
      name: "admin tpl", source_system_template_key: "generic_return", definition_json: def,
    });
    expectInsertAllowed(r, "admin_a/inspection_templates/insert-own");
  });

  it("customer_admin MAY NOT write another org (cross-tenant)", async () => {
    const r = await adminA.from("inspection_templates").insert({
      organization_id: ORG_B, family_key: "cross", version: 1, status: "draft",
      name: "x", source_system_template_key: "generic_return", definition_json: def,
    });
    expectInsertDenied(r, "admin_a/inspection_templates/insert-cross-org");
  });

  it("cross-org SELECT returns zero rows", async () => {
    const r = await adminA.from("inspection_templates").select("id").eq("organization_id", ORG_B);
    expectNoRows(r, "admin_a/inspection_templates/select-cross-org");
  });
});

describe("inspection_category_defaults", () => {
  it("customer_staff MAY NOT write", async () => {
    const r = await staffA.from("inspection_category_defaults").insert({
      organization_id: ORG_A, category_value: "Trailer", normalized_category_value: "staff-trailer", return_template_key: "generic_return",
    });
    expectInsertDenied(r, "staff_a/inspection_category_defaults/insert");
  });

  it("customer_admin MAY write its own org", async () => {
    const r = await adminA.from("inspection_category_defaults").insert({
      organization_id: ORG_A, category_value: "Trailer", normalized_category_value: "admin-trailer", return_template_key: "generic_return",
    });
    expectInsertAllowed(r, "admin_a/inspection_category_defaults/insert-own");
  });

  it("customer_admin MAY NOT write another org", async () => {
    const r = await adminA.from("inspection_category_defaults").insert({
      organization_id: ORG_B, category_value: "Trailer", normalized_category_value: "cross-trailer", return_template_key: "generic_return",
    });
    expectInsertDenied(r, "admin_a/inspection_category_defaults/insert-cross-org");
  });
});

describe("equipment_page_templates", () => {
  it("customer_staff MAY read (catalog) but MAY NOT write", async () => {
    const read = await staffA.from("equipment_page_templates").select("id").eq("organization_id", ORG_A);
    expectRowsReturned(read, "staff_a/equipment_page_templates/select-own");
    const write = await staffA.from("equipment_page_templates").insert({ organization_id: ORG_A, key: "staff-key", name: "x", is_system: false });
    expectInsertDenied(write, "staff_a/equipment_page_templates/insert");
  });

  it("customer_admin MAY write its own non-system row", async () => {
    const r = await adminA.from("equipment_page_templates").insert({ organization_id: ORG_A, key: "admin-key", name: "admin tpl", is_system: false });
    expectInsertAllowed(r, "admin_a/equipment_page_templates/insert-own");
  });

  it("customer_admin MAY NOT create a system row", async () => {
    const r = await adminA.from("equipment_page_templates").insert({ organization_id: ORG_A, key: "sys-key", name: "x", is_system: true });
    expectInsertDenied(r, "admin_a/equipment_page_templates/insert-system");
  });

  it("customer_admin MAY NOT write another org", async () => {
    const r = await adminA.from("equipment_page_templates").insert({ organization_id: ORG_B, key: "cross-key", name: "x", is_system: false });
    expectInsertDenied(r, "admin_a/equipment_page_templates/insert-cross-org");
  });
});

describe("tag_requests", () => {
  it("customer_staff MAY read (dashboard counts) but MAY NOT create", async () => {
    const read = await staffA.from("tag_requests").select("id").eq("organization_id", ORG_A);
    expectRowsReturned(read, "staff_a/tag_requests/select-own");
    const write = await staffA.from("tag_requests").insert({ organization_id: ORG_A, status: "requested" });
    expectInsertDenied(write, "staff_a/tag_requests/insert");
  });

  it("customer_admin MAY create in its own org", async () => {
    const r = await adminA.from("tag_requests").insert({ organization_id: ORG_A, status: "requested" });
    expectInsertAllowed(r, "admin_a/tag_requests/insert-own");
  });

  it("customer_admin MAY NOT create in another org", async () => {
    const r = await adminA.from("tag_requests").insert({ organization_id: ORG_B, status: "requested" });
    expectInsertDenied(r, "admin_a/tag_requests/insert-cross-org");
  });

  it("platform_owner MAY manage tag-request status", async () => {
    const { data: seededA } = await owner.from("tag_requests").select("id").eq("organization_id", ORG_A).limit(1);
    const id = (seededA ?? [])[0]?.id as string;
    expect(id, "a seeded org-A tag request exists").toBeTruthy();
    const { error } = await owner.from("tag_requests").update({ status: "in_review" }).eq("id", id);
    expect(error?.message ?? null, "owner/tag_requests/update-status").toBeNull();
  });
});
