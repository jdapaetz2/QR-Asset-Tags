import "server-only";

import { serverEnv } from "@/lib/env";
import type { EmailContent } from "@/lib/notifications/email";

/**
 * Server-only email sender. Uses the Resend REST API via fetch (no SDK/dependency).
 * When RESEND_API_KEY or NOTIFICATION_FROM_EMAIL is unset, runs in DRY-RUN: it logs
 * the message and sends nothing, so the feature works end-to-end without secrets.
 *
 * NEVER throws — every failure is caught and reported in the return value, so a
 * notification can never break the submission or status-update that triggered it.
 */

export type SendResult =
  | { delivered: true; dryRun: false }
  | { delivered: false; dryRun: true }
  | { delivered: false; dryRun: false; error: string };

export async function sendNotificationEmail(
  to: string,
  content: EmailContent
): Promise<SendResult> {
  const apiKey = serverEnv.resendApiKey;
  const from = serverEnv.notificationFromEmail;

  if (!apiKey || !from) {
    console.info(
      `[notifications] dry-run (no provider configured) → to=${to} subject="${content.subject}"`
    );
    return { delivered: false, dryRun: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });
    if (!res.ok) {
      return {
        delivered: false,
        dryRun: false,
        error: `Resend responded ${res.status}`,
      };
    }
    return { delivered: true, dryRun: false };
  } catch (err) {
    return {
      delivered: false,
      dryRun: false,
      error: err instanceof Error ? err.message : "Unknown send error",
    };
  }
}
