import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Engineering Phase E2C — whether an organization is a demonstration (the platform owner put it on the Demo plan), so
 * its public pages show the demo notice. Read through `is_demo_organization` (migration 0041), which answers only yes
 * or no: anon never reads plan fields. Best effort: an error means no notice, never a broken page.
 */
export async function isDemoOrganization(supabase: SupabaseClient, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_demo_organization", { p_organization_id: organizationId });
    return !error && data === true;
  } catch {
    return false;
  }
}
