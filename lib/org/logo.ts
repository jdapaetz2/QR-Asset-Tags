/**
 * Pure helpers for organization logo uploads. Logos are PUBLIC: they land in the
 * public-read `public-assets` bucket under an org-scoped path the server builds
 * (never client input) and surface on public scan pages. Uploads are jpeg/png/webp
 * only — SVG is deferred for customer logo uploads (XSS surface); SVG logos may be
 * referenced only via a local /demo-assets path.
 */

export const LOGO_BUCKET = "public-assets";

export const LOGO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedLogoType(type: string): boolean {
  return (LOGO_ALLOWED_TYPES as readonly string[]).includes(type);
}

/** Validate a single logo upload. Returns an error message or null. */
export function validateLogoFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!isAllowedLogoType(file.type)) {
    return "Logo must be a JPG, PNG, or WebP.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logo must be 2 MB or smaller.";
  }
  return null;
}

/** Server-built path prefix; matches the public-assets org policy (`org/{id}/...`). */
export function logoPathPrefix(organizationId: string): string {
  return `org/${organizationId}/logo`;
}

/** Opaque object name (no user-controlled filename). */
export function logoObjectName(uuid: string, mime: string): string {
  return `${uuid}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

/**
 * Conflict rule for the single-save flow: a chosen file wins, so the typed URL is
 * ignored (blanked) and the uploaded logo URL is saved. With no file, the typed
 * value is used as-is (empty clears the logo).
 */
export function logoUrlForSave(input: {
  hasFile: boolean;
  urlValue: string | null | undefined;
}): string {
  return input.hasFile ? "" : (input.urlValue ?? "");
}

/**
 * If `url` is an app-managed public logo object for this org, return its storage
 * object path (for safe best-effort cleanup); otherwise null. External URLs and
 * /demo-assets paths are never app-managed and return null.
 */
export function managedLogoObjectPath(
  url: string | null | undefined,
  organizationId: string
): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/" + LOGO_BUCKET + "/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const objectPath = url.slice(idx + marker.length).split("?")[0];
  const prefix = logoPathPrefix(organizationId) + "/";
  return objectPath.startsWith(prefix) && !objectPath.includes("..")
    ? objectPath
    : null;
}
