"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import {
  validateTemplateForm,
  type RawTemplateForm,
} from "@/lib/onboarding/org-templates";

export type TemplateFormState = { error?: string };

const TEXT_FIELDS = [
  "key",
  "name",
  "description",
  "category",
  "headline",
  "quick_start_text",
  "safety_notes",
  "fuel_power_notes",
  "return_notes",
  "troubleshooting_notes",
  "emergency_notes",
  "is_active",
] as const;

function readForm(formData: FormData): RawTemplateForm {
  const raw: RawTemplateForm = {};
  for (const field of TEXT_FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

/** Create a custom equipment-page template for the caller's organization. */
export async function createOrgTemplate(
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  const profile = await requireProfile();
  if (!profile.organization_id) {
    return { error: "Your account is not attached to an organization." };
  }

  const result = validateTemplateForm(readForm(formData));
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  // organization_id from the profile; is_system forced false (RLS also enforces).
  const { data, error } = await supabase
    .from("equipment_page_templates")
    .insert({
      ...result.value,
      organization_id: profile.organization_id,
      is_system: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "A template with that key already exists in your organization." };
    }
    return { error: "Could not create the template. Please try again." };
  }

  redirect(`/dashboard/templates/${data.id}`);
}

/** Update a custom template the caller owns (RLS blocks cross-org + system rows). */
export async function updateOrgTemplate(
  templateId: string,
  _prev: TemplateFormState,
  formData: FormData
): Promise<TemplateFormState> {
  await requireProfile();

  const result = validateTemplateForm(readForm(formData));
  if (!result.value) return { error: result.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_page_templates")
    .update(result.value)
    .eq("id", templateId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "A template with that key already exists in your organization." };
    }
    return { error: "Could not save the template. Please try again." };
  }
  if (!data) return { error: "Template not found." };

  redirect(`/dashboard/templates/${templateId}`);
}

/** Activate or deactivate (archive) a custom template the caller owns. */
export async function setOrgTemplateActive(
  templateId: string,
  active: boolean,
  _prev: TemplateFormState,
  _formData: FormData
): Promise<TemplateFormState> {
  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_page_templates")
    .update({ is_active: active })
    .eq("id", templateId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the template." };
  if (!data) return { error: "Template not found." };

  redirect("/dashboard/templates");
}
