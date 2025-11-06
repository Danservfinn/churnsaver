// GET /api/memberships/[membershipId]/manage-url - Get manage URL only

import { NextRequest, NextResponse } from 'next/server';
import { getMembershipManageUrl } from '@/server/services/memberships';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { errors } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
): Promise<NextResponse> {
  try {
    // Get company context from request
    const context = await getRequestContext(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to membership manage URL - missing valid auth token');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
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
    console.error('Manage URL API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











