import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { errorResponses, apiSuccess } from '@/lib/apiResponse';
import { requireAuthContext } from '@/lib/auth/requireAuth';

export interface RecoveryAction {
  id: string;
  case_id: string;
  membership_id: string;
  user_id: string;
  type: string;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CaseActionsResponse {
  actions: RecoveryAction[];
  caseId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const { caseId } = await params;

    // Initialize database connection
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? errorResponses.unauthorizedResponse(auth.error || 'Authentication required');
    }

    // Get companyId from query params or auth context
    const { searchParams } = new URL(request.url);
    const queryCompanyId = searchParams.get('companyId');
    const { companyId: authCompanyId, userId, isAuthenticated } = auth.context;
    const companyId = queryCompanyId || authCompanyId;

    if (!companyId) {
      logger.warn('Case actions request missing companyId');
      return errorResponses.badRequestResponse('Company context is required');
    }

    if (!caseId) {
      return errorResponses.badRequestResponse('Case ID is required');
    }

    logger.info('Fetching case actions', {
      caseId,
      companyId,
      userId,
      isAuthenticated,
    });

    setRequestContext({
      companyId,
      userId: userId ?? undefined,
      isAuthenticated,
    });

    // First verify the case belongs to this company
    const caseCheck = await sqlWithRLS.select<{ id: string }>(
      `SELECT id FROM recovery_cases WHERE id = $1 AND company_id = $2`,
      [caseId, companyId],
      { companyId }
    );

    if (caseCheck.length === 0) {
      return errorResponses.notFoundResponse('Case not found');
    }

    // Fetch actions for the case
    const actions = await sqlWithRLS.select<RecoveryAction>(
      `SELECT id, case_id, membership_id, user_id, type, channel, metadata, created_at
       FROM recovery_actions
       WHERE case_id = $1 AND company_id = $2
       ORDER BY created_at ASC`,
      [caseId, companyId],
      { companyId }
    );

    const response: CaseActionsResponse = {
      actions,
      caseId,
    };

    logger.info('Case actions fetched', {
      caseId,
      companyId,
      actionsCount: actions.length,
      processingTimeMs: Date.now() - startTime,
    });

    return apiSuccess(response);
  } catch (error) {
    logger.error('Failed to fetch case actions', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
    });

    return errorResponses.internalServerErrorResponse('Failed to fetch case actions');
  } finally {
    clearRequestContext();
  }
}
