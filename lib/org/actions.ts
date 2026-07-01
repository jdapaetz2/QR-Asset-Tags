"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId, requireRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import {
  normalizeOrgSettings,
  type RawOrgSettingsForm,
} from "@/lib/org/settings";
import {
  LOGO_BUCKET,
  logoObjectName,
  logoPathPrefix,
  logoUrlForSave,
  managedLogoObjectPath,
  validateLogoFile,
} from "@/lib/org/logo";
import { parseExportSettingsForm } from "@/lib/export/types";
import { normalizePlanForm, type RawPlanForm } from "@/lib/plans/settings";
import { normalizeNewOrg, type RawNewOrgForm } from "@/lib/org/create";

export type OrgSettingsState = { error?: string };

const FIELDS = [
  "name",
  "support_phone",
  "support_email",
  "website_url",
  "primary_color",
  "logo_url",
] as const;

type UploadedFile = {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function readForm(formData: FormData): RawOrgSettingsForm {
  const raw: RawOrgSettingsForm = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

function readLogoFile(formData: FormData): UploadedFile | null {
  const entry = formData.get("file");
  if (typeof entry === "string" || !entry || entry.size === 0) return null;
  return entry;
}

/**
 * Shared save core. `organizationId` is always supplied by the caller from a
 * trusted source (the signed-in profile, or the owner route param) — never from
 * form input. RLS independently scopes the update + the storage write.
 */
async function saveOrgSettings(
  supabase: SupabaseClient,
  organizationId: string,
  formData: FormData
): Promise<OrgSettingsState> {
  const file = readLogoFile(formData);

  const raw = readForm(formData);
  // File wins: ignore the typed logo URL when a file is chosen.
  raw.logo_url = logoUrlForSave({ hasFile: Boolean(file), urlValue: raw.logo_url });

  const result = normalizeOrgSettings(raw);
  if (!result.value) return { error: result.error };

  if (file) {
    const fileError = validateLogoFile({ type: file.type, size: file.size });
    if (fileError) return { error: fileError };
  }

  // Current logo (for best-effort cleanup of a replaced managed object).
  const { data: existing } = await supabase
    .from("organizations")
    .select("logo_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (!existing) return { error: "Organization not found." };

  let logoUrl = result.value.logo_url;
  let uploadedPath: string | null = null;
  if (file) {
    uploadedPath = `${logoPathPrefix(organizationId)}/${logoObjectName(
      randomUUID(),
      file.type
    )}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      return { error: "Could not upload the logo. Please try again." };
    }
    // Stable public URL (public bucket) — never a signed/expiring URL.
    logoUrl = supabase.storage.from(LOGO_BUCKET).getPublicUrl(uploadedPath).data
      .publicUrl;
  }

  const { data, error } = await supabase
    .from("organizations")
    .update({ ...result.value, logo_url: logoUrl })
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (uploadedPath) {
      await supabase.storage.from(LOGO_BUCKET).remove([uploadedPath]);
    }
    return {
      error: error ? "Could not save settings. Please try again." : "Organization not found.",
    };
  }

  const oldPath = managedLogoObjectPath(existing.logo_url, organizationId);
  if (oldPath && oldPath !== uploadedPath) {
    await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
  }

  return {};
}

const NEW_ORG_FIELDS = [
  "name",
  "slug",
  "status",
  "support_phone",
  "support_email",
  "website_url",
  "primary_color",
  "logo_url",
  "powered_by_label",
  "plan_key",
  "plan_name",
  "billing_interval",
  "asset_limit",
  "intro_price_cents",
  "renewal_price_cents",
  "tag_credit_cents",
  "storage_limit_mb",
  "video_uploads_enabled",
  "plan_notes",
] as const;

/**
 * Platform-owner-only: create a new customer organization. Route + this action are
 * gated by `requireRole`, and RLS (`organizations_insert with check is_platform_owner()`)
 * is the independent backstop — no service-role. Plan/commercial fields are set on
 * insert (the 0016 trigger only guards UPDATE); export flags/notifications keep their
 * DB defaults (off/empty). No assets, users, or demo data are created.
 */
export async function createOrganization(
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  const raw: RawNewOrgForm = {};
  for (const field of NEW_ORG_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  const result = normalizeNewOrg(raw);
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert(result.value)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = unique violation on the slug.
    if (error.code === "23505") {
      return { error: "That slug is already taken — choose another." };
    }
    return { error: "Could not create the organization. Please try again." };
  }
  if (!data) return { error: "Could not create the organization. Please try again." };

  redirect(`/owner/organizations/${data.id}`);
}

/** Customer admin updates their own organization (org derived from the profile). */
export async function updateOrgSettings(
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  const organizationId = await requireOrgId();
  const supabase = await createClient();
  const result = await saveOrgSettings(supabase, organizationId, formData);
  if (result.error) return result;
  redirect("/dashboard/settings");
}

/** Platform admin updates a customer organization (orgId from the owner route). */
export async function updateOrgSettingsAsOwner(
  organizationId: string,
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  await requireRole(ROLES.PLATFORM_OWNER);
  const supabase = await createClient();
  const result = await saveOrgSettings(supabase, organizationId, formData);
  if (result.error) return result;
  redirect(`/owner/organizations/${organizationId}/settings`);
}

/**
 * Platform-owner-only: set a customer organization's export flags. A DB trigger
 * (0015) independently blocks any non-owner from changing these, so this is the
 * single sanctioned path. `requireRole` is the route-level gate.
 */
export async function updateOrgExportSettings(
  organizationId: string,
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  await requireRole(ROLES.PLATFORM_OWNER);
  const flags = parseExportSettingsForm(formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(flags)
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not save export settings." };
  if (!data) return { error: "Organization not found." };

  redirect(`/owner/organizations/${organizationId}/settings`);
}

const PLAN_FORM_FIELDS = [
  "plan_key",
  "plan_name",
  "billing_interval",
  "asset_limit",
  "intro_price_cents",
  "renewal_price_cents",
  "tag_credit_cents",
  "storage_limit_mb",
  "video_uploads_enabled",
  "plan_notes",
] as const;

/**
 * Platform-owner-only: set a customer organization's plan / commercial fields. The
 * 0016 DB trigger independently blocks any non-owner from changing these, so this is
 * the single sanctioned path. `requireRole` is the route-level gate.
 */
export async function updateOrgPlan(
  organizationId: string,
  _prev: OrgSettingsState,
  formData: FormData
): Promise<OrgSettingsState> {
  await requireRole(ROLES.PLATFORM_OWNER);

  const raw: RawPlanForm = {};
  for (const field of PLAN_FORM_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  const result = normalizePlanForm(raw);
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(result.value)
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not save plan settings." };
  if (!data) return { error: "Organization not found." };

  redirect(`/owner/organizations/${organizationId}/settings`);
}
