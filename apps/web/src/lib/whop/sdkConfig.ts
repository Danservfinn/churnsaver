// Whop SDK Configuration Module
// Provides validated configuration with environment-specific overrides

import { z } from 'zod';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Whop SDK configuration schema with runtime validation
 */
const whopConfigSchema = z.object({
  // Core API configuration
  appId: z.string().min(1, 'App ID is required'),
  apiKey: z.string().min(16, 'API key must be at least 16 characters').optional(),
  webhookSecret: z.string().min(16, 'Webhook secret must be at least 16 characters').optional(),
  
  // API endpoints and timeouts
  apiBaseUrl: z.string().url().default('https://api.whop.com/api/v5/app'),
  requestTimeout: z.number().int().positive().default(30000), // 30 seconds default
  
  // Retry configuration
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelay: z.number().int().min(100).max(10000).default(1000), // 1 second default
  
  // Feature flags
  enableMetrics: z.boolean().default(true),
  enableLogging: z.boolean().default(true),
  enableRetry: z.boolean().default(true),
  
  // Environment-specific overrides
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  debugMode: z.boolean().default(false),
});

export type WhopSdkConfig = z.infer<typeof whopConfigSchema>;

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: WhopSdkConfig;
}

/**
 * Environment-specific default configurations
 */
const ENVIRONMENT_DEFAULTS: Record<string, Partial<WhopSdkConfig>> = {
  development: {
    apiBaseUrl: 'https://api.whop.com/api/v5/app',
    requestTimeout: 30000,
    maxRetries: 1,
    retryDelay: 500,
    enableMetrics: false,
    debugMode: true,
  },
  staging: {
    apiBaseUrl: 'https://api.staging.whop.com/api/v5/app',
    requestTimeout: 25000,
    maxRetries: 2,
    retryDelay: 1000,
    enableMetrics: true,
    debugMode: false,
  },
  production: {
    apiBaseUrl: 'https://api.whop.com/api/v5/app',
    requestTimeout: 20000,
    maxRetries: 3,
    retryDelay: 1000,
    enableMetrics: true,
    debugMode: false,
  },
};

/**
 * Get current environment from NODE_ENV with fallback
 */
function getCurrentEnvironment(): string {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  return ['development', 'staging', 'production'].includes(nodeEnv) 
    ? nodeEnv 
    : 'development';
}

/**
 * Validate API key format and strength
 */
