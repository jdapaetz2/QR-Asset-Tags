"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { RETURN_TEMPLATES, isReturnTemplateKey } from "@/lib/inspections/templates";
import {
  copyFromSystemTemplate,
  nextVersionNumber,
  stampDefinition,
  validateOrgTemplateDefinition,
} from "@/lib/inspections/org-templates";
import { getOrgTemplate, getFamilyVersions } from "@/lib/inspections/org-templates-data";
import type { InspectionTemplate } from "@/lib/inspections/types";

export type OrgTemplateState = { error?: string };

const PAGE = "/dashboard/templates/return-inspections";
const editorHref = (id: string) => `${PAGE}/custom/${id}`;

/** Copy a curated system template into a new draft organization template (version 1). */
export async function copySystemTemplate(
  systemKey: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }
  if (!isReturnTemplateKey(systemKey)) return { error: "Unknown system template." };

  const system = RETURN_TEMPLATES[systemKey];
  const familyKey = randomUUID();
  const definition = stampDefinition(
    copyFromSystemTemplate(systemKey, familyKey),
    familyKey,
    1,
    `${system.name} (custom)`,
    system.description
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inspection_templates")
    .insert({
      organization_id: profile.organization_id,
      inspection_type: "return",
      family_key: familyKey,
      version: 1,
      status: "draft",
      name: definition.name,
      description: definition.description,
      source_system_template_key: systemKey,
      definition_json: definition,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not copy the template. Please try again." };
  redirect(editorHref(data.id));
}

/** Save edits to a DRAFT template. Server re-validates the full definition; family/version are preserved. */
export async function saveDraft(
  id: string,
  _prev: OrgTemplateState,
  formData: FormData
): Promise<OrgTemplateState> {
  await requireProfile();
  const supabase = await createClient();

  const row = await getOrgTemplate(supabase, id);
  if (!row) return { error: "Template not found." };
  if (row.status !== "draft") return { error: "Only a draft can be edited. Create a new version." };

  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const rawJson = formData.get("definition_json");
  if (typeof rawJson !== "string") return { error: "The template definition is missing." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { error: "The template definition could not be read." };
  }
  // Overlay the edited name/description onto the definition before validating.
  const withMeta = { ...(parsed as Record<string, unknown>), name, description };
  const result = validateOrgTemplateDefinition(withMeta);
  if ("error" in result) return { error: result.error };

  // Preserve the DB family key + version — never trust the client for identity.
  const definition = stampDefinition(result.value, row.family_key, row.version, name, description);

  const { data, error } = await supabase
    .from("inspection_templates")
    .update({ name, description, definition_json: definition })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not save the template. Please try again." };
  if (!data) return { error: "Template not found." };

  redirect(editorHref(id));
}

/** Publish a draft: validate, freeze it (immutable via trigger), make it available to public resolution. */
export async function publishTemplate(
  id: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  await requireProfile();
  const supabase = await createClient();

  const row = await getOrgTemplate(supabase, id);
  if (!row) return { error: "Template not found." };
  if (row.status !== "draft") return { error: "Only a draft can be published." };

  const result = validateOrgTemplateDefinition(row.definition_json);
  if ("error" in result) return { error: `Cannot publish: ${result.error}` };

  const { error } = await supabase
    .from("inspection_templates")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not publish the template. Please try again." };

  redirect(editorHref(id));
}

/** Create a new DRAFT version from an existing version (published or draft). Never edits in place. */
export async function createNewVersion(
  id: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }
  const supabase = await createClient();

  const row = await getOrgTemplate(supabase, id);
  if (!row) return { error: "Template not found." };

  const versions = await getFamilyVersions(supabase, row.family_key);
  const version = nextVersionNumber(versions);
  const definition = stampDefinition(
    row.definition_json as InspectionTemplate,
    row.family_key,
    version,
    row.name,
    row.description
  );

  const { data, error } = await supabase
    .from("inspection_templates")
    .insert({
      organization_id: profile.organization_id,
      inspection_type: "return",
      family_key: row.family_key,
      version,
      status: "draft",
      name: row.name,
      description: row.description,
      source_system_template_key: row.source_system_template_key,
      definition_json: definition,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "A draft already exists for this template. Edit or publish it first." };
    }
    return { error: "Could not create a new version. Please try again." };
  }
  redirect(editorHref(data.id));
}

/** Retire a PUBLISHED version. Existing submissions are untouched; assigned assets need review. */
export async function retireTemplate(
  id: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  await requireProfile();
  const supabase = await createClient();
  const row = await getOrgTemplate(supabase, id);
  if (!row) return { error: "Template not found." };
  if (row.status !== "published") return { error: "Only a published version can be retired." };

  const { error } = await supabase
    .from("inspection_templates")
    .update({ status: "retired" })
    .eq("id", id);
  if (error) return { error: "Could not retire the template." };
  redirect(PAGE);
}

/** Discard (delete) a DRAFT version. Published/retired versions are immutable and cannot be deleted. */
export async function discardDraft(
  id: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  await requireProfile();
  const supabase = await createClient();
  const row = await getOrgTemplate(supabase, id);
  if (!row) return { error: "Template not found." };
  if (row.status !== "draft") return { error: "Only a draft can be discarded." };

  const { error } = await supabase.from("inspection_templates").delete().eq("id", id);
  if (error) return { error: "Could not discard the draft." };
  redirect(PAGE);
}

/**
 * Deliberately move assets assigned to one version onto another version of the SAME family. Only touches
 * assets that currently point at `fromTemplateId`; RLS scopes both templates + the asset update to the org.
 */
export async function moveAssignedAssetsToVersion(
  fromTemplateId: string,
  toTemplateId: string,
  _prev: OrgTemplateState,
  _formData: FormData
): Promise<OrgTemplateState> {
  await requireProfile();
  const supabase = await createClient();

  const from = await getOrgTemplate(supabase, fromTemplateId);
  const to = await getOrgTemplate(supabase, toTemplateId);
  if (!from || !to) return { error: "Template not found." };
  if (from.family_key !== to.family_key) {
    return { error: "Assets can only be moved between versions of the same template." };
  }
  if (to.status !== "published") return { error: "Assets can only be moved to a published version." };

  const { data, error } = await supabase
    .from("assets")
    .update({ return_inspection_template_id: toTemplateId })
    .eq("return_inspection_template_id", fromTemplateId)
    .select("id");
  if (error) return { error: "Could not move the assigned assets." };

  redirect(`${PAGE}?moved=${data?.length ?? 0}`);
}
