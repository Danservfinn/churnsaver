// Cron scheduler runner
// Starts the reminder processing scheduler

import { startReminderScheduler, isSchedulerRunning, triggerReminderProcessing } from '../src/server/cron/processReminders';
import { logger } from '../src/lib/logger';
import { initDb } from '../src/lib/db';

async function main() {
  const command = process.argv[2];

  // Initialize database connection
  await initDb();
  logger.info('Churn Saver Reminder Scheduler', { command });

  if (command === 'start') {
    logger.info('Starting reminder scheduler...');
    startReminderScheduler();

    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, stopping scheduler...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, stopping scheduler...');
      process.exit(0);
    });

    // Keep alive message
    setInterval(() => {
      if (isSchedulerRunning()) {
        logger.info('Reminder scheduler running', {
          uptime: process.uptime(),
        });
      }
    }, 300000); // Log every 5 minutes

  } else if (command === 'trigger') {
    logger.info('Manually triggering reminder processing...');
    const result = await triggerReminderProcessing('demo-company');

    console.log('\n🔔 MANUAL REMINDER PROCESSING RESULTS');
    console.log('=====================================');
    console.log(`📊 Cases processed: ${result.processed}`);
    console.log(`✅ Successful: ${result.successful}`);
    console.log(`❌ Failed: ${result.failed}`);

    if (result.results.length > 0) {
      console.log('\n📋 Individual Results:');
      result.results.forEach(r => {
        const status = r.success ? '✅' : '❌';
        const channels = r.channels.length > 0 ? ` (${r.channels.join(', ')})` : '';
        const incentive = r.incentiveApplied ? ' 🎁' : '';
        console.log(`${status} Case ${r.caseId.substring(0, 8)}...: ${r.channels.length} channels${incentive}`);
        if (r.error) {
          console.log(`   Error: ${r.error}`);
        }
      });
    }

    process.exit(0);

  } else if (command === 'status') {
    const running = isSchedulerRunning();
    console.log(`📊 Scheduler Status: ${running ? '✅ RUNNING' : '❌ STOPPED'}`);
    process.exit(running ? 0 : 1);

  } else {
    console.log('Usage:');
    console.log('  npm run cron start    - Start the reminder scheduler');
    console.log('  npm run cron trigger  - Manually trigger reminder processing');
    console.log('  npm run cron status   - Check scheduler status');
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Scheduler runner failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
