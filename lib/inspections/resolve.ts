/**
 * Return-template resolution (Return Inspection V2, Phase 1A). Pure, no I/O.
 *
 * Resolution order: a VALID explicit asset assignment → a CONSERVATIVE exact category alias →
 * the generic fallback. Category suggestion is exact-alias ONLY (trim + case-fold + collapse internal
 * whitespace) — no fuzzy matching, no substring guessing, no similarity scoring, no category renaming.
 * A suggestion is never a hidden permanent rule: it is used to preselect/resolve, never to overwrite a
 * stored explicit key.
 */
import {
  GENERIC_TEMPLATE_KEY,
  RETURN_TEMPLATES,
  getReturnTemplate,
  isReturnTemplateKey,
  type ReturnTemplateKey,
} from "@/lib/inspections/templates";
import {
  categoryDefaultForCategory,
  type CategoryDefaultLookup,
} from "@/lib/inspections/category-defaults";
import type { InspectionTemplate } from "@/lib/inspections/types";

/** trim + lowercase + collapse internal whitespace — the ONLY normalization applied. */
export function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact category aliases → template key. Derived from the approved alias list; exact only. */
const CATEGORY_ALIASES: Record<string, ReturnTemplateKey> = {
  "utility trailer": "utility_trailer",
  "equipment trailer": "utility_trailer",
  "dump trailer": "utility_trailer",
  "mini excavator": "mini_excavator_skid_steer",
  excavator: "mini_excavator_skid_steer",
  "compact excavator": "mini_excavator_skid_steer",
  "skid steer": "mini_excavator_skid_steer",
  "portable generator": "portable_generator",
  generator: "portable_generator",
  "towable generator": "portable_generator",
  "plate compactor": "plate_compactor",
  compactor: "plate_compactor",
  "electrical test equipment": "electrical_test_equipment",
  electrical: "electrical_test_equipment",
  "test equipment": "electrical_test_equipment",
};

/** Exact-alias suggestion from a free-text category, or null when nothing matches. */
export function suggestTemplateKeyFromCategory(
  category: string | null | undefined
): ReturnTemplateKey | null {
  if (typeof category !== "string") return null;
  const normalized = normalizeAlias(category);
  if (!normalized) return null;
  return CATEGORY_ALIASES[normalized] ?? null;
}

export type TemplateResolution = {
  key: ReturnTemplateKey;
  source: "assigned" | "category_default" | "suggested" | "generic";
};

export type ResolveReturnTemplateInput = {
  assignmentKey: string | null | undefined;
  category: string | null | undefined;
  /**
   * Optional organization category-default lookup (Phase 1B). Passed ONLY by admin-time write/preview
   * flows (asset create, import, asset form). The public return route deliberately omits it so it never
   * depends on the category-default table — it resolves purely from the asset's stored key.
   */
  categoryDefaults?: CategoryDefaultLookup;
};

/**
 * Resolve the return template key for an asset: valid explicit assignment → organization category default
 * → exact system suggestion → generic. An invalid/blank assignment falls through (never breaks the public
 * flow). `categoryDefaults` is optional; without it the behavior is exactly Phase 1A.
 */
export function resolveReturnTemplateKey(input: ResolveReturnTemplateInput): TemplateResolution {
  if (input.assignmentKey && isReturnTemplateKey(input.assignmentKey)) {
    return { key: input.assignmentKey, source: "assigned" };
  }
  if (input.categoryDefaults) {
    const mapped = categoryDefaultForCategory(input.category, input.categoryDefaults);
    if (mapped) return { key: mapped, source: "category_default" };
  }
  const suggested = suggestTemplateKeyFromCategory(input.category);
  if (suggested) return { key: suggested, source: "suggested" };
  return { key: GENERIC_TEMPLATE_KEY, source: "generic" };
}

export function resolveReturnTemplate(input: ResolveReturnTemplateInput): InspectionTemplate {
  return getReturnTemplate(resolveReturnTemplateKey(input).key);
}

/** Display name for a resolved/assigned key (falls back to generic for an unknown value). */
export function returnTemplateName(key: string | null | undefined): string {
  if (key && isReturnTemplateKey(key)) return RETURN_TEMPLATES[key].name;
  return RETURN_TEMPLATES[GENERIC_TEMPLATE_KEY].name;
}
