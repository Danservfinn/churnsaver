import { withSentryConfig } from "@sentry/nextjs";
import { withWhopAppConfig } from "@whop/react/next.config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		// Restrict image hostnames to prevent SSRF via image optimization
		remotePatterns: [
			{ hostname: "whop.com" },
			{ hostname: "*.whop.com" },
			{ hostname: "avatars.githubusercontent.com" },
		],
	},
	// ESLint configuration is now handled separately
	serverExternalPackages: ["@whop/api"],
	// Security headers for API routes
	async headers() {
		return [
			{
				source: '/api/(.*)',
				headers: [
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=63072000; includeSubDomains; preload',
					},
				],
			},
			{
				source: '/api/webhooks/(.*)',
				headers: [
					{
						key: 'Cache-Control',
						value: 'no-cache, no-store, must-revalidate',
					},
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=63072000; includeSubDomains; preload',
					},
				],
			},
		];
	},
};

export default withSentryConfig(withWhopAppConfig(nextConfig), {
	// Suppress source map upload warnings in CI
	silent: true,

	// Upload source maps for better stack traces
	widenClientFileUpload: true,

	// Automatically tree-shake Sentry logger statements
	disableLogger: true,

	// Hides source maps from generated client bundles
	hideSourceMaps: true,

	// Automatically annotate React components for better debugging
	reactComponentAnnotation: {
		enabled: true,
	},

	// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
	tunnelRoute: "/monitoring",
});
