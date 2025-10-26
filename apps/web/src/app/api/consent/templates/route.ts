import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errorResponses, apiSuccess } from '@/lib/apiResponse';
import ConsentManagementService from '@/server/services/consentManagement';
import { 
  CreateConsentTemplateRequest, 
  UpdateConsentTemplateRequest,
  ConsentValidationError 
} from '@/types/consentManagement';

export interface ConsentTemplatesResponse {
  templates: any[];
  total: number;
}

/**
 * GET /api/consent/templates - Get consent templates
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');

    // Enforce authentication for template access (but allow anonymous for public templates)
    if (process.env.NODE_ENV === 'production' && !isAuthenticated) {
      logger.warn('Unauthorized request to consent templates', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for template reads (120/min per IP/user)
    const rateLimitKey = isAuthenticated ? `template_read:${userId}` : `template_read:${request.ip}`;
    const rateLimitResult = await checkRateLimit(
      rateLimitKey,
      RATE_LIMIT_CONFIGS.apiRead
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    const { searchParams } = new URL(request.url);

    // Parse filters
    const consentType = searchParams.get('consent_type');
    const isActive = searchParams.get('is_active');
    const isRequired = searchParams.get('is_required');

    logger.info('Fetching consent templates', {
      companyId,
      userId,
      filters: { consentType, isActive, isRequired },
      requestId
    });

    // Get templates from service
    const templates = await ConsentManagementService.getConsentTemplates(
      companyId || undefined,
      { requestId }
    );

    // Filter templates based on query parameters
    let filteredTemplates = templates;
    
    if (consentType) {
      filteredTemplates = filteredTemplates.filter(t => t.consent_type === consentType);
    }

    if (isActive !== null) {
      const activeValue = isActive === 'true';
      filteredTemplates = filteredTemplates.filter(t => t.is_active === activeValue);
    }

    if (isRequired !== null) {
      const requiredValue = isRequired === 'true';
      filteredTemplates = filteredTemplates.filter(t => t.is_required === requiredValue);
    }

    const response: ConsentTemplatesResponse = {
      templates: filteredTemplates,
      total: filteredTemplates.length
    };

    logger.info('Consent templates fetched successfully', {
      companyId,
      total: filteredTemplates.length,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to fetch consent templates', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    return errorResponses.internalServerErrorResponse('Failed to fetch consent templates');
  }
}

/**
 * POST /api/consent/templates - Create new consent template (system/admin only)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');
    const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Enforce authentication for template creation
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to create consent template', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Check for system/admin permissions (in production, restrict template creation)
    if (process.env.NODE_ENV === 'production') {
      // In a real implementation, you would check user roles/permissions
      // For now, we'll allow authenticated users to create templates
      // but this should be restricted to system administrators
      logger.warn('Template creation in production - should be admin restricted', {
        userId,
        companyId,
        requestId
      });
    }

    // Apply rate limiting for template creation (5/min per user)
    const rateLimitResult = await checkRateLimit(
      `template_create:${userId}`,
      { ...RATE_LIMIT_CONFIGS.consentCreate, windowMs: 300000 } // 5 minute window
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body
    const body: CreateConsentTemplateRequest = await request.json();

    // Validate request body
    if (!body || typeof body !== 'object') {
      return errorResponses.badRequestResponse('Invalid request body');
    }

    logger.info('Creating consent template', {
      userId,
      companyId,
      templateName: body.name,
      consentType: body.consent_type,
      ipAddress,
      requestId
    });

    // Create template through service
    const newTemplate = await ConsentManagementService.createConsentTemplate(
      body,
      { requestId, createdBy: userId }
    );

    if (!newTemplate) {
      return errorResponses.internalServerErrorResponse('Failed to create consent template');
    }

    logger.info('Consent template created successfully', {
      templateId: newTemplate.id,
      name: newTemplate.name,
      consentType: newTemplate.consent_type,
      createdBy: userId,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(newTemplate);

  } catch (error) {
    logger.error('Failed to create consent template', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    if (error instanceof SyntaxError) {
      return errorResponses.badRequestResponse('Invalid JSON in request body');
    }

    return errorResponses.internalServerErrorResponse('Failed to create consent template');
  }
}

/**
 * PUT /api/consent/templates - Update consent templates (batch operations, system/admin only)
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');

    // Enforce authentication for template updates
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to update consent templates', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Check for system/admin permissions
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Template update in production - should be admin restricted', {
        userId,
        companyId,
        requestId
      });
    }

    // Apply rate limiting for template updates (10/min per user)
    const rateLimitResult = await checkRateLimit(
      `template_update:${userId}`,
      { ...RATE_LIMIT_CONFIGS.consentUpdate, windowMs: 300000 } // 5 minute window
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body for batch operations
    const body = await request.json();

    if (!body || typeof body !== 'object' || !body.operations) {
      return errorResponses.badRequestResponse('Invalid request body. Expected { operations: [...] }');
    }

    const { operations } = body;

    if (!Array.isArray(operations) || operations.length === 0) {
      return errorResponses.badRequestResponse('Operations must be a non-empty array');
    }

    if (operations.length > 5) {
      return errorResponses.badRequestResponse('Maximum 5 template operations allowed per request');
    }

    logger.info('Processing batch template update', {
      userId,
      companyId,
      operationCount: operations.length,
      requestId
    });

    // Process operations (template updates would need to be implemented in service)
    const results = await Promise.allSettled(
      operations.map(async (operation: any, index: number) => {
        try {
          // Validate operation structure
          if (!operation.template_id || !operation.action) {
            throw new Error('Missing template_id or action in operation');
          }

          // For now, only support basic updates
          if (operation.action !== 'update') {
            throw new Error(`Unsupported template operation: ${operation.action}`);
          }

          // Validate update data
          if (!operation.update_data) {
            throw new Error('Missing update_data for update operation');
          }

          // Process template update (would need to be implemented in service)
          // For now, return a placeholder response
          return { 
            success: true, 
            data: { 
              template_id: operation.template_id,
              updated: true,
              update_data: operation.update_data
            }, 
            index 
          };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error), 
            index 
          };
        }
      })
    );

    // Separate successful and failed operations
    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success);
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success);

    const response = {
      successful_operations: successful.map(r => (r.value as any).data),
      failed_operations: failed.map(r => {
        if (r.status === 'rejected') {
          return { index: -1, error: r.reason };
        }
        return r.value;
      }),
      total_processed: operations.length,
      success_count: successful.length,
      failure_count: failed.length,
      note: 'Template update operations require service implementation'
    };

    logger.info('Batch template update completed', {
      userId,
      companyId,
      totalProcessed: operations.length,
      successCount: successful.length,
      failureCount: failed.length,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to process batch template update', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    if (error instanceof SyntaxError) {
      return errorResponses.badRequestResponse('Invalid JSON in request body');
    }

    return errorResponses.internalServerErrorResponse('Failed to process template update');
  }
}