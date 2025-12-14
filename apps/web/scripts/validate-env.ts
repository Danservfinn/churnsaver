import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//i, 'DATABASE_URL must be a Postgres connection string'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10, 'SUPABASE_ANON_KEY must be at least 10 characters'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(10, 'SUPABASE_SERVICE_ROLE_KEY must be at least 10 characters'),
  WHOP_APP_ID: z.string().min(3, 'WHOP_APP_ID must be provided'),
  WHOP_API_KEY: z.string().min(10, 'WHOP_API_KEY must be at least 10 characters'),
  WHOP_WEBHOOK_SECRET: z.string().min(10, 'WHOP_WEBHOOK_SECRET must be at least 10 characters'),
  ENCRYPTION_KEY: z
    .string()
    .min(32, 'ENCRYPTION_KEY must be at least 32 characters for AES-256-GCM'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters')
});

function main() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`
    );
    console.error('Environment validation failed:\n- ' + messages.join('\n- '));
    process.exit(1);
  }

  console.log('Environment validation passed for required variables.');
}

main();

