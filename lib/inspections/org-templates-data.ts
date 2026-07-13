/**
 * Server-side reads for organization inspection templates (Phase 2). RLS-scoped via the caller's Supabase
 * client — no service-role, no anon (the public route uses the get_asset_return_template RPC instead).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { InspectionTemplate } from "@/lib/inspections/types";
import type { OrgTemplateStatus } from "@/lib/inspections/org-templates";

export type OrgTemplateRecord = {
  id: string;
  family_key: string;
  version: number;
  status: OrgTemplateStatus;
  name: string;
  description: string | null;
  source_system_template_key: string;
  definition_json: InspectionTemplate;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const COLUMNS =
  "id, family_key, version, status, name, description, source_system_template_key, definition_json, created_at, updated_at, published_at";

/** All of the caller organization's inspection templates (every version), newest activity first. */
export async function getOrgTemplates(supabase: SupabaseClient): Promise<OrgTemplateRecord[]> {
  const { data } = await supabase
    .from("inspection_templates")
    .select(COLUMNS)
    .order("name", { ascending: true })
    .order("version", { ascending: false });
  return (data ?? []) as OrgTemplateRecord[];
}

/** A single template by id (RLS-scoped → null if not the caller's org). */
export async function getOrgTemplate(
  supabase: SupabaseClient,
  id: string
): Promise<OrgTemplateRecord | null> {
  const { data } = await supabase
    .from("inspection_templates")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as OrgTemplateRecord | null) ?? null;
}

/** Version numbers that already exist for a family (drives nextVersionNumber). */
export async function getFamilyVersions(
  supabase: SupabaseClient,
  familyKey: string
): Promise<number[]> {
  const { data } = await supabase
    .from("inspection_templates")
    .select("version")
    .eq("family_key", familyKey);
  return (data ?? []).map((r) => (r as { version: number }).version);
}

/** The latest PUBLISHED version per family — the assignable custom templates for the picker. */
export function latestPublishedPerFamily(
  rows: readonly OrgTemplateRecord[]
): { id: string; family_key: string; version: number; name: string }[] {
  const byFamily = new Map<string, OrgTemplateRecord>();
  for (const row of rows) {
    if (row.status !== "published") continue;
    const current = byFamily.get(row.family_key);
    if (!current || row.version > current.version) byFamily.set(row.family_key, row);
  }
  return Array.from(byFamily.values())
    .map((r) => ({ id: r.id, family_key: r.family_key, version: r.version, name: r.name }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Convenience: fetch + reduce to the assignable published templates. */
export async function getAssignableOrgTemplates(supabase: SupabaseClient) {
  return latestPublishedPerFamily(await getOrgTemplates(supabase));
}

export type AssetReturnTemplate = {
  templateId: string;
  familyKey: string;
  version: number;
  name: string;
  definition: InspectionTemplate;
};

/**
 * The published custom template assigned to an asset, via the `get_asset_return_template` SECURITY DEFINER
 * RPC. Safe for the anon client: it returns ONLY a published definition for a public asset (no drafts, no
 * lists, no cross-org). Returns null when the asset has no assigned custom template, or it isn't published.
 */
export async function getAssetReturnTemplate(
  supabase: SupabaseClient,
  assetId: string
): Promise<AssetReturnTemplate | null> {
  const { data, error } = await supabase.rpc("get_asset_return_template", {
    p_asset_id: assetId,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as {
    template_id: string;
    family_key: string;
    version: number;
    name: string;
    definition: InspectionTemplate;
  };
  return {
    templateId: row.template_id,
    familyKey: row.family_key,
    version: row.version,
    name: row.name,
    definition: row.definition,
  };
}
