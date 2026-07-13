/**
 * Organization category → default return-template mappings (Return Inspection V2, Phase 1B). Pure, no I/O.
 *
 * A customer organization maps its OWN exact category values to a default system return-inspection
 * template. Matching is exact on the normalized category (trim + lowercase + collapse whitespace — the
 * same `normalizeCategoryKey` used everywhere else). NO fuzzy matching, NO category renaming/merging.
 *
 * The final resolved key is always stored on the asset; this layer only decides what to suggest/store at
 * asset-create / import / bulk-apply time. The public return route never uses it.
 */
import { normalizeCategoryKey } from "@/lib/assets/categories";
import {
  GENERIC_TEMPLATE_KEY,
  isReturnTemplateKey,
  type ReturnTemplateKey,
} from "@/lib/inspections/templates";

/** A stored mapping row (only the columns the pure logic needs). */
export type CategoryDefaultRow = {
  category_value: string;
  return_template_key: string;
  normalized_category_value?: string;
};

/** Normalized-category → template key. Only valid, known template keys are kept. */
export type CategoryDefaultLookup = Record<string, ReturnTemplateKey>;

/**
 * Build the lookup from stored rows, keyed by the app's normalization of `category_value` (so lookups
 * and writes always agree on the key) and dropping any row whose template key is not a known system key.
 */
export function buildCategoryDefaultLookup(
  rows: readonly CategoryDefaultRow[]
): CategoryDefaultLookup {
  const out: CategoryDefaultLookup = {};
  for (const row of rows) {
    const key = normalizeCategoryKey(row.category_value ?? "");
    if (!key) continue;
    if (isReturnTemplateKey(row.return_template_key)) {
      out[key] = row.return_template_key;
    }
  }
  return out;
}

/** Exact org-default template for a free-text category, or null when unmapped. */
export function categoryDefaultForCategory(
  category: string | null | undefined,
  lookup: CategoryDefaultLookup
): ReturnTemplateKey | null {
  if (typeof category !== "string") return null;
  const key = normalizeCategoryKey(category);
  if (!key) return null;
  return lookup[key] ?? null;
}

export type CategoryDefaultInput = {
  category_value: string;
  normalized_category_value: string;
  return_template_key: ReturnTemplateKey;
};

/** Validate a create/change-mapping submission (non-empty category + known system template key). */
export function validateCategoryDefaultInput(raw: {
  category?: string | null;
  templateKey?: string | null;
}): { value: CategoryDefaultInput } | { error: string } {
  const category = (raw.category ?? "").trim();
  const normalized = normalizeCategoryKey(category);
  if (!normalized) return { error: "Enter a category." };
  const templateKey = (raw.templateKey ?? "").trim();
  if (!isReturnTemplateKey(templateKey)) {
    return { error: "Choose a valid return inspection template." };
  }
  return {
    value: {
      category_value: category,
      normalized_category_value: normalized,
      return_template_key: templateKey,
    },
  };
}

/** Minimal asset shape the bulk-apply / review helpers need. */
export type AssetForDefault = {
  id: string;
  category: string | null;
  return_inspection_template_key: string | null;
};

/**
 * Which assets a category-default apply would touch: ONLY assets with no explicit assignment whose
 * normalized category maps to a default. Explicit assignments are never included (never overwritten).
 */
export function assetsToApplyDefault(
  assets: readonly AssetForDefault[],
  lookup: CategoryDefaultLookup
): { id: string; key: ReturnTemplateKey }[] {
  const out: { id: string; key: ReturnTemplateKey }[] = [];
  for (const asset of assets) {
    if (asset.return_inspection_template_key) continue; // explicit assignment preserved
    const key = categoryDefaultForCategory(asset.category, lookup);
    if (key) out.push({ id: asset.id, key });
  }
  return out;
}

export type ReviewReason = "unassigned" | "generic" | "differs_from_default";

export type ReviewAsset = {
  id: string;
  category: string | null;
  currentKey: string | null;
  defaultKey: ReturnTemplateKey | null;
  reason: ReviewReason;
};

/**
 * Assets worth an admin's attention (NOT errors — "Review recommended"): unassigned, using the generic
 * fallback, or explicitly assigned to a template that differs from the org category default. A differing
 * explicit assignment is intentional-until-reviewed, never a failure.
 */
export function classifyReviewAssets(
  assets: readonly AssetForDefault[],
  lookup: CategoryDefaultLookup
): ReviewAsset[] {
  const out: ReviewAsset[] = [];
  for (const asset of assets) {
    const currentKey = asset.return_inspection_template_key ?? null;
    const defaultKey = categoryDefaultForCategory(asset.category, lookup);
    const base = { id: asset.id, category: asset.category, currentKey, defaultKey };
    if (!currentKey) {
      out.push({ ...base, reason: "unassigned" });
    } else if (currentKey === GENERIC_TEMPLATE_KEY) {
      out.push({ ...base, reason: "generic" });
    } else if (defaultKey && defaultKey !== currentKey) {
      out.push({ ...base, reason: "differs_from_default" });
    }
  }
  return out;
}