function validateApiKeyStrength(apiKey: string): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check for common weak patterns
  const weakPatterns = [
    /^(test|demo|example|sample|default)/i,
    /^(123|abc|password|secret)/i,
    /^(.)\1{15,}$/, // Repeated characters
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(apiKey)) {
      warnings.push('API key appears to use a weak or test pattern');
    }
  }
  
  // Check entropy (basic)
  const uniqueChars = new Set(apiKey).size;
  if (uniqueChars < 8) {
    warnings.push('API key appears to have low entropy');
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Validate webhook secret format
 */
function validateWebhookSecret(secret: string): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (secret.length < 16) {
    warnings.push('Webhook secret should be at least 16 characters for security');
  }
  
  if (secret.length > 128) {
    warnings.push('Webhook secret is unusually long');
  }
  
  // Check for common weak patterns
  const weakPatterns = [
    /^(test|demo|example|sample|default)/i,
    /^(123|abc|password|secret)/i,
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(secret)) {
      warnings.push('Webhook secret appears to use a weak or test pattern');
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Build configuration from environment variables with validation
 */
export function buildWhopSdkConfig(): ConfigValidationResult {
  const environment = getCurrentEnvironment();
  const envDefaults = ENVIRONMENT_DEFAULTS[environment] || ENVIRONMENT_DEFAULTS.development;
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Extract configuration from environment
  const rawConfig = {
    appId: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID,
    apiKey: env.WHOP_API_KEY,
    webhookSecret: env.WHOP_WEBHOOK_SECRET,
    apiBaseUrl: envDefaults.apiBaseUrl,
    requestTimeout: envDefaults.requestTimeout,
    maxRetries: envDefaults.maxRetries,
    retryDelay: envDefaults.retryDelay,
    enableMetrics: envDefaults.enableMetrics,
    enableLogging: envDefaults.enableLogging,
    enableRetry: envDefaults.enableRetry,
    environment,
    debugMode: envDefaults.debugMode,
  };
  
  // Validate required fields
  if (!rawConfig.appId) {
    errors.push('App ID is required (NEXT_PUBLIC_WHOP_APP_ID or WHOP_APP_ID)');
  }
  
  // Production-specific validations
  if (environment === 'production') {
    if (!rawConfig.apiKey) {
      errors.push('API key is required in production (WHOP_API_KEY)');
    }
    
    if (!rawConfig.webhookSecret) {
      errors.push('Webhook secret is required in production (WHOP_WEBHOOK_SECRET)');
    }
    
    // CRITICAL: Prevent production deployment with insecure dev mode enabled
    if (process.env.ALLOW_INSECURE_DEV === 'true') {
      errors.push('CRITICAL: ALLOW_INSECURE_DEV=true is not allowed in production environment - this creates a severe security vulnerability');
    }
    
    // Check for development/test values in production
    const forbiddenPatterns = [
      /demo/i, /example/i, /sample/i,
      /localhost/i, /\.dev$/, /\.local$/
    ];
    
    for (const [key, value] of Object.entries(rawConfig)) {
      if (value && typeof value === 'string' && forbiddenPatterns.some(pattern => pattern.test(value))) {
        if (key.includes('SECRET') || key.includes('KEY') || key.includes('URL')) {
          warnings.push(`Production environment contains development-like value in ${key}`);
        }
      }
    }
  }
  
  // Validate API key strength if provided
  if (rawConfig.apiKey) {
    const keyValidation = validateApiKeyStrength(rawConfig.apiKey);
    warnings.push(...keyValidation.warnings);
  }
  
  // Validate webhook secret if provided
  if (rawConfig.webhookSecret) {
    const secretValidation = validateWebhookSecret(rawConfig.webhookSecret);
    warnings.push(...secretValidation.warnings);
  }
  
  // Parse and validate final configuration
  const parseResult = whopConfigSchema.safeParse(rawConfig);
  
  if (!parseResult.success) {
    errors.push(...(parseResult.error as any)?.errors?.map(e => `${e.path?.join('.') || 'unknown'}: ${e.message}`) || []);
  }
  
  const finalConfig = parseResult.success ? parseResult.data : undefined;
  
  // Log configuration result
  if (errors.length > 0) {
    logger.error('Whop SDK configuration validation failed', { 
      errors, 
      environment,
      appId: rawConfig.appId 
    });
  } else {
    logger.info('Whop SDK configuration loaded successfully', { 
      environment,
      appId: rawConfig.appId,
      hasApiKey: !!rawConfig.apiKey,
      hasWebhookSecret: !!rawConfig.webhookSecret,
      warnings: warnings.length
    });
    
    if (warnings.length > 0) {
      logger.warn('Whop SDK configuration warnings', { warnings, environment });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config: finalConfig
  };
}

/**
 * Get validated Whop SDK configuration
 * Throws in production if configuration is invalid
 */
export function getWhopSdkConfig(): WhopSdkConfig {
  const result = buildWhopSdkConfig();
  
  if (!result.isValid) {
    const errorMessage = `Whop SDK configuration is invalid: ${result.errors.join(', ')}`;
    logger.error(errorMessage, { errors: result.errors });
    throw new Error(errorMessage);
  }
  
  if (!result.config) {
    throw new Error('Whop SDK configuration failed to parse');
  }
  
  return result.config;
}

/**
 * Check if configuration is valid without throwing
 */
export function validateWhopSdkConfig(): ConfigValidationResult {
  return buildWhopSdkConfig();
}

/**
 * Get environment-specific helper for conditional logic
 */
export function isDevelopment(): boolean {
  return getCurrentEnvironment() === 'development';
}

export function isStaging(): boolean {
  return getCurrentEnvironment() === 'staging';
}

export function isProduction(): boolean {
  return getCurrentEnvironment() === 'production';
}

/**
 * Get configuration helpers for external modules
 */
export const whopConfig = {
  get: getWhopSdkConfig,
  validate: validateWhopSdkConfig,
  isDevelopment,
  isStaging,
  isProduction,
  getCurrentEnvironment,
};

// Export the configuration type for external use