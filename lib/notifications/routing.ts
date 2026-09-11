/**
 * Engineering Phase D3A — who receives a notification. Pure, deterministic, no I/O.
 *
 * The operator-locked routing (docs/ACTIONABLE_NOTIFICATION_DESIGN.md §9.3–§9.4):
 *
 *   Damage / support   main route when that report type's general switch is on;
 *                      urgent route when the report is Immediate attention and the urgent switch is on —
 *                      independent of the general switch.
 *   Renter return      main route only in `instant_renter` mode; never the urgent route (returns are never
 *                      immediate). `daily_exceptions` and `off` send nothing individually.
 *   Tag request        main route when its switch is on.
 *
 * A route counts only with a syntactically valid address — stored values are re-checked here because a customer
 * admin can write settings through the API directly. When both routes apply and the addresses match (trimmed,
 * case-insensitive) there is ONE send; otherwise each recipient gets its own send, main first. Every send is its own
 * provider request with a single `to`, so no recipient ever learns another's address.
 */
import type { NotificationPriority } from "@/lib/notifications/priority";
import {
  isValidNotificationEmail,
  type NotificationSettings,
  type SubmissionFormType,
} from "@/lib/notifications/settings";

/** Log classification for a send. `digest` is reserved for the daily return summary (D3B). */
export const RECIPIENT_ROUTES = ["main", "urgent", "main_and_urgent", "digest"] as const;
export type RecipientRoute = (typeof RECIPIENT_ROUTES)[number];

export type PlannedSend = { route: Exclude<RecipientRoute, "digest">; recipient: string };

/** Why nothing is sent: a route was switched on without a usable address, or every route is off. */
export type RoutingSkip = "skipped_no_recipient" | "skipped_disabled";

export type RoutingDecision = { sends: PlannedSend[]; skip: RoutingSkip | null };

/** At most this many photos are ever requested as inline previews (the preview renderer ships in D4). */
export const MAX_PREVIEWS_PER_EMAIL = 3;

type Route = { enabled: boolean; address: string | null };

function usableAddress(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return isValidNotificationEmail(trimmed) ? trimmed : null;
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function decide(main: Route, urgent: Route): RoutingDecision {
  const mainTo = main.enabled ? main.address : null;
  const urgentTo = urgent.enabled ? urgent.address : null;

  let sends: PlannedSend[] = [];
  if (mainTo && urgentTo) {
    sends = sameAddress(mainTo, urgentTo)
      ? [{ route: "main_and_urgent", recipient: mainTo }]
      : [
          { route: "main", recipient: mainTo },
          { route: "urgent", recipient: urgentTo },
        ];
  } else if (mainTo) {
    sends = [{ route: "main", recipient: mainTo }];
  } else if (urgentTo) {
    sends = [{ route: "urgent", recipient: urgentTo }];
  }

  if (sends.length > 0) return { sends, skip: null };
  const missingAddress = (main.enabled && !main.address) || (urgent.enabled && !urgent.address);
  return { sends, skip: missingAddress ? "skipped_no_recipient" : "skipped_disabled" };
}

export function resolveSubmissionRecipients(input: {
  formType: SubmissionFormType;
  priority: NotificationPriority;
  settings: NotificationSettings;
}): RoutingDecision {
  const { settings } = input;
  const mainAddress = usableAddress(settings.notification_email);

  if (input.formType === "return_checklist") {
    return decide(
      { enabled: settings.return_notification_mode === "instant_renter", address: mainAddress },
      { enabled: false, address: null }
    );
  }

  const generalSwitch =
    input.formType === "damage_report" ? settings.notify_damage_reports : settings.notify_support_requests;
  return decide(
    { enabled: generalSwitch, address: mainAddress },
    {
      enabled: input.priority === "immediate" && settings.notify_urgent_reports,
      address: usableAddress(settings.urgent_notification_email),
    }
  );
}

export function resolveTagStatusRecipients(settings: NotificationSettings): RoutingDecision {
  return decide(
    { enabled: settings.notify_tag_request_updates, address: usableAddress(settings.notification_email) },
    { enabled: false, address: null }
  );
}

/** How many inline previews a send would request: none when the organization turned previews off. */
export function previewRequestCount(previewsEnabled: boolean, candidateCount: number): number {
  if (!previewsEnabled || !Number.isFinite(candidateCount)) return 0;
  return Math.min(MAX_PREVIEWS_PER_EMAIL, Math.max(0, Math.trunc(candidateCount)));
}
