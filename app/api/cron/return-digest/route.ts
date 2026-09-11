import { deploymentContext, publicEnv, serverEnv } from "@/lib/env";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { createDigestStore } from "@/lib/notifications/digest-store";
import { runReturnDigest } from "@/lib/notifications/digest-worker";
import { logDigestRun, logNotificationEvent } from "@/lib/notifications/log";
import { sendNotificationEmail } from "@/lib/notifications/send";

/**
 * Engineering Phase D3B — the daily return-exceptions summary, invoked by Vercel Cron (vercel.json: 13:00 and 14:00
 * UTC; the worker proceeds only in the 6 AM `America/Vancouver` hour).
 *
 * Security:
 *   - Production only. Preview and local development refuse, so no environment but Production can send a summary.
 *   - `Authorization: Bearer ${CRON_SECRET}` (sent by Vercel), compared in constant time. Missing/short secret →
 *     refuse. No query-string secret is read.
 *   - Every refusal is the same bare 401; an authorized response carries counts only — no names, ids or content.
 *
 * `maxDuration` 300 s is the Hobby maximum with Fluid Compute; the worker stops starting organizations after 240 s
 * and reports `incomplete` (HTTP 500) rather than a silent success.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(request: Request): Promise<Response> {
  if (
    deploymentContext() !== "production" ||
    !isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv.cronSecret)
  ) {
    return Response.json({ ok: false }, { status: 401, headers: NO_STORE });
  }

  try {
    const result = await runReturnDigest({
      store: createDigestStore(),
      send: (to, content, options) => sendNotificationEmail(to, content, {}, options),
      now: () => new Date(),
      siteUrl: publicEnv.siteUrl,
      replyTo: serverEnv.notificationReplyToEmail,
      log: logNotificationEvent,
      logRun: logDigestRun,
    });
    return Response.json(
      {
        ok: result.outcome !== "incomplete",
        outcome: result.outcome,
        organizations: result.organizations,
        sent: result.sent,
        quiet: result.quiet,
        failed: result.failed,
        skipped: result.skipped,
      },
      { status: result.outcome === "incomplete" ? 500 : 200, headers: NO_STORE }
    );
  } catch {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
