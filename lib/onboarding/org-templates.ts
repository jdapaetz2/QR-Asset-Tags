/**
 * Pure helpers for organization custom equipment-page templates. No I/O and never
 * reads `organization_id` (the server action derives it from the profile). System
 * templates live in code (`EQUIPMENT_TEMPLATES`); these helpers validate the org
 * template form and resolve a template key (org override first, then system).
 */

import {
  EQUIPMENT_TEMPLATES,
  isTemplateKey,
  type EquipmentTemplate,
} from "@/lib/onboarding/templates";

/** The seven editable page fields (all nullable for a custom template). */
export type TemplateContent = {
  headline: string | null;
  quick_start_text: string | null;
  safety_notes: string | null;
  fuel_power_notes: string | null;
  return_notes: string | null;
  troubleshooting_notes: string | null;
  emergency_notes: string | null;
};

export type OrgTemplateInput = TemplateContent & {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
};

export type OrgTemplateResult =
  | { value: OrgTemplateInput; error?: undefined }
  | { value?: undefined; error: string };

export type RawTemplateForm = Record<string, string | undefined>;

const KEY_RE = /^[a-z0-9_]{2,40}$/;

function clean(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** A template key/slug: lowercase letters, digits, underscore; 2–40 chars. */
export function isTemplateSlug(value: string): boolean {
  return KEY_RE.test(value);
}

export function validateTemplateForm(raw: RawTemplateForm): OrgTemplateResult {
  const name = clean(raw.name);
  if (!name) return { error: "A template name is required." };

  const key = (raw.key ?? "").trim().toLowerCase();
  if (!key) return { error: "A template key is required." };
  if (!isTemplateSlug(key)) {
    return {
      error:
        "Template key must be 2–40 lowercase letters, numbers, or underscores (e.g. electrical_meter_kit).",
    };
  }

  return {
    value: {
      key,
      name,
      description: clean(raw.description),
      category: clean(raw.category),
      headline: clean(raw.headline),
      quick_start_text: clean(raw.quick_start_text),
      safety_notes: clean(raw.safety_notes),
      fuel_power_notes: clean(raw.fuel_power_notes),
      return_notes: clean(raw.return_notes),
      troubleshooting_notes: clean(raw.troubleshooting_notes),
      emergency_notes: clean(raw.emergency_notes),
      is_active: raw.is_active === "on" || raw.is_active === "true",
    },
  };
}

/** Pull just the page content from a wider template/row shape. */
export function toTemplateContent(t: EquipmentTemplate | TemplateContent): TemplateContent {
  return {
    headline: t.headline,
    quick_start_text: t.quick_start_text,
    safety_notes: t.safety_notes,
    fuel_power_notes: t.fuel_power_notes,
    return_notes: t.return_notes,
    troubleshooting_notes: t.troubleshooting_notes,
    emergency_notes: t.emergency_notes,
  };
}

/**
 * Resolve a `template_key` to the page content to insert. An organization custom
 * template wins over a same-key system template (override per org); otherwise the
 * built-in system template is used; unknown keys resolve to null.
 */
export function resolveImportTemplate(
  key: string,
  orgByKey: ReadonlyMap<string, TemplateContent>
): TemplateContent | null {
  const org = orgByKey.get(key);
  if (org) return org;
  if (isTemplateKey(key)) return toTemplateContent(EQUIPMENT_TEMPLATES[key]);
  return null;
}
