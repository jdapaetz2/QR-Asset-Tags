import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow media uploads through server actions, which validate type/size/count
    // authoritatively. Default is 1 MB. This covers both damage reports (≤5 images ×
    // 10 MB) and guided return inspections (≤8 images, ≤40 MB total). Tightened to 45 MB
    // (Phase A4): just above the 40 MB inspection cap + field overhead, shrinking the
    // request-body DDoS surface. Public intake is now shared-store rate-limited
    // (lib/ratelimit) before any upload/insert.
    serverActions: {
      bodySizeLimit: "45mb",
    },
  },
};

export default nextConfig;
