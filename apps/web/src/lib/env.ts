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
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
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
  WEBHOOK_TIMESTAMP_SKEW_SECONDS: process.env.WEBHOOK_TIMESTAMP_SKEW_SECONDS ? parseInt(process.env.WEBHOOK_TIMESTAMP_SKEW_SECONDS, 10) : 300,
  
  // Reminders
  MAX_REMINDER_CASES_PER_RUN: process.env.MAX_REMINDER_CASES_PER_RUN ? parseInt(process.env.MAX_REMINDER_CASES_PER_RUN, 10) : 50,
  MAX_CONCURRENT_REMINDER_SENDS: process.env.MAX_CONCURRENT_REMINDER_SENDS ? parseInt(process.env.MAX_CONCURRENT_REMINDER_SENDS, 10) : 10
};

export type Env = typeof env;
export type AdditionalEnv = typeof additionalEnv;