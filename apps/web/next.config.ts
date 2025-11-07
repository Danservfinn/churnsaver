import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [{ hostname: "**" }],
	},
	// ESLint configuration is now handled separately
	serverExternalPackages: ["@whop/api"],
};

export default withWhopAppConfig(nextConfig);
