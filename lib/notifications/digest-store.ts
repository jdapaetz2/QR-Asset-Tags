import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { DigestAsset, DigestReturnRow } from "@/lib/notifications/digest";
import type { DigestOrganization, DigestStore } from "@/lib/notifications/digest-worker";

/**
 * Engineering Phase D3B — the daily summary's database access, with the SERVICE-ROLE client. Trusted server code only
 * (the cron route, after it has authorized the Vercel invocation). Scope is deliberately narrow and every query is
 * organization-scoped:
 *
 *   - active organizations whose return mode is not `off` (id, name, notification address, mode);
 *   - that organization's return checklists created inside the summary window (no other form type);
 *   - asset code/name for those returns, again scoped to the organization;
 *   - the private `notification_digest_runs` ledger (migration 0036), which no client role can read.
 *
 * Audited in docs/SECURITY_MODEL.md (service-role inventory) and allowlisted in lib/security/service-role.test.ts and
 * scripts/verify-production-config.mjs.
 */

const DIGEST_TYPE = "return_exceptions";

const RETURN_COLUMNS =
  "id, organization_id, created_at, status, submission_origin, asset_id, submission_data_json, media_urls";

export function createDigestStore(client: SupabaseClient = createAdminClient()): DigestStore {
  return {
    async listEligibleOrganizations(afterId, limit) {
      let query = client
        .from("organizations")
        .select("id, name, notification_email, return_notification_mode")
        .eq("status", "active")
        .neq("return_notification_mode", "off")
        .order("id", { ascending: true })
        .limit(limit);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query;
      if (error) throw new Error("digest: organization list failed");
      return (data ?? []) as DigestOrganization[];
    },

    async lastSuccessfulWindowEnd(organizationId) {
      const { data, error } = await client
        .from("notification_digest_runs")
        .select("window_end")
        .eq("organization_id", organizationId)
        .eq("digest_type", DIGEST_TYPE)
        .in("status", ["sent", "skipped_quiet"])
        .order("window_end", { ascending: false })
        .limit(1)
        .maybeSingle<{ window_end: string }>();
      if (error) throw new Error("digest: ledger read failed");
      return data ? new Date(data.window_end) : null;
    },

    async firstRunWindowStart(organizationId) {
      const { data, error } = await client
        .from("notification_digest_runs")
        .select("window_start")
        .eq("organization_id", organizationId)
        .eq("digest_type", DIGEST_TYPE)
        .order("window_start", { ascending: true })
        .limit(1)
        .maybeSingle<{ window_start: string }>();
      if (error) throw new Error("digest: ledger read failed");
      return data ? new Date(data.window_start) : null;
    },

    async claimRun({ organizationId, window }) {
      const { data, error } = await client
        .from("notification_digest_runs")
        .insert({
          organization_id: organizationId,
          digest_type: DIGEST_TYPE,
          window_start: window.start.toISOString(),
          window_end: window.end.toISOString(),
          status: "processing",
        })
        .select("id")
        .single<{ id: string }>();
      // Unique (organization, type, window_end): another invocation already owns this window.
      if (error?.code === "23505") return null;
      if (error || !data) throw new Error("digest: ledger claim failed");
      return data.id;
    },

    async completeRun(runId, result) {
      const { error } = await client
        .from("notification_digest_runs")
        .update({
          status: result.status,
          item_count: result.itemCount,
          provider_id: result.providerId ?? null,
          failure_class: result.failureClass ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("status", "processing");
      if (error) throw new Error("digest: ledger completion failed");
    },

    async listReturnRows({ organizationId, window, origins, offset, limit }) {
      const { data, error } = await client
        .from("form_submissions")
        .select(RETURN_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("form_type", "return_checklist")
        .in("submission_origin", origins)
        .gt("created_at", window.start.toISOString())
        .lte("created_at", window.end.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error("digest: return checklist read failed");
      return (data ?? []) as DigestReturnRow[];
    },

    async loadAssets(organizationId, assetIds) {
      if (assetIds.length === 0) return [];
      const { data, error } = await client
        .from("assets")
        .select("id, asset_code, asset_name")
        .eq("organization_id", organizationId)
        .in("id", assetIds);
      if (error) throw new Error("digest: asset read failed");
      return (data ?? []) as DigestAsset[];
    },
  };
}
