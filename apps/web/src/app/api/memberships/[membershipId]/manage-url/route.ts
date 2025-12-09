// GET /api/memberships/[membershipId]/manage-url - Get manage URL only

import { NextRequest, NextResponse } from 'next/server';
import { getMembershipManageUrl } from '@/server/services/memberships';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
): Promise<NextResponse> {
  try {
    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json({ error: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }

    const { membershipId } = await params;

    const manageUrl = await getMembershipManageUrl(membershipId);

    if (!manageUrl) {
      return NextResponse.json(
        { error: 'Manage URL not available for this membership' },
        { status: 404 }
      );
    }

    return NextResponse.json({ manageUrl });
  } catch (error) {
    logger.error('Manage URL API error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











