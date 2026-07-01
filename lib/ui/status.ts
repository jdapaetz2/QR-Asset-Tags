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
