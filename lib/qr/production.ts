/**
 * Pure helpers for the platform-admin QR production workspace. No I/O.
 */

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
