/**
 * Pure helpers for asset cover-image uploads. Cover images are PUBLIC: they land
 * in the public-read `public-assets` bucket under an org/asset-scoped path the
 * server builds (never client input) and surface on the public scan page. Stricter
 * than the bucket's MIME allow-list — uploads are jpeg/png/webp only (SVG is
 * allowed only for local /demo-assets paths, never customer uploads).
 */

export const COVER_BUCKET = "public-assets";

export const COVER_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const COVER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedCoverType(type: string): boolean {
  return (COVER_ALLOWED_TYPES as readonly string[]).includes(type);
}

/** Validate a single cover image upload. Returns an error message or null. */
export function validateCoverFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!isAllowedCoverType(file.type)) {
    return "Cover image must be a JPG, PNG, or WebP.";
  }
  if (file.size > COVER_MAX_BYTES) {
    return "Cover image must be 5 MB or smaller.";
  }
  return null;
}

/** Server-built path prefix; matches the public-assets org policy (`org/{id}/...`). */
export function coverPathPrefix(
  organizationId: string,
  assetId: string
): string {
  return `org/${organizationId}/asset/${assetId}/cover`;
}

/** Opaque object name (no user-controlled filename). */
export function coverObjectName(uuid: string, mime: string): string {
  return `${uuid}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

/**
 * Conflict rule for the single-save flow: when a file is chosen it wins, so the
 * typed URL/path is ignored (blanked) and the uploaded image's URL is saved
 * instead. With no file, the typed value is used as-is (empty clears the cover).
 */
export function coverUrlForSave(input: {
  hasFile: boolean;
  urlValue: string | null | undefined;
}): string {
  return input.hasFile ? "" : (input.urlValue ?? "");
}

/**
 * If `url` is an app-managed public cover object for this exact org/asset, return
 * its storage object path (for safe best-effort cleanup); otherwise null. External
 * URLs and `/demo-assets/...` paths are never app-managed and return null.
 */
export function managedCoverObjectPath(
  url: string | null | undefined,
  organizationId: string,
  assetId: string
): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/" + COVER_BUCKET + "/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const objectPath = url.slice(idx + marker.length).split("?")[0];
  const prefix = coverPathPrefix(organizationId, assetId) + "/";
  return objectPath.startsWith(prefix) && !objectPath.includes("..")
    ? objectPath
    : null;
}
