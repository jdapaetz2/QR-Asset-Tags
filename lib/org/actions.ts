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
