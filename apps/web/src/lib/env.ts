// Environment variable validation and configuration with security hardening

interface EnvConfig {
  // Supabase configuration
  SUPABASE_URL?: string; // Supabase project URL
  SUPABASE_ANON_KEY?: string; // Supabase anonymous key
  SUPABASE_SERVICE_ROLE_KEY?: string; // Supabase service role key (server-only)
  NEXT_PUBLIC_SUPABASE_URL?: string; // Public Supabase URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string; // Public Supabase anonymous key

  WHOP_APP_ID: string; // Will alias to NEXT_PUBLIC_WHOP_APP_ID
  WHOP_APP_SECRET?: string; // Optional for legacy mode only
  WHOP_WEBHOOK_SECRET?: string;
  DATABASE_URL: string;
  ENCRYPTION_KEY?: string; // Optional: for webhook payload encryption
  DATA_RETENTION_DAYS: number; // Days to retain webhook payloads before purging
  // Feature flags with defaults
  ENABLE_PUSH: boolean;
  ENABLE_DM: boolean;
  DEFAULT_INCENTIVE_DAYS: number;
  REMINDER_OFFSETS_DAYS: number[];
  KPI_ATTRIBUTION_WINDOW_DAYS: number;
  WEBHOOK_TIMESTAMP_SKEW_SECONDS: number;
  MAX_REMINDER_CASES_PER_RUN: number; // Max cases to process per company per run
  MAX_CONCURRENT_REMINDER_SENDS: number; // Max concurrent reminder sends to prevent provider bursts
  // Security configuration
  ALLOWED_ORIGIN?: string; // CORS allowed origin for production
  SECURITY_MONITORING_ENABLED: boolean;
  RATE_LIMIT_FAIL_CLOSED: boolean;
  SECURITY_ALERT_WEBHOOK?: string; // Webhook URL for security alerts
  SESSION_TIMEOUT_MINUTES: number;
  MAX_LOGIN_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  AUDIT_LOG_RETENTION_DAYS: number;
  // Whop integration - server-only and public vars
  WHOP_API_KEY?: string; // Server-only API key (required in production)
  NEXT_PUBLIC_WHOP_APP_ID?: string; // Public app ID (required in production)
  NEXT_PUBLIC_WHOP_AGENT_USER_ID?: string; // Default agent user for notifications
  NEXT_PUBLIC_WHOP_COMPANY_ID?: string; // Default company context
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value || defaultValue!;
}

function getEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function getEnvIntArray(name: string, defaultValue: number[]): number[] {
  const value = process.env[name];
  if (!value) return defaultValue;

  try {
    // First try as JSON array
    return JSON.parse(value);
  } catch {
    // Then try as comma-separated string
    const parts = value.split(',').map(s => s.trim());
    const numbers = parts.map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (numbers.length > 0 && numbers.length === parts.length) {
      return numbers;
    }
    return defaultValue;
  }
}

