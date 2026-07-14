/**
 * Pure status → badge-tone mappers. Display only — these never change state logic,
 * they only pick a visual tone for states that already exist in the app. Boolean-
 * derived states (Public/Private, QR ready, Page live, Available/Rented, etc.) pass
 * a tone explicitly at the call site.
 */

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function submissionStatusTone(status: string): BadgeTone {
  switch (status) {
    case "new":
      return "info";
    case "resolved":
      return "success";
    case "reviewed":
    case "archived":
    default:
      return "neutral";
  }
}

/**
 * Button classes for a submission status ACTION, keyed on the TARGET status (Phase 3C.5). Colors track the
 * same tone families as the status badges (`submissionStatusTone`) so a button visually communicates the state
 * it transitions TO: resolved→emerald (success), new→sky (info), reviewed/archived→neutral (their badge is
 * neutral — Archive is intentionally NOT destructive-red). Bordered outline (badges are border+text only, so a
 * light tinted-outline button reads as the same hue while staying a clear affordance). Text labels are always
 * present; the caller must not rely on color alone. Includes default/hover/focus-visible/disabled states; the
 * caller applies `disabled={pending}` for the pending state.
 */
const ACTION_BASE =
  "inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px]";

export function submissionStatusActionClasses(targetStatus: string): string {
  switch (targetStatus) {
    case "resolved":
      return `${ACTION_BASE} border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 focus-visible:ring-emerald-500/40 dark:text-emerald-400`;
    case "new":
      return `${ACTION_BASE} border-sky-500/50 text-sky-700 hover:bg-sky-500/10 focus-visible:ring-sky-500/40 dark:text-sky-400`;
    case "reviewed":
      return `${ACTION_BASE} border-border text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50`;
    case "archived":
      return `${ACTION_BASE} border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50`;
    default:
      return `${ACTION_BASE} border-border text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50`;
  }
}

export function tagRequestStatusTone(status: string): BadgeTone {
  switch (status) {
    case "requested":
      return "info";
    case "in_review":
    case "in_production":
      return "warning";
    case "ready":
    case "delivered":
      return "success";
    case "cancelled":
    default:
      return "neutral";
  }
}

export function documentLinkTone(linkStatus: string): BadgeTone {
  switch (linkStatus) {
    case "ok":
      return "success";
    case "broken":
      return "danger";
    case "needs_review":
      return "warning";
    case "unknown":
    default:
      return "neutral";
  }
}
