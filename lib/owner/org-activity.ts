/**
 * Platform-owner activity counts per organization (owner analytics). Exact counts (`count: "exact", head: true`), never
 * a tally of raw rows: a raw select returns at most one PostgREST page (1,000 rows by default), which silently
 * undercounted any organization past that. Demo organizations (DEMO_ORGANIZATION_IDS) are flagged so the page labels
 * their synthetic history instead of presenting it as customer adoption.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEMO_ORGANIZATION_IDS } from "@/lib/constants";

export const ACTIVITY_TABLES = { assets: "assets", scans: "scan_events", submissions: "form_submissions" } as const;
export type ActivityKey = keyof typeof ACTIVITY_TABLES;

/** Counts per table; null when a count could not be read (shown as a dash, never as zero). */
export type OrgActivity = Record<ActivityKey, number | null> & { demo: boolean };

export function isDemoOrganization(organizationId: string): boolean {
  return DEMO_ORGANIZATION_IDS.includes(organizationId);
}

export async function getOrgActivityCounts(supabase: SupabaseClient, organizationIds: string[]): Promise<Map<string, OrgActivity>> {
  const keys = Object.keys(ACTIVITY_TABLES) as ActivityKey[];
  const entries = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const counts = await Promise.all(
        keys.map(async (key) => {
          const { count, error } = await supabase
            .from(ACTIVITY_TABLES[key])
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId);
          return [key, error ? null : (count ?? 0)] as const;
        })
      );
      const activity = { ...Object.fromEntries(counts), demo: isDemoOrganization(organizationId) } as OrgActivity;
      return [organizationId, activity] as const;
    })
  );
  return new Map(entries);
}
