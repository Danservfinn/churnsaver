// Enhanced Scheduler API with comprehensive controls and monitoring
// POST /api/scheduler/reminders - Controls and stats for the new scheduler service

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { scheduler } from '@/server/services/scheduler';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { withErrorHandler, createSuccessResponse } from '@/server/middleware/errorHandler';
import { createRequestContext } from '@/lib/apiResponse';
import { errors, errorResponses } from '@/lib/apiResponse';
import { categorizeAndLogError } from '@/lib/errorCategorization';
import { executeWithRecovery } from '@/lib/errorRecovery';

export async function POST(request: NextRequest) {
    // Create request context for logging and error handling
    const context = createRequestContext(request);
    
    // Check rate limit before processing
    const rateLimitResult = await checkRateLimit('scheduler:control', RATE_LIMIT_CONFIGS.scheduler);

    if (!rateLimitResult.allowed) {
      throw errors.rateLimited('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter || 60,
        resetAt: rateLimitResult.resetAt?.toISOString(),
        endpoint: 'scheduler/reminders',
        method: 'POST'
      });
    }

    // Initialize database connection with recovery
    await executeWithRecovery(
      () => initDb(),
      {
        service: 'database',
        circuitBreaker: true,
        retry: true,
        context: { operation: 'database_init', endpoint: 'scheduler/reminders' }
      }
    );

    // Use hardened SDK authentication
    const authContext = await getRequestContextSDK(request);

    // PRODUCTION: Require authentication for all requests
    if (process.env.NODE_ENV === 'production' && !authContext.isAuthenticated) {
      logger.warn('Unauthorized scheduler control request', {
        requestId: context.requestId,
        ip: context.ip
      });
      throw errors.unauthorized('Authentication required', {
        endpoint: 'scheduler/reminders',
        method: 'POST'
      });
    }

    // Parse request body for control commands
    const body = await request.json().catch(() => ({}));
    const { action, jobId } = body;

    const companyId = authContext.companyId;
    const userId = authContext.userId;

    logger.info('Scheduler control request', {
      action,
      companyId,
      userId,
      jobId,
      authenticated: authContext.isAuthenticated,
      requestId: context.requestId
    });

    switch (action) {
      case 'start':
        if (scheduler.isActive()) {
          throw errors.conflict('Scheduler is already running', {
            status: 'already_running',
            currentStatus: 'active'
          });
        }

        scheduler.start();
        logger.info('Scheduler started via API', {
          companyId,
          userId,
          requestId: context.requestId
        });

        return createSuccessResponse({
          action: 'start',
          status: 'started',
          message: 'Scheduler started successfully',
          timestamp: new Date().toISOString()
        }, context);

      case 'stop':
        if (!scheduler.isActive()) {
          throw errors.conflict('Scheduler is not running', {
            status: 'not_running',
            currentStatus: 'inactive'
          });
        }

        scheduler.stop();
        logger.info('Scheduler stopped via API', {
          companyId,
          userId,
          requestId: context.requestId
        });

        return createSuccessResponse({
          action: 'stop',
          status: 'stopped',
          message: 'Scheduler stopped successfully',
          timestamp: new Date().toISOString()
        }, context);

      case 'stats':
        const stats = await executeWithRecovery(
          () => scheduler.schedulePendingJobs(),
          {
            service: 'scheduler',
            retry: true,
            context: { operation: 'get_stats', requestId: context.requestId }
          }
        );
        
        return createSuccessResponse({
          action: 'stats',
          status: 'active',
          stats,
          timestamp: new Date().toISOString()
        }, context);

      case 'trigger_run':
        // Manually trigger a scheduler run (for testing/debugging)
        if (process.env.NODE_ENV === 'production') {
          throw errors.forbidden('Manual trigger not allowed in production', {
            environment: process.env.NODE_ENV,
            action: 'trigger_run'
          });
        }

        logger.info('Manual scheduler run triggered via API', {
          companyId,
          userId,
          requestId: context.requestId
        });

        const processResults = await executeWithRecovery(
          () => scheduler.schedulePendingJobs(),
          {
            service: 'scheduler',
            retry: true,
            context: {
              operation: 'trigger_run',
              requestId: context.requestId
            }
          }
        );

        return createSuccessResponse({
          action: 'trigger_run',
          message: 'Manual scheduler run completed',
          results: processResults,
          timestamp: new Date().toISOString()
        }, context);

      default:
        // If no action specified (called by cron), automatically process reminders
        logger.info('Automatic reminder processing triggered by cron', {
          companyId,
          requestId: context.requestId
        });

        const autoProcessResults = await executeWithRecovery(
          () => scheduler.schedulePendingJobs(),
          {
            service: 'scheduler',
            retry: true,
            context: {
              operation: 'auto_process',
              requestId: context.requestId
            }
          }
        );

        return createSuccessResponse({
          action: 'auto_process',
          message: 'Automatic reminder processing completed',
          results: autoProcessResults,
          timestamp: new Date().toISOString()
        }, context);
    }
  }

// GET endpoint for health checking the scheduler
export async function GET(request: NextRequest) {
    // Create request context for logging and error handling
    const context = createRequestContext(request);
    
    // Initialize database connection with recovery
    await executeWithRecovery(
      () => initDb(),
      {
        service: 'database',
        circuitBreaker: true,
        retry: true,
        context: {
          operation: 'health_check_db',
          endpoint: 'scheduler/reminders',
          requestId: context.requestId
        }
      }
    );

    // Get scheduler status
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      nextRun: 'External cron service managed',
      lastRun: 'Check logs for last execution',
      environment: process.env.NODE_ENV || 'development',
      schedulerActive: scheduler.isActive()
    };

    return createSuccessResponse(status, context);
  }
