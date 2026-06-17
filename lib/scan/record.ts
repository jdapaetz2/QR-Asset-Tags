import "server-only";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";
import { deviceTypeFromUserAgent, hashIp, parseClientIp } from "@/lib/scan/scan";

type ScanTarget = {
  qrLinkId: string;
  assetId: string;
  organizationId: string;
};

/**
 * Best-effort scan logging for a public page view. Inserts a `scan_events` row
 * as the anon role (RLS restricts it to a matching active QR link). Any failure
 * is swallowed — logging must never break page rendering. Stores only a hashed
 * IP, never the raw address.
 */
export async function recordScan(
  client: SupabaseClient,
  target: ScanTarget
): Promise<void> {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    const referrer = h.get("referer");
    const ip = parseClientIp(h.get("x-forwarded-for"));

    await client.from("scan_events").insert({
      qr_link_id: target.qrLinkId,
      asset_id: target.assetId,
      organization_id: target.organizationId,
      user_agent: userAgent,
      ip_hash: hashIp(ip, serverEnv.scanIpHashSalt),
      referrer,
      device_type: deviceTypeFromUserAgent(userAgent),
    });
  } catch {
    // Intentionally ignored — a scan-log failure must not break the page.
  }
}
