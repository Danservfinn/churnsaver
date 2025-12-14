// Queue Worker Entrypoint
// This is a dedicated worker process that processes pg-boss jobs
// Run this in a long-lived process (Fly.io, Render, Railway, etc.)
// DO NOT run this in serverless functions (Vercel, AWS Lambda, etc.)

import { jobQueue } from '@/server/services/jobQueue';
import { logger } from '@/lib/logger';
import { initDb, closeDb } from '@/lib/db';
import { initDbWithRLS, closeDbWithRLS } from '@/lib/db-rls';

let shutdownRequested = false;

async function gracefulShutdown(signal: string) {
  if (shutdownRequested) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  shutdownRequested = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await jobQueue.shutdown();
    await Promise.allSettled([closeDbWithRLS(), closeDb()]);
    logger.info('Worker shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

async function main() {
  logger.info('Starting queue worker...', {
    nodeEnv: process.env.NODE_ENV,
    pgBossEnabled: process.env.ENABLE_PG_BOSS === 'true',
    pgBossWorkerEnabled: process.env.ENABLE_PG_BOSS_WORKER === 'true'
  });

  // Validate required environment variables
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (process.env.ENABLE_PG_BOSS !== 'true') {
    logger.warn('ENABLE_PG_BOSS is not set to "true", worker will not process jobs');
  }

  if (process.env.ENABLE_PG_BOSS_WORKER !== 'true') {
    logger.warn('ENABLE_PG_BOSS_WORKER is not set to "true", worker will not start');
    process.exit(0);
  }

  // Register signal handlers for graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in worker', {
      error: error.message,
      stack: error.stack
    });
    void gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection in worker', {
      reason: reason instanceof Error ? reason.message : String(reason)
    });
    void gracefulShutdown('unhandledRejection');
  });

  try {
    await Promise.all([initDbWithRLS(), initDb()]);
    // Initialize worker mode (registers job handlers)
    await jobQueue.initWorker();

    logger.info('Queue worker started successfully and is processing jobs', {
      jobTypes: ['webhook-processing', 'reminder-processing']
    });

    // Keep the process alive - pg-boss will handle job polling and processing
    // The worker will continue running until it receives a shutdown signal
  } catch (error) {
    logger.error('Failed to start queue worker', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  logger.error('Fatal error in worker main', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});



