// Temporarily disable withWhopAppConfig to test if it's adding middleware
// import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [{ hostname: "**" }],
	},
	// ESLint configuration is now handled separately
	serverExternalPackages: ["@whop/api"],
};

// Temporarily export config directly instead of wrapping with withWhopAppConfig
export default nextConfig;
// export default withWhopAppConfig(nextConfig);
