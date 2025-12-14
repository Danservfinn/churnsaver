import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

	// Only enable in production
	enabled: process.env.NODE_ENV === "production",

	// Adjust this value in production, or use tracesSampler for greater control
	tracesSampleRate: 0.1,

	// Setting this option to true will print useful information to the console while you're setting up Sentry.
	debug: false,

	// Replay is disabled by default to reduce bundle size
	replaysOnErrorSampleRate: 0,
	replaysSessionSampleRate: 0,
});
