/**
 * Server-side reads for organization category defaults (Phase 1B). RLS-scoped via the caller's Supabase
 * client — no service-role, no anon. Kept separate from the pure logic in `category-defaults.ts` so that
 * module stays free of I/O and easily testable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildCategoryDefaultLookup,
  type CategoryDefaultLookup,
} from "@/lib/inspections/category-defaults";

export type CategoryDefaultRecord = {
  id: string;
  category_value: string;
  normalized_category_value: string;
  return_template_key: string;
  /** Phase 2: optional published custom-template target (wins over the system key). */
  return_template_id: string | null;
  updated_at: string;
};

/** All category-default rows for the caller's organization (RLS-scoped). */
export async function getOrgCategoryDefaults(
  supabase: SupabaseClient
): Promise<CategoryDefaultRecord[]> {
  const { data } = await supabase
    .from("inspection_category_defaults")
    .select(
      "id, category_value, normalized_category_value, return_template_key, return_template_id, updated_at"
    )
    .order("category_value", { ascending: true });
  return (data ?? []) as CategoryDefaultRecord[];
}

/** Convenience: fetch the org's defaults already reduced to the pure resolver lookup. */
export async function getOrgCategoryDefaultLookup(
  supabase: SupabaseClient
): Promise<CategoryDefaultLookup> {
  return buildCategoryDefaultLookup(await getOrgCategoryDefaults(supabase));
}