// Check for environment variable with fallback to alternate names for compatibility
function getEnvIntWithFallback(primaryName: string, fallbackNames: string[], defaultValue: number): number {
  // Try primary name first
  if (process.env[primaryName]) {
    const parsed = parseInt(process.env[primaryName]!, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Try fallback names
  for (const fallbackName of fallbackNames) {
    if (process.env[fallbackName]) {
      const parsed = parseInt(process.env[fallbackName]!, 10);
      if (!isNaN(parsed)) {
        console.warn(`Using deprecated environment variable ${fallbackName}, consider using ${primaryName}`);
        return parsed;
      }
    }
  }

  return defaultValue;
}

function getEnvIntArrayWithFallback(primaryName: string, fallbackNames: string[], defaultValue: number[]): number[] {
  // Try primary name first
  const primaryValue = process.env[primaryName];
  if (primaryValue) {
    try {
      return JSON.parse(primaryValue);
    } catch {
      // Try as comma-separated string
      const parts = primaryValue.split(',').map(s => s.trim());
      const numbers = parts.map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      if (numbers.length > 0 && numbers.length === parts.length) {
        return numbers;
      }
    }
  }

  // Try fallback names
  for (const fallbackName of fallbackNames) {
    const fallbackValue = process.env[fallbackName];
    if (fallbackValue) {
      console.warn(`Using deprecated environment variable ${fallbackName}, consider using ${primaryName}`);
      try {
        return JSON.parse(fallbackValue);
      } catch {
        // Try as comma-separated string
        const parts = fallbackValue.split(',').map(s => s.trim());
        const numbers = parts.map(s => parseInt(s, 10)).filter(n => !isNaN(n));
        if (numbers.length > 0 && numbers.length === parts.length) {
          return numbers;
        }
      }
    }
  }

  return defaultValue;
}

// Security validation functions
function validateSecret(name: string, value: string): void {
  if (!value) {
    throw new Error(`Security requirement: ${name} must be set`);
  }
  
  if (value.length < 16) {
    throw new Error(`Security requirement: ${name} must be at least 16 characters long`);
  }
  
  // Check for common weak patterns
  const weakPatterns = [
    /^(test|demo|example|sample|default)/i,
    /^(123|abc|password|secret)/i,
    /^(.)\1{15,}$/ // Repeated characters
  ];
  
  for (const pattern of weakPatterns) {
    if (pattern.test(value)) {
      throw new Error(`Security requirement: ${name} appears to be weak or insecure`);
    }
  }
}

function validateDatabaseUrl(url: string): void {
  try {
    const parsed = new URL(url);
    
    // Must use SSL in production
    if (process.env.NODE_ENV === 'production' && parsed.searchParams.get('sslmode') !== 'require') {
      throw new Error('Security requirement: DATABASE_URL must use SSL (sslmode=require) in production');
    }
    
    // Check for secure protocol
    if (parsed.protocol !== 'postgresql:') {
      throw new Error('Security requirement: DATABASE_URL must use postgresql protocol');
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Security requirement')) {
      throw error;
    }
    throw new Error(`Invalid DATABASE_URL format: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateEncryptionKey(key?: string): void {
  if (!key) return; // Optional
  
  if (key.length !== 32) {
    throw new Error('Security requirement: ENCRYPTION_KEY must be exactly 32 characters for AES-256');
  }
  
  // Check for sufficient entropy (basic check)
  const uniqueChars = new Set(key).size;
  if (uniqueChars < 8) {
    throw new Error('Security requirement: ENCRYPTION_KEY appears to have insufficient entropy');
  }
}

function validateWebhookUrl(url?: string): void {
  if (!url) return; // Optional
  
  try {
    const parsed = new URL(url);
    
    // Must use HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Security requirement: SECURITY_ALERT_WEBHOOK must use HTTPS in production');
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Security requirement')) {
      throw error;
    }
    throw new Error(`Invalid SECURITY_ALERT_WEBHOOK format: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Security validation for production environment
function validateProductionSecurity(): void {
  if (process.env.NODE_ENV !== 'production') return;
  
  // Required security variables for production
  const requiredProductionVars = [
    'NEXT_PUBLIC_WHOP_APP_ID', // Use public app ID as primary
    'WHOP_API_KEY',
    'DATABASE_URL'
  ];
  
  // WHOP_WEBHOOK_SECRET is required in production for security
  if (!process.env.WHOP_WEBHOOK_SECRET) {
    throw new Error('Security requirement: WHOP_WEBHOOK_SECRET must be set in production');
  }
  
  for (const varName of requiredProductionVars) {
    if (!process.env[varName]) {
      throw new Error(`Security requirement: ${varName} must be set in production`);
    }
  }
  
  // Check for development/test values in production
  const forbiddenPatterns = [
    /test/i,
    /demo/i,
    /example/i,
    /sample/i,
    /localhost/i,
    /127\.0\.0\.1/,
    /\.dev$/,
    /\.local$/
  ];
  
  for (const [key, value] of Object.entries(process.env)) {
    if (value && forbiddenPatterns.some(pattern => pattern.test(value))) {
      if (key.includes('SECRET') || key.includes('KEY') || key.includes('URL')) {
        console.warn(`⚠️  Security warning: ${key} appears to contain development/test values in production`);
      }
    }
  }
}

// Perform comprehensive security validation
function performSecurityValidation(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  try {
    // Validate secrets only if they are set (optional in development)
    if (process.env.WHOP_APP_SECRET) {
      validateSecret('WHOP_APP_SECRET', process.env.WHOP_APP_SECRET);
    }
    if (process.env.WHOP_WEBHOOK_SECRET) {
      validateSecret('WHOP_WEBHOOK_SECRET', process.env.WHOP_WEBHOOK_SECRET);
    }
    if (process.env.WHOP_API_KEY) {
      validateSecret('WHOP_API_KEY', process.env.WHOP_API_KEY);
    }
    
    // Validate database URL
    validateDatabaseUrl(process.env.DATABASE_URL!);
    
    // Validate optional security variables
    validateEncryptionKey(process.env.ENCRYPTION_KEY);
    validateWebhookUrl(process.env.SECURITY_ALERT_WEBHOOK);
    
    // Production-specific validation
    if (isProduction) {
      validateProductionSecurity();
    }
    
    console.log('✅ Security validation passed');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('🚨 Security validation failed:', errorMessage);
    
    if (isProduction) {
      throw new Error(`Security validation failed: ${errorMessage}`);
    } else {
      console.warn('⚠️  Security warning in development mode:', errorMessage);
    }
  }
}

// Export validation function for explicit calls
export function validateSecurityConfig(): void {
  performSecurityValidation();
}

export const env: EnvConfig = {
  WHOP_APP_ID: getEnvVar('WHOP_APP_ID', process.env.NEXT_PUBLIC_WHOP_APP_ID), // Alias to public app ID
  WHOP_APP_SECRET: process.env.WHOP_APP_SECRET, // Optional for legacy mode
  WHOP_WEBHOOK_SECRET: process.env.WHOP_WEBHOOK_SECRET,
  DATABASE_URL: getEnvVar('DATABASE_URL'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY, // Optional: for webhook payload encryption
  DATA_RETENTION_DAYS: getEnvInt('DATA_RETENTION_DAYS', 30), // Default 30 days retention
  // Feature flags
  ENABLE_PUSH: getEnvBool('ENABLE_PUSH', true),
  ENABLE_DM: getEnvBool('ENABLE_DM', true),
  DEFAULT_INCENTIVE_DAYS: getEnvIntWithFallback('DEFAULT_INCENTIVE_DAYS', ['INCENTIVE_DAYS'], 3),
  REMINDER_OFFSETS_DAYS: getEnvIntArrayWithFallback('REMINDER_OFFSETS_DAYS', ['REMINDER_OFFSETS_DAYS'], [0, 2, 4]),
  KPI_ATTRIBUTION_WINDOW_DAYS: getEnvIntWithFallback('KPI_ATTRIBUTION_WINDOW_DAYS', ['KPI_WINDOW_DAYS'], 14),
  WEBHOOK_TIMESTAMP_SKEW_SECONDS: getEnvInt('WEBHOOK_TIMESTAMP_SKEW_SECONDS', 300),
  MAX_REMINDER_CASES_PER_RUN: getEnvInt('MAX_REMINDER_CASES_PER_RUN', 100), // Default 100 cases per company per run
  MAX_CONCURRENT_REMINDER_SENDS: getEnvInt('MAX_CONCURRENT_REMINDER_SENDS', 10), // Default 10 concurrent sends
  // Security configuration
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  SECURITY_MONITORING_ENABLED: getEnvBool('SECURITY_MONITORING_ENABLED', true),
  RATE_LIMIT_FAIL_CLOSED: getEnvBool('RATE_LIMIT_FAIL_CLOSED', process.env.NODE_ENV === 'production'),
  SECURITY_ALERT_WEBHOOK: process.env.SECURITY_ALERT_WEBHOOK,
  SESSION_TIMEOUT_MINUTES: getEnvInt('SESSION_TIMEOUT_MINUTES', 60), // 1 hour default
  MAX_LOGIN_ATTEMPTS: getEnvInt('MAX_LOGIN_ATTEMPTS', 5),
  LOCKOUT_DURATION_MINUTES: getEnvInt('LOCKOUT_DURATION_MINUTES', 15),
  AUDIT_LOG_RETENTION_DAYS: getEnvInt('AUDIT_LOG_RETENTION_DAYS', 365), // 1 year default
  // Supabase configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  // Whop integration
  WHOP_API_KEY: process.env.WHOP_API_KEY,
  NEXT_PUBLIC_WHOP_APP_ID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
  NEXT_PUBLIC_WHOP_AGENT_USER_ID: process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID,
  NEXT_PUBLIC_WHOP_COMPANY_ID: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
};

// Perform security validation on module load
performSecurityValidation();

