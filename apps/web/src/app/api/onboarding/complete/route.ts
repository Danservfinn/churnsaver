import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { sqlWithRLS as sql, initDbWithRLS } from '@/lib/db-rls';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    // Ensure settings record exists to mark onboarding as complete
    // This creates a default settings record if one doesn't exist
    await sql.execute(
      `INSERT INTO creator_settings (
        company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at
      ) VALUES ($1, true, true, 3, ARRAY[0, 2, 4], now())
      ON CONFLICT (company_id) DO UPDATE SET updated_at = now()`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );

    logger.info('Onboarding marked as complete', { companyId });

    return NextResponse.json({
      success: true,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to complete onboarding', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}
