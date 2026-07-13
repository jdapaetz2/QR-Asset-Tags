"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { normalizeCategoryKey } from "@/lib/assets/categories";
import { isReturnTemplateKey } from "@/lib/inspections/templates";
import {
  assetsToApplyDefault,
  type CategoryDefaultLookup,
} from "@/lib/inspections/category-defaults";
import { getOrgCategoryDefaults } from "@/lib/inspections/category-defaults-data";
import { getOrgTemplate } from "@/lib/inspections/org-templates-data";

export type CategoryDefaultFormState = { error?: string };

const PAGE = "/dashboard/templates/return-inspections";

/**
 * Create or change an organization category → default return-template mapping. Upserts on
 * (organization_id, normalized_category_value) so re-mapping an existing category just updates it.
 * organization_id is derived from the profile (never client input); RLS is the boundary. Changing a
 * mapping never rewrites existing assets — it only affects future create/import/apply resolution.
 */
export async function saveCategoryDefault(
  _prev: CategoryDefaultFormState,
  formData: FormData
): Promise<CategoryDefaultFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const category = ((formData.get("category") as string) ?? "").trim();
  const normalized = normalizeCategoryKey(category);
  if (!normalized) return { error: "Enter a category." };

  // The target is either a system key or a published custom template. A custom target still stores a
  // system key (the custom's source) so the mapping degrades gracefully if the custom version is later
  // removed (the FK `on delete set null` clears the id and the key takes over).
  const target = ((formData.get("return_target") as string) ?? "").trim();
  const supabase = await createClient();

  let return_template_key: string;
  let return_template_id: string | null = null;

  if (target.startsWith("custom:")) {
    const templateId = target.slice("custom:".length);
    const tmpl = await getOrgTemplate(supabase, templateId);
    if (!tmpl) return { error: "Custom template not found." };
    if (tmpl.status !== "published") return { error: "Choose a published custom template." };
    if (!isReturnTemplateKey(tmpl.source_system_template_key)) {
      return { error: "This custom template has an unknown base template." };
    }
    return_template_key = tmpl.source_system_template_key;
    return_template_id = templateId;
  } else {
    const key = target.startsWith("system:") ? target.slice("system:".length) : target;
    if (!isReturnTemplateKey(key)) return { error: "Choose a valid return inspection template." };
    return_template_key = key;
  }

  const { error } = await supabase.from("inspection_category_defaults").upsert(
    {
      organization_id: profile.organization_id,
      category_value: category,
      normalized_category_value: normalized,
      return_template_key,
      return_template_id,
    },
    { onConflict: "organization_id,normalized_category_value" }
  );
  if (error) return { error: "Could not save the mapping. Please try again." };

  redirect(PAGE);
}

/** Remove a mapping. Existing asset assignments are untouched — only future resolution changes. */
export async function removeCategoryDefault(
  id: string,
  _prev: CategoryDefaultFormState,
  _formData: FormData
): Promise<CategoryDefaultFormState> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_category_defaults")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not remove the mapping." };
  redirect(PAGE);
}

/**
 * Deliberately apply a category default to that category's UNASSIGNED assets only. Assets with an
 * explicit return_inspection_template_key are never touched. Server re-validates the org + template key;
 * RLS scopes both the mapping read and the asset update to the caller's organization.
 */
export async function applyCategoryDefaultToUnassigned(
  normalizedCategoryValue: string,
  _prev: CategoryDefaultFormState,
  _formData: FormData
): Promise<CategoryDefaultFormState> {
  await requireProfile();
  const supabase = await createClient();

  const defaults = await getOrgCategoryDefaults(supabase);
  const mapping = defaults.find(
    (d) => d.normalized_category_value === normalizedCategoryValue
  );
  const templateKey = mapping?.return_template_key;
  if (!templateKey || !isReturnTemplateKey(templateKey)) {
    redirect(PAGE); // no valid mapping → nothing to apply (redirect() returns never)
  }
  // templateKey is narrowed to a valid ReturnTemplateKey here; restrict the lookup to this one category.
  const lookup: CategoryDefaultLookup = {
    [normalizeCategoryKey(mapping!.category_value)]: templateKey,
  };

  const { data: assets } = await supabase
    .from("assets")
    .select("id, category, return_inspection_template_key")
    .is("archived_at", null);

  const targets = assetsToApplyDefault(
    (assets ?? []) as {
      id: string;
      category: string | null;
      return_inspection_template_key: string | null;
    }[],
    lookup
  );

  if (targets.length > 0) {
    const { error } = await supabase
      .from("assets")
      .update({ return_inspection_template_key: templateKey })
      .in(
        "id",
        targets.map((t) => t.id)
      );
    if (error) return { error: "Could not apply the default. Please try again." };
  }

  redirect(`${PAGE}?applied=${targets.length}`);
}
