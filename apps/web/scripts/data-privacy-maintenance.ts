#!/usr/bin/env node

// Data Privacy & Maintenance Script
// Handles GDPR-compliant data cleanup, PII minimization, and retention policies
//
// Usage:
// npm run data-privacy-maintenance [command]

import { sql, initDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { env } from '../src/lib/env';
import { deriveMinimalPayload } from '../src/lib/encryption';

const COMMANDS = {
  'cleanup-old-events': 'Remove old webhook events with potential PII',
  'anonymize-users': 'Replace user IDs with anonymized tokens (BREAKING)',
  'count-pii-data': 'Count records containing potential PII',
  'redact-webhook-payloads': 'Remove sensitive data from existing webhook payloads',
  'purge-old-payloads': 'Purge old plaintext payloads and backfill payload_min (GDPR compliance)',
};

interface PrivacyStats {
  eventsWithPii: number;
  recoveryCases: number;
  recoveryActions: number;
  potentialPiiFields: string[];
}

async function countPiiData(): Promise<PrivacyStats> {
  logger.info('Counting records with potential PII...');

  const stats: PrivacyStats = {
    eventsWithPii: 0,
    recoveryCases: 0,
    recoveryActions: 0,
    potentialPiiFields: []
  };

  // Count events with sensitive webhook data
  const eventCount = await sql.select<{ count: number }>(`
    SELECT COUNT(*) as count FROM events
    WHERE payload ? 'data' AND payload->'data' ? 'payment'
  `);
  stats.eventsWithPii = eventCount[0]?.count || 0;

  // Count recovery cases (has user_id)
  const caseCount = await sql.select<{ count: number }>(`
    SELECT COUNT(*) as count FROM recovery_cases
  `);
  stats.recoveryCases = caseCount[0]?.count || 0;

  // Count recovery actions (has user_id)
  const actionCount = await sql.select<{ count: number }>(`
    SELECT COUNT(*) as count FROM recovery_actions
  `);
  stats.recoveryActions = actionCount[0]?.count || 0;

  logger.info('PII Data Assessment Complete', {
    eventsWithPii: stats.eventsWithPii,
    recoveryCases: stats.recoveryCases,
    recoveryActions: stats.recoveryActions,
    potentialPiiFields: stats.potentialPiiFields
  });
  return stats;
}

async function cleanupOldEvents(retentionDays: number = 90): Promise<number> {
  logger.info(`Cleaning up webhook events older than ${retentionDays} days...`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Only delete events that are processed and older than retention period
  const result = await sql.execute(`
    DELETE FROM events
    WHERE processed = true
      AND created_at < $1
  `, [cutoffDate]);

  const deletedCount = result > 0 ? result : 0;
  logger.info(`Cleaned up ${deletedCount} old webhook events`);
  return deletedCount;
}

/**
 * Purge old plaintext payloads and backfill payload_min for GDPR compliance
 * @param retentionDays - Days to retain plaintext payloads before purging
 * @returns Number of events processed
 */
async function purgeOldPayloads(retentionDays: number = env.DATA_RETENTION_DAYS): Promise<number> {
  logger.info(`Purging plaintext payloads older than ${retentionDays} days and backfilling payload_min...`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let processedCount = 0;

  // First, backfill payload_min for events where it's null but payload exists
  const eventsToBackfill = await sql.select<{ id: string; payload: string }>(`
    SELECT id, payload
    FROM events
    WHERE payload_min IS NULL
      AND payload IS NOT NULL
      AND created_at < $1
  `, [cutoffDate]);

  for (const event of eventsToBackfill) {
    try {
      const payload = JSON.parse(event.payload);
      const payloadMin = deriveMinimalPayload(payload);

      await sql.execute(`
        UPDATE events
        SET payload_min = $1
        WHERE id = $2
      `, [JSON.stringify(payloadMin), event.id]);

      processedCount++;
    } catch (error) {
      logger.error(`Failed to backfill payload_min for event ${event.id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Then, purge plaintext payloads older than retention period
  const purgeResult = await sql.execute(`
    UPDATE events
    SET payload = NULL
    WHERE payload IS NOT NULL
      AND created_at < $1
  `, [cutoffDate]);

  const purgedCount = purgeResult > 0 ? purgeResult : 0;

  logger.info(`Privacy maintenance complete: backfilled ${processedCount} events, purged ${purgedCount} old payloads`);
  return processedCount + purgedCount;
}

async function redactWebhookPayloads(): Promise<number> {
  logger.info('Redacting sensitive data from webhook payloads...');

  let redactedCount = 0;

  // Remove payment.card data if it exists
  const cardUpdates = await sql.execute(`
    UPDATE events
    SET payload = payload #- '{data,payment,card}'
    WHERE payload ? 'data'
      AND payload->'data' ? 'payment'
      AND payload->'data'->'payment' ? 'card'
  `);
  redactedCount += cardUpdates;

  // Remove billing_address if it exists
  const addressUpdates = await sql.execute(`
    UPDATE events
    SET payload = payload #- '{data,billing_address}'
    WHERE payload ? 'data' AND payload->'data' ? 'billing_address'
  `);
  redactedCount += addressUpdates;

  // Remove any customer.email field
  const emailUpdates = await sql.execute(`
    UPDATE events
    SET payload = payload #- '{data,customer,email}'
    WHERE payload ? 'data'
      AND payload->'data' ? 'customer'
      AND payload->'data'->'customer' ? 'email'
  `);
  redactedCount += emailUpdates;

  logger.info(`Redacted sensitive data from ${redactedCount} webhook payloads`);
  return redactedCount;
}

function generateAnonymizedToken(originalId: string): string {
  // Create deterministic but anonymous token from original ID
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(originalId + env.WHOP_WEBHOOK_SECRET) // Use secret for consistency
    .digest('hex');
  return `anon_${hash.substring(0, 16)}`;
}

async function anonymizeUsers(): Promise<number> {
  logger.warn('ANONYMIZING USER DATA - THIS IS IRREVERSIBLE!');
  logger.warn('Make sure you have backups before proceeding.');

  // This would anonymize user_ids in recovery_cases and recovery_actions tables
  // Only run this if absolutely required by privacy regulations

  let anonymizedCount = 0;

  // Process recovery_cases
  const cases = await sql.select<{ id: string; user_id: string }>(`
    SELECT id, user_id FROM recovery_cases WHERE user_id NOT LIKE 'anon_%'
  `);

  for (const case_ of cases) {
    const anonId = generateAnonymizedToken(case_.user_id);
    await sql.execute(`
      UPDATE recovery_cases SET user_id = $1 WHERE id = $2
    `, [anonId, case_.id]);
    anonymizedCount++;
  }

  // Process recovery_actions
  const actions = await sql.select<{ id: string; user_id: string }>(`
    SELECT id, user_id FROM recovery_actions WHERE user_id NOT LIKE 'anon-%'
  `);

  for (const action of actions) {
    const anonId = generateAnonymizedToken(action.user_id);
    await sql.execute(`
      UPDATE recovery_actions SET user_id = $1 WHERE id = $2
    `, [anonId, action.id]);
    anonymizedCount++;
  }

  logger.info(`Anonymized ${anonymizedCount} user records`);
  return anonymizedCount;
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Data Privacy & Maintenance Script');
    console.log('Usage: npm run data-privacy-maintenance [command]\n');
    console.log('Available commands:');
    Object.entries(COMMANDS).forEach(([cmd, desc]) => {
      console.log(`  ${cmd}: ${desc}`);
    });
    process.exit(1);
  }

  try {
    await initDb();
    logger.info(`Starting data privacy command: ${command}`);

    switch (command) {
      case 'count-pii-data':
        await countPiiData();
        break;

      case 'cleanup-old-events':
        const days = parseInt(process.argv[3]) || 90;
        await cleanupOldEvents(days);
        break;

      case 'purge-old-payloads':
        const retentionDays = parseInt(process.argv[3]) || env.DATA_RETENTION_DAYS;
        await purgeOldPayloads(retentionDays);
        break;

      case 'redact-webhook-payloads':
        await redactWebhookPayloads();
        break;

      case 'anonymize-users':
        // Require explicit confirmation for destructive operations
        if (process.argv[3] !== '--confirm') {
          console.error('⚠️  WARNING: This will irreversibly anonymize user IDs!');
          console.error('   Run with --confirm to proceed.');
          console.error('   Ensure you have database backups first.');
          process.exit(1);
        }
        await anonymizeUsers();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Available commands:', Object.keys(COMMANDS).join(', '));
        process.exit(1);
    }

    logger.info(`Successfully completed: ${command}`);

  } catch (error) {
    logger.error('Data privacy maintenance failed', {
      command,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Allow direct execution
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { countPiiData, cleanupOldEvents, purgeOldPayloads, redactWebhookPayloads, anonymizeUsers };
