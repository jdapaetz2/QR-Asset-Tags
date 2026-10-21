import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DEMO_ORGANIZATION_IDS } from "@/lib/constants";
import { getOrgActivityCounts, isDemoOrganization } from "@/lib/owner/org-activity";

const NORTHRIDGE = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A client whose counts come from a table, and which records every query it was asked. */
function fakeClient(counts: Record<string, Record<string, number>>, failing: string[] = []) {
  const calls: { table: string; columns: string; options: unknown; org: string }[] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string, options: unknown) => ({
        eq: async (_column: string, org: string) => {
          calls.push({ table, columns, options, org });
          if (failing.includes(table)) return { count: null, error: { message: "boom" } };
          return { count: counts[org]?.[table] ?? 0, error: null };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("owner analytics activity counts", () => {
  it("reads exact head counts per organization (never a raw row page)", async () => {
    const { client, calls } = fakeClient({ [NORTHRIDGE]: { assets: 12, scan_events: 3400, form_submissions: 1200 }, [CUSTOMER]: { assets: 3 } });
    const result = await getOrgActivityCounts(client, [NORTHRIDGE, CUSTOMER]);
    expect(result.get(NORTHRIDGE)).toEqual({ assets: 12, scans: 3400, submissions: 1200, demo: true });
    expect(result.get(CUSTOMER)).toEqual({ assets: 3, scans: 0, submissions: 0, demo: false });
    expect(calls).toHaveLength(6);
    for (const call of calls) expect(call.options).toEqual({ count: "exact", head: true });
  });

  it("shows an unreadable count as unknown, not as zero", async () => {
    const { client } = fakeClient({ [CUSTOMER]: { assets: 3 } }, ["scan_events"]);
    expect((await getOrgActivityCounts(client, [CUSTOMER])).get(CUSTOMER)?.scans).toBeNull();
  });

  it("labels Northridge, the synthetic showcase tenant, as demo data", () => {
    expect(DEMO_ORGANIZATION_IDS).toEqual([NORTHRIDGE]);
    expect(isDemoOrganization(NORTHRIDGE)).toBe(true);
    expect(isDemoOrganization(CUSTOMER)).toBe(false);
  });
});
