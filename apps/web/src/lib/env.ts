// Environment variables
// Provides type-safe access to environment variables

export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Whop
  NEXT_PUBLIC_WHOP_APP_ID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
  WHOP_APP_ID: process.env.WHOP_APP_ID,
  WHOP_API_KEY: process.env.WHOP_API_KEY,
  WHOP_WEBHOOK_SECRET: process.env.WHOP_WEBHOOK_SECRET,
  
  // OAuth
  WHOP_OAUTH_CLIENT_ID: process.env.WHOP_OAUTH_CLIENT_ID,
  WHOP_OAUTH_CLIENT_SECRET: process.env.WHOP_OAUTH_CLIENT_SECRET,
  WHOP_OAUTH_REDIRECT_URI: process.env.WHOP_OAUTH_REDIRECT_URI,
  
  // Application
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  
  // Features
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
  DEBUG_MODE: process.env.DEBUG_MODE === 'true',
  
  // External services
  REDIS_URL: process.env.REDIS_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  WHOP_APP_SECRET: process.env.WHOP_APP_SECRET,

  // Request Size Limits
  MAX_REQUEST_SIZE_DEFAULT_MB: process.env.MAX_REQUEST_SIZE_DEFAULT_MB,
  MAX_REQUEST_SIZE_WEBHOOK_MB: process.env.MAX_REQUEST_SIZE_WEBHOOK_MB,
  MAX_REQUEST_SIZE_UPLOAD_MB: process.env.MAX_REQUEST_SIZE_UPLOAD_MB,

  // Data retention
  DATA_RETENTION_DAYS: process.env.DATA_RETENTION_DAYS ? parseInt(process.env.DATA_RETENTION_DAYS, 10) : 365
} as const;

// Additional environment variables for existing services
export const additionalEnv = {
  // Authentication
  WHOP_APP_ID: process.env.WHOP_APP_ID,
  
  // Features
  ENABLE_PUSH: process.env.ENABLE_PUSH,
  ENABLE_DM: process.env.ENABLE_DM,
  
  // KPI
  KPI_ATTRIBUTION_WINDOW_DAYS: process.env.KPI_ATTRIBUTION_WINDOW_DAYS ? parseInt(process.env.KPI_ATTRIBUTION_WINDOW_DAYS, 10) : 30,
  DEFAULT_INCENTIVE_DAYS: process.env.DEFAULT_INCENTIVE_DAYS ? parseInt(process.env.DEFAULT_INCENTIVE_DAYS, 10) : 7,
  
  // Webhook
  WEBHOOK_TIMESTAMP_SKEW_SECONDS: process.env.WEBHOOK_TIMESTAMP_SKEW_SECONDS ? parseInt(process.env.WEBHOOK_TIMESTAMP_SKEW_SECONDS, 10) : 60,
  
  // Reminders
  MAX_REMINDER_CASES_PER_RUN: process.env.MAX_REMINDER_CASES_PER_RUN ? parseInt(process.env.MAX_REMINDER_CASES_PER_RUN, 10) : 50,
  MAX_CONCURRENT_REMINDER_SENDS: process.env.MAX_CONCURRENT_REMINDER_SENDS ? parseInt(process.env.MAX_CONCURRENT_REMINDER_SENDS, 10) : 10
};

export type Env = typeof env;
export type AdditionalEnv = typeof additionalEnv;
/**
 * Validate webhook timestamp skew configuration for security
 * Prevents extremely permissive settings that could allow replay attacks
 */
export function validateWebhookTimestampSkew(): void {
  const maxAllowedSkew = 300; // Maximum allowed skew in production (5 minutes)
  const minAllowedSkew = 30;  // Minimum allowed skew to prevent clock sync issues

  if (additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS > maxAllowedSkew) {
    throw new Error(
      `WEBHOOK_TIMESTAMP_SKEW_SECONDS (${additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS}s) exceeds maximum allowed value (${maxAllowedSkew}s) in production. ` +
      'This would create a significant security risk by allowing old webhooks to be replayed.'
    );
  }

  if (additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS < minAllowedSkew) {
    throw new Error(
      `WEBHOOK_TIMESTAMP_SKEW_SECONDS (${additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS}s) is below minimum allowed value (${minAllowedSkew}s). ` +
      'This could cause legitimate webhooks to be rejected due to minor clock synchronization issues.'
    );
  }
}

/**
 * Detect if the current environment appears to be production-like
 * This helps prevent insecure development features from being enabled in production environments
 * Enhanced to detect multiple hosting platforms and production indicators
 */
export function isProductionLikeEnvironment(): boolean {
  // Vercel production detection
  if (process.env.VERCEL_ENV === 'production') {
    return true;
  }

  // Node.js production environment
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  // Database URL indicators for production databases
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    // Supabase production databases
    if (databaseUrl.includes('supabase.com')) {
      return true;
    }

    // Other cloud database providers
    if (
      databaseUrl.includes('rds.amazonaws.com') ||
      databaseUrl.includes('cloudsql') ||
      databaseUrl.includes('azure.com') ||
      databaseUrl.includes('neon.tech') ||
      databaseUrl.includes('planetscale.com')
    ) {
      return true;
    }
  }

  // Hosting platform detection
  const hostname = process.env.HOSTNAME || process.env.HOST;
  if (hostname) {
    // Render production containers
    if (hostname.includes('onrender.com')) {
      return true;
    }

    // Railway production deployments
    if (hostname.includes('railway.app')) {
      return true;
    }
  }

  // Domain-based detection
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      // Production-like domains
      if (
        url.hostname.endsWith('.com') ||
        url.hostname.endsWith('.app') ||
        url.hostname.endsWith('.prod') ||
        url.hostname.includes('production') ||
        url.hostname.includes('prod')
      ) {
        return true;
      }
    } catch {
      // Invalid URL format, ignore
    }
  }

  // Additional environment variables indicating production
  if (
    process.env.REDIS_URL?.includes('redislabs.com') ||
    process.env.REDIS_URL?.includes('upstash.io') ||
    process.env.SMTP_HOST?.includes('sendgrid.net') ||
    process.env.SMTP_HOST?.includes('mailgun.org')
  ) {
    return true;
  }

  return false;
}

/**
 * Check if the current environment is explicitly development
 * This is more restrictive than NODE_ENV === 'development' to avoid confusion
 */
export function isExplicitlyDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' && !isProductionLikeEnvironment();
}