/**
 * Pure helpers for the platform-admin QR production workspace. No I/O.
 */

/** Default QR preset for production exports — scan-safe (branded sheet is deferred). */
export const QR_STYLE_PRESET = "scan-safe";

/** Batch tag-metadata option lists (non-persistent; carried in query params). */
export const TAG_SIZE_OPTIONS = [
  "1.5in square",
  "2in square",
  "2in x 1in",
  "custom",
] as const;

export const MATERIAL_OPTIONS = [
  "anodized aluminum",
  "stainless",
  "acrylic",
  "other",
] as const;

export const MOUNTING_OPTIONS = [
  "adhesive",
  "rivet",
  "screw",
  "zip tie",
  "other",
] as const;

/**
 * Whether a base URL is safe for printing on physical tags. Localhost and Vercel
 * preview hosts are NOT — a permanent tag must point at the real production domain.
 */
export function isProductionBaseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return false;
  }
  // Vercel preview/deploy hosts (e.g. my-app-git-branch.vercel.app).
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    return false;
  }
  return true;
}

export type AssetReadinessInput = {
  public_status: string;
  /** 'active' | 'disabled' | null (no QR link). */
  qrStatus: string | null;
  /** 'published' | 'draft' | 'missing'. */
  pageStatus: "published" | "draft" | "missing";
};

export type AssetReadiness = { ready: boolean; issues: string[] };

/** Per-asset tag-production readiness: ready only when nothing blocks a live page. */
export function assetReadiness(input: AssetReadinessInput): AssetReadiness {
  const issues: string[] = [];

  if (input.qrStatus === null) {
    issues.push("Missing QR link");
  } else if (input.qrStatus !== "active") {
    issues.push("Inactive QR link");
  }

  if (input.public_status !== "public") {
    issues.push("Private asset");
  }

  if (input.pageStatus === "missing") {
    issues.push("Missing equipment page");
  } else if (input.pageStatus !== "published") {
    issues.push("Draft equipment page");
  }

  return { ready: issues.length === 0, issues };
}
