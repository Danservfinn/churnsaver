import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { sqlWithRLS as sql, initDbWithRLS } from '@/lib/db-rls';

interface OnboardingStatusResponse {
  completed: boolean;
  completedAt: string | null;
  hasEvents: boolean;
  hasSettings: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { companyId } = auth.context;
    if (!companyId) {
      return NextResponse.json({ error: 'Company context is required' }, { status: 400 });
    }

    // Check for events (indicates webhook is connected)
    const eventsResult = await sql.select<{ count: string }>(
      `SELECT COUNT(*) as count FROM events WHERE company_id = $1`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );
    const hasEvents = parseInt(eventsResult[0]?.count || '0', 10) > 0;

    // Check for settings (indicates user has configured the app)
    const settingsResult = await sql.select<{ updated_at: string }>(
      `SELECT updated_at FROM creator_settings WHERE company_id = $1`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );
    const hasSettings = settingsResult.length > 0;

    // Consider onboarding complete if user has settings configured
    // This is a simple heuristic - more sophisticated tracking could be added
    const completed = hasSettings;
    const completedAt = hasSettings ? settingsResult[0]?.updated_at : null;

    const response: OnboardingStatusResponse = {
      completed,
      completedAt,
      hasEvents,
      hasSettings,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to get onboarding status', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to get onboarding status' }, { status: 500 });
  }
}
