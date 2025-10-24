import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ hostname: "**" }],
  },
};

export default withWhopAppConfig(nextConfig);
