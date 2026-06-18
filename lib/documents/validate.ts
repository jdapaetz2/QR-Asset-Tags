/**
 * Pure validation for the asset-document form. No I/O. organization_id and
 * asset_id are derived server-side from the profile + route, never from input.
 */

export const DOCUMENT_TYPES = [
  "manual",
  "startup_guide",
  "safety_sheet",
  "video",
  "return_checklist",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_VISIBILITIES = ["public", "private"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const LINK_STATUSES = ["unknown", "ok", "broken", "needs_review"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  manual: "Manual",
  startup_guide: "Start-up guide",
  safety_sheet: "Safety sheet",
  video: "Video",
  return_checklist: "Return checklist",
  other: "Other",
};

export type DocumentFormInput = {
  title: string | null;
  document_type: string | null;
  visibility: string | null;
  url: string | null;
  link_status?: string | null;
};

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate the document's text fields. Returns an error message or null. */
export function validateDocumentForm(input: DocumentFormInput): string | null {
  const title = input.title?.trim() ?? "";
  if (!title) return "A title is required.";

  if (!(DOCUMENT_TYPES as readonly string[]).includes(input.document_type ?? "")) {
    return "Choose a valid document type.";
  }
  if (
    !(DOCUMENT_VISIBILITIES as readonly string[]).includes(input.visibility ?? "")
  ) {
    return "Choose a valid visibility.";
  }
  if (
    input.link_status != null &&
    input.link_status !== "" &&
    !(LINK_STATUSES as readonly string[]).includes(input.link_status)
  ) {
    return "Choose a valid link status.";
  }

  const url = input.url?.trim() ?? "";
  if (url && !isHttpUrl(url)) {
    return "Enter a valid http(s) URL.";
  }
  return null;
}
