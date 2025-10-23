// Event retention cleanup script
// Implements GDPR-compliant data retention policies:
// - Events with null/plaintext payloads: deleted after 30 days
// - Events with encrypted payloads: deleted after 60 days
// Run daily via Vercel cron job

import { initDb, sql, closeDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { env } from '../src/lib/env';

// Retention periods in days
const PLAINTEXT_RETENTION_DAYS = 30; // Events with null or plaintext payloads
const ENCRYPTED_RETENTION_DAYS = 60; // Events with encrypted payloads

interface CleanupStats {
  plaintextDeleted: number;
  encryptedDeleted: number;
  totalDeleted: number;
  errors: string[];
}

async function cleanupEventsByRetention(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    plaintextDeleted: 0,
    encryptedDeleted: 0,
    totalDeleted: 0,
    errors: []
  };

  try {
    logger.info('Starting event retention cleanup');

    // Calculate cutoff dates
    const now = new Date();
    const plaintextCutoff = new Date(now);
    plaintextCutoff.setDate(now.getDate() - PLAINTEXT_RETENTION_DAYS);

    const encryptedCutoff = new Date(now);
    encryptedCutoff.setDate(now.getDate() - ENCRYPTED_RETENTION_DAYS);

    logger.info('Retention policy cutoffs', {
      plaintextCutoff: plaintextCutoff.toISOString(),
      encryptedCutoff: encryptedCutoff.toISOString(),
      plaintextRetentionDays: PLAINTEXT_RETENTION_DAYS,
      encryptedRetentionDays: ENCRYPTED_RETENTION_DAYS
    });

    // Delete events with null/plaintext payloads (older than 30 days)
    try {
      const plaintextResult = await sql.execute(`
        DELETE FROM events
        WHERE created_at < $1
          AND (payload IS NULL OR payload_encrypted IS NULL)
      `, [plaintextCutoff]);

      stats.plaintextDeleted = typeof plaintextResult === 'number' ? plaintextResult : 0;
      logger.info('Deleted plaintext/null payload events', {
        count: stats.plaintextDeleted,
        cutoffDate: plaintextCutoff.toISOString()
      });
    } catch (error) {
      const errorMsg = `Failed to delete plaintext events: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      stats.errors.push(errorMsg);
    }

    // Delete events with encrypted payloads (older than 60 days)
    try {
      const encryptedResult = await sql.execute(`
        DELETE FROM events
        WHERE created_at < $1
          AND payload_encrypted IS NOT NULL
      `, [encryptedCutoff]);

      stats.encryptedDeleted = typeof encryptedResult === 'number' ? encryptedResult : 0;
      logger.info('Deleted encrypted payload events', {
        count: stats.encryptedDeleted,
        cutoffDate: encryptedCutoff.toISOString()
      });
    } catch (error) {
      const errorMsg = `Failed to delete encrypted events: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      stats.errors.push(errorMsg);
    }

    stats.totalDeleted = stats.plaintextDeleted + stats.encryptedDeleted;

    logger.info('Event retention cleanup completed', {
      plaintextDeleted: stats.plaintextDeleted,
      encryptedDeleted: stats.encryptedDeleted,
      totalDeleted: stats.totalDeleted,
      errors: stats.errors.length
    });

  } catch (error) {
    const errorMsg = `Event cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(errorMsg);
    stats.errors.push(errorMsg);
    throw error;
  }

  return stats;
}

async function main(): Promise<void> {
  try {
    // Initialize database connection
    await initDb();

    // Run retention-based cleanup
    const stats = await cleanupEventsByRetention();

    if (stats.errors.length > 0) {
      logger.warn('Cleanup completed with errors', {
        totalDeleted: stats.totalDeleted,
        errorCount: stats.errors.length,
        errors: stats.errors
      });
      process.exit(1);
    }

    logger.info('Cleanup script completed successfully', {
      plaintextDeleted: stats.plaintextDeleted,
      encryptedDeleted: stats.encryptedDeleted,
      totalDeleted: stats.totalDeleted
    });
  } catch (error) {
    logger.error('Cleanup script failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
