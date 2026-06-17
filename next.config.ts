import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow damage-report uploads (≤5 images × 10 MB) through the server action,
    // which validates type/size/count authoritatively. Default is 1 MB.
    // Trade-off: a larger limit widens the request-body DDoS surface; rate
    // limiting / edge protection is a documented fast-follow.
    serverActions: {
      bodySizeLimit: "52mb",
    },
  },
};

export default nextConfig;
