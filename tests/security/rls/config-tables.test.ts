import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ORG_A, ORG_B, serviceClient, signInAs } from "../setup/fixtures";
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

describe("tag_requests — owner-internal columns (migration 0035)", () => {
  // production_notes and the platform "viewed" markers are the platform owner's working data. Customers keep every
  // other column (their detail page, dashboard counts, timeline), but the database — not the app's choice of
  // columns — must refuse the internal ones, and a customer insert must not set owner-controlled values.
  const INTERNAL_COLUMNS = ["production_notes", "platform_viewed_at", "platform_viewed_by_profile_id"] as const;
  const CUSTOMER_COLUMNS =
    "id, organization_id, requested_by_profile_id, status, material, mounting_method, tag_size, quantity_notes, created_at, updated_at, delivered_at, completed_at";

  async function profileIdOf(client: SupabaseClient): Promise<string> {
    const { data: auth } = await client.auth.getUser();
    const { data, error } = await serviceClient()
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user?.id ?? "")
      .single();
    if (error || !data) throw new Error(`profile lookup failed: ${error?.message ?? "no row"}`);
    return data.id as string;
  }

  /** A fresh org-A request carrying an internal note, created through the trusted service path. */
  async function seedRequest(note: string): Promise<string> {
    const id = randomUUID();
    const { error } = await serviceClient()
      .from("tag_requests")
      .insert({ id, organization_id: ORG_A, status: "in_production", material: "Aluminum", production_notes: note });
    if (error) throw new Error(`seed tag request failed: ${error.message}`);
    return id;
  }

  async function readBack(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await serviceClient().from("tag_requests").select("*").eq("id", id).single();
    if (error || !data) throw new Error(`read back failed: ${error?.message ?? "no row"}`);
    return data as Record<string, unknown>;
  }

  it("customer_admin and customer_staff MAY NOT read the internal columns (or select *)", async () => {
    const note = `INTERNAL-NOTE-${randomUUID()}`;
    const id = await seedRequest(note);
    for (const [label, client] of [["admin_a", adminA], ["staff_a", staffA]] as const) {
      for (const column of [...INTERNAL_COLUMNS, "*"]) {
        const { data, error } = await client.from("tag_requests").select(column).eq("id", id);
        expect(error, `${label}/tag_requests/select-${column} should be denied`).toBeTruthy();
        expect(JSON.stringify(data ?? [])).not.toContain(note);
      }
    }
  });

  it("customers keep every non-internal column their screens use", async () => {
    const id = await seedRequest("customer-columns");
    const admin = await adminA.from("tag_requests").select(CUSTOMER_COLUMNS).eq("id", id);
    expect(admin.error?.message ?? null, "admin_a/tag_requests/select-customer-columns").toBeNull();
    expect(admin.data ?? []).toHaveLength(1);
    const staff = await staffA.from("tag_requests").select("id, status, created_at").eq("organization_id", ORG_A);
    expectRowsReturned(staff, "staff_a/tag_requests/select-dashboard-columns");
  });

  it("a customer insert cannot set owner-controlled columns or another requester (coerced, not rejected)", async () => {
    const [adminProfile, staffProfile, ownerProfile] = await Promise.all([
      profileIdOf(adminA),
      profileIdOf(staffA),
      profileIdOf(owner),
    ]);
    const id = randomUUID();
    const now = new Date().toISOString();
    const { error } = await adminA.from("tag_requests").insert({
      id,
      organization_id: ORG_A,
      status: "delivered",
      material: "Stainless steel",
      production_notes: "spoofed by the customer",
      delivered_at: now,
      completed_at: now,
      platform_viewed_at: now,
      platform_viewed_by_profile_id: ownerProfile,
      requested_by_profile_id: staffProfile,
    });
    expect(error?.message ?? null, "admin_a/tag_requests/insert-spoofed").toBeNull();
    const row = await readBack(id);
    expect(row).toMatchObject({
      status: "requested",
      material: "Stainless steel",
      production_notes: null,
      delivered_at: null,
      completed_at: null,
      platform_viewed_at: null,
      platform_viewed_by_profile_id: null,
      requested_by_profile_id: adminProfile,
    });
  });

  it("the customer create flow's insert-returning-id still works", async () => {
    const { data, error } = await adminA
      .from("tag_requests")
      .insert({ organization_id: ORG_A, status: "requested", material: "Aluminum" })
      .select("id")
      .single();
    expect(error?.message ?? null, "admin_a/tag_requests/insert-returning-id").toBeNull();
    expect(typeof data?.id).toBe("string");
  });

  it("platform_owner inserts keep explicit owner-controlled values", async () => {
    const id = randomUUID();
    const { error } = await owner
      .from("tag_requests")
      .insert({ id, organization_id: ORG_A, status: "ready", production_notes: "owner-authored note" });
    expect(error?.message ?? null, "owner/tag_requests/insert").toBeNull();
    expect(await readBack(id)).toMatchObject({ status: "ready", production_notes: "owner-authored note" });
  });

  it("platform_owner update with a returned representation still works (D3A owner action shape)", async () => {
    const id = await seedRequest("before owner edit");
    const { data, error } = await owner
      .from("tag_requests")
      .update({ status: "ready", production_notes: "after owner edit" })
      .eq("id", id)
      .eq("status", "in_production")
      .select("id, organization_id, status, updated_at")
      .maybeSingle();
    expect(error?.message ?? null, "owner/tag_requests/update-returning").toBeNull();
    expect(data).toMatchObject({ id, organization_id: ORG_A, status: "ready" });
    expect((await readBack(id)).production_notes).toBe("after owner edit");
  });

  it("owner_tag_request_internal returns internal fields to the owner only", async () => {
    const note = `OWNER-ONLY-${randomUUID()}`;
    const id = await seedRequest(note);

    const ownerOne = await owner.rpc("owner_tag_request_internal", { p_tag_request_id: id });
    expect(ownerOne.error?.message ?? null, "owner/rpc/internal-one").toBeNull();
    expect(ownerOne.data).toEqual([
      expect.objectContaining({ id, organization_id: ORG_A, production_notes: note, platform_viewed_at: null }),
    ]);

    const ownerAll = await owner.rpc("owner_tag_request_internal");
    expect(ownerAll.error?.message ?? null, "owner/rpc/internal-all").toBeNull();
    expect((ownerAll.data as { id: string }[]).some((row) => row.id === id)).toBe(true);

    for (const [label, client] of [["admin_a", adminA], ["staff_a", staffA]] as const) {
      const r = await client.rpc("owner_tag_request_internal", { p_tag_request_id: id });
      expect(r.error?.message ?? null, `${label}/rpc/internal`).toBeNull();
      expect(r.data ?? [], `${label}/rpc/internal leaked rows`).toEqual([]);
      expect(JSON.stringify(r.data ?? [])).not.toContain(note);
    }
  });

  it("mark_tag_request_viewed is owner-only and sets the viewer once", async () => {
    const id = await seedRequest("viewed-marker");
    const ownerProfile = await profileIdOf(owner);

    for (const [label, client] of [["admin_a", adminA], ["staff_a", staffA]] as const) {
      const r = await client.rpc("mark_tag_request_viewed", { p_tag_request_id: id });
      expect(r.error?.message ?? null, `${label}/rpc/mark-viewed`).toBeNull();
      expect(r.data, `${label}/rpc/mark-viewed must not mark`).toBe(false);
    }
    expect((await readBack(id)).platform_viewed_at).toBeNull();

    const first = await owner.rpc("mark_tag_request_viewed", { p_tag_request_id: id });
    expect(first.error?.message ?? null, "owner/rpc/mark-viewed").toBeNull();
    expect(first.data).toBe(true);
    const viewed = await readBack(id);
    expect(viewed.platform_viewed_at).not.toBeNull();
    expect(viewed.platform_viewed_by_profile_id).toBe(ownerProfile);

    const second = await owner.rpc("mark_tag_request_viewed", { p_tag_request_id: id });
    expect(second.data, "owner/rpc/mark-viewed is idempotent").toBe(false);
    expect((await readBack(id)).platform_viewed_at).toBe(viewed.platform_viewed_at);
  });
});
