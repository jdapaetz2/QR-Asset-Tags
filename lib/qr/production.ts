/**
 * Pure helpers for the platform-admin QR production workspace. No I/O.
 */

import { isPlaceholderHost } from "@/lib/env";

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
 * Why a base URL is unsafe for printing on physical tags, or null if it is safe.
 * A permanent tag must point at a real HTTPS production domain — not http, not a
 * localhost/placeholder host, and not a Vercel preview/deploy host.
 */
export function productionBaseUrlIssue(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "not a valid URL";
  }
  if (parsed.protocol !== "https:") return "must use https";
  const host = parsed.hostname.toLowerCase();
  if (isPlaceholderHost(host)) return "is a localhost/placeholder host";
  // Vercel preview/deploy hosts (e.g. my-app-git-branch.vercel.app).
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    return "is a Vercel preview host";
  }
  return null;
}

/**
 * Whether a base URL is safe for printing on physical tags. See
 * {@link productionBaseUrlIssue} for the specific reasons.
 */
export function isProductionBaseUrl(url: string): boolean {
  return productionBaseUrlIssue(url) === null;
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
