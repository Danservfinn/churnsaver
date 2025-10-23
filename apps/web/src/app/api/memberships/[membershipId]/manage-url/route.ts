// GET /api/memberships/[membershipId]/manage-url - Get manage URL only

import { NextRequest, NextResponse } from 'next/server';
import { getMembershipManageUrl } from '@/server/services/memberships';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { errors } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  try {
    // Get company context from request
    const context = getRequestContext(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to membership manage URL - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    const { membershipId } = await params;

    const manageUrl = await getMembershipManageUrl(membershipId);

    if (!manageUrl) {
      return errors.notFound('Manage URL not available for this membership');
    }

    return NextResponse.json({ manageUrl });
  } catch (error) {
    console.error('Manage URL API error:', error);
    return errors.internalServerError('Internal server error');
  }
}

