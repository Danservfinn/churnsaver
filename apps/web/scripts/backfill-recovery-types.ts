#!/usr/bin/env ts-node

import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';

async function backfill() {
  await initDb();

  logger.info('Starting recovery_type backfill');

  await sql.execute(
    `UPDATE recovery_cases
     SET recovery_type = 'LEGACY_UNKNOWN'
     WHERE status = 'recovered' AND recovery_type IS NULL`
  );

  logger.info('Initializing company_subscriptions for existing companies');
  await sql.execute(
    `INSERT INTO company_subscriptions (company_id, tier)
     SELECT DISTINCT company_id, 'free' FROM recovery_cases
     ON CONFLICT (company_id) DO NOTHING`
  );

  logger.info('Backfill complete');
}

backfill()
  .then(() => {
    logger.info('Backfill script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Backfill script failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });

