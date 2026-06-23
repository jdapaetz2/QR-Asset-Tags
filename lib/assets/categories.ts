/**
 * Asset category helpers. Categories are free text derived from an organization's
 * existing assets (no taxonomy table). These helpers keep the option lists tidy and
 * detect new categories during import so we can warn (never block). Normalization is
 * trim + lowercase + collapsed whitespace — enough to catch casing/spacing drift.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Comparison key for near-duplicate detection (trim, lowercase, collapse spaces). */
export function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Drop blank values, dedupe by normalized key (keeping the first spelling seen), and
 * sort alphabetically (case-insensitive). For filter dropdowns and the form datalist.
 */
export function dedupeCategories(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const display = raw.trim();
    if (!display) continue;
    const key = normalizeCategoryKey(display);
    if (!seen.has(key)) seen.set(key, display);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Categories present in `rowCategories` that don't already exist in `existing`
 * (compared by normalized key). Deduped by key, first spelling kept, sorted — for
 * the "these new categories will be created" import warning.
 */
export function detectNewCategories(
  rowCategories: (string | null | undefined)[],
  existing: Iterable<string>
): string[] {
  const existingKeys = new Set<string>();
  for (const c of existing) existingKeys.add(normalizeCategoryKey(c));
  const candidates = dedupeCategories(rowCategories);
  return candidates.filter((c) => !existingKeys.has(normalizeCategoryKey(c)));
}

/** RLS-scoped list of the caller's organization's distinct, tidy categories. */
export async function getOrgCategories(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data } = await supabase.from("assets").select("category");
  return dedupeCategories(
    (data ?? []).map((r) => (r as { category: string | null }).category)
  );
}
