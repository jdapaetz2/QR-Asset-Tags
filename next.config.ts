import type { NextConfig } from "next";

import { noJsRewrites } from "./lib/public/nojs";

const nextConfig: NextConfig = {
  async rewrites() {
    // No-JavaScript fallback (lib/public/nojs.ts): only requests carrying ?nojs=1 match, and they
    // reach a copy of the streamed public routes that renders without a loading skeleton.
    return { beforeFiles: noJsRewrites() };
  },
  experimental: {
    // Vercel rejects any Function request body over 4.5 MB before our code runs (413
    // FUNCTION_PAYLOAD_TOO_LARGE), whatever this says — so photos no longer travel inside
    // server-action bodies. With JavaScript they go straight to Storage through signed upload
    // URLs (lib/forms/upload-contract.ts); only the no-JavaScript fallback posts files here.
    // 4 MB keeps local builds as strict as Vercel, so a regression that routes files through
    // an action body fails locally too. The default is 1 MB.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
