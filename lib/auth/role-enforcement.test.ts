import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase A3.1 — customer_admin vs customer_staff enforcement at the server + database boundary.
// Structural checks (node env): they assert the guards/policies exist in source. EXECUTED RLS
// verification against Postgres belongs to A3.2.
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const migration = read("supabase/migrations/0032_role_write_enforcement.sql");

describe("migration 0032 — role helpers + protective trigger", () => {
  it("adds both role helpers as SECURITY DEFINER with a locked search_path", () => {
    for (const fn of ["current_profile_role", "is_current_org_admin"]) {
      expect(migration).toContain(`function public.${fn}()`);
    }
    // Both helper bodies must be definer + locked search_path (no recursion, no path hijack).
    expect(migration.match(/security definer/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(migration.match(/set search_path = public/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("fails closed for disabled profiles and suspended organizations", () => {
    expect(migration).toContain("p.status <> 'disabled'");
    expect(migration).toContain("o.status = 'active'");
    expect(migration).toContain("p.role = 'customer_admin'");
  });

  it("derives scope from auth.uid(), never client input", () => {
    expect(migration).toContain("p.auth_user_id = auth.uid()");
  });

  it("protects profiles.role / organization_id / status from self-escalation", () => {
    expect(migration).toContain("protect_profile_privileged_fields");
    expect(migration).toContain("before update on public.profiles");
    expect(migration).toContain("new.role := old.role");
    expect(migration).toContain("new.organization_id := old.organization_id");
    expect(migration).toContain("new.status := old.status");
  });

  it("keeps the invite -> set-password self-activation working", () => {
    expect(migration).toContain("old.status = 'invited'");
    expect(migration).toContain("new.status = 'active'");
  });
});

describe("migration 0032 — admin-only write policies", () => {
  it("requires is_current_org_admin() on every tightened customer write", () => {
    for (const policy of [
      "organizations_update",
      "tag_requests_insert",
      "tag_request_assets_insert",
      "equipment_page_templates_insert",
      "equipment_page_templates_update",
      "equipment_page_templates_delete",
      "inspection_templates_insert",
      "inspection_templates_update",
      "inspection_templates_delete",
      "inspection_category_defaults_insert",
      "inspection_category_defaults_update",
      "inspection_category_defaults_delete",
    ]) {
      expect(migration, policy).toContain(`create policy ${policy}`);
    }
    // Every customer write branch is admin-gated.
    expect(migration.match(/is_current_org_admin\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it("splits the FOR ALL policies so staff SELECT is preserved unchanged", () => {
    expect(migration).toContain("drop policy if exists inspection_templates_rw");
    expect(migration).toContain("drop policy if exists inspection_category_defaults_rw");
    for (const p of [
      "inspection_templates_select",
      "inspection_category_defaults_select",
    ]) {
      expect(migration, p).toContain(`create policy ${p}`);
    }
    // The SELECT policies must NOT require admin — staff/operational reads stay open.
    const selectBlock = migration.slice(
      migration.indexOf("create policy inspection_templates_select"),
      migration.indexOf("create policy inspection_templates_insert")
    );
    expect(selectBlock).not.toContain("is_current_org_admin");
  });

  it("does not touch the tables staff must keep writing (outbound/return are SECURITY INVOKER)", () => {
    for (const table of [
      "on public.assets",
      "on public.asset_rental_sessions",
      "on public.form_submissions",
      "on public.scan_events",
      "on public.asset_acknowledgements",
      "on public.qr_links",
    ]) {
      expect(migration, table).not.toContain(`create policy ${table}`);
    }
    expect(migration).not.toContain("drop policy if exists assets_");
    expect(migration).not.toContain("drop policy if exists form_submissions_");
  });

  it("is additive — no already-applied migration file is edited", () => {
    const files = readdirSync(resolve(repo, "supabase/migrations")).sort();
    expect(files.at(-1)).toBe("0032_role_write_enforcement.sql");
    expect(files.filter((f) => f.endsWith(".sql")).length).toBe(32);
  });
});

describe("admin-only server actions (A3.1)", () => {
  // Server actions are independently invocable POST endpoints: an admin-only PAGE does not
  // protect the action it renders, so each action must guard itself.
  const ADMIN_ACTION_FILES = [
    "lib/org/actions.ts",
    "lib/notifications/actions.ts",
    "lib/tags/actions.ts",
    "lib/onboarding/actions.ts",
    "lib/inspections/category-defaults-actions.ts",
    "lib/inspections/org-templates-actions.ts",
    "lib/onboarding/org-templates-actions.ts",
  ];

  it("guards every administrative action with a customer-admin check", () => {
    for (const f of ADMIN_ACTION_FILES) {
      expect(read(f), f).toMatch(/requireCustomerAdmin(OrgId)?\(/);
    }
  });

  it("no administrative action still relies on the role-blind requireProfile()", () => {
    for (const f of ADMIN_ACTION_FILES) {
      expect(read(f), f).not.toContain("requireProfile()");
    }
  });

  it("leaves operational asset actions staff-callable", () => {
    // Asset CRUD is an operational surface both roles share (Wave 3N.1 decision).
    expect(read("lib/assets/actions.ts")).not.toContain("requireCustomerAdmin(");
  });
});

describe("customer export policy (A3.1)", () => {
  const route = read("app/(admin)/dashboard/submissions/export/route.ts");
  const page = read("app/(admin)/dashboard/submissions/page.tsx");

  it("the submissions inbox CSV is admin-only and owner-flag gated", () => {
    expect(route).toContain("requireCustomerAdminOrgId");
    expect(route).toContain('isExportTypeEnabled(toExportFlags(org), "submissions")');
    expect(route).toContain("403");
  });

  it("no longer uses the role-blind org guard", () => {
    expect(route).not.toContain("requireOrgId()");
  });

  it("hides the Export CSV action unless the caller may actually export", () => {
    expect(page).toContain("canExportSubmissions");
    expect(page).toContain("canCustomerUseExport");
    expect(page).toContain('isExportTypeEnabled(exportFlags, "submissions")');
  });

  it("owner-side export stays independent of the customer flags", () => {
    const ownerRoute = read(
      "app/(platform)/owner/organizations/[organizationId]/export/download/route.ts"
    );
    expect(ownerRoute).toContain("requireRole(ROLES.PLATFORM_OWNER)");
    expect(ownerRoute).not.toContain("canCustomerUseExport");
    expect(ownerRoute).not.toContain("isExportTypeEnabled");
  });

  it("keeps formula-injection escaping on the inbox CSV", () => {
    expect(read("lib/submissions/csv.ts")).toContain("csvField");
  });
});

describe("team management boundary (A3.1)", () => {
  const team = read("lib/team/actions.ts");

  it("rejects non-managers before any service-role client is created", () => {
    expect(team).toContain("function isTeamManager");
    expect(team.match(/isTeamManager\(actor\.role\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("scopes privileged profile lookups to the actor's own organization", () => {
    expect(team).toContain("function scopeToActorOrg");
    // Two call sites: regenerateInvite + setUserStatus. setUserRole is platform-owner-only, so it
    // must stay cross-org by design.
    expect(team.match(/scopeToActorOrg\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("setUserRole no longer needs the service role (owner satisfies RLS)", () => {
    const start = team.indexOf("export async function setUserRole");
    const body = team.slice(start);
    expect(body).not.toContain("createAdminClient()");
    expect(body).toContain("createClient()");
  });

  it("compensates a half-created invite so the account is not wedged", () => {
    expect(team).toContain("auth.admin.deleteUser");
  });

  it("never lets a customer admin mint a platform owner", () => {
    const invitations = read("lib/auth/invitations.ts");
    expect(invitations).toContain("PLATFORM_OWNER");
    // canManageMember refuses a platform_owner target outright.
    expect(invitations).toContain("targetRole === ROLES.PLATFORM_OWNER");
  });
});
