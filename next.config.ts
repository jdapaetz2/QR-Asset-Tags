import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow media uploads through server actions, which validate type/size/count
    // authoritatively. Default is 1 MB. This covers both damage reports (≤5 images ×
    // 10 MB) and guided return inspections (≤8 images, ≤40 MB total) — the 40 MB
    // inspection cap fits under this limit, so it is NOT raised for more media.
    // Trade-off: a larger limit widens the request-body DDoS surface; rate
    // limiting / edge protection is a documented fast-follow.
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
