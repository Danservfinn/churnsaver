// Membership API endpoints
// GET /api/memberships/[membershipId] - get membership details
// POST /api/memberships/[membershipId]/manage-url - get manage URL

import { NextRequest, NextResponse } from 'next/server';
import {
  getMembershipDetails,
  getMembershipManageUrl,
  validateMembershipAccess
} from '@/server/services/memberships';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { errors } from '@/lib/apiResponse';

// GET /api/memberships/[membershipId] - Get membership details
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
      logger.warn('Unauthorized request to membership details - missing valid auth token');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { membershipId } = await params;

    // Validate membership access
    const hasAccess = await validateMembershipAccess(membershipId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Membership not found or not accessible' },
        { status: 404 }
      );
    }

    // Get full membership details
    const membership = await getMembershipDetails(membershipId);
    if (!membership) {
      return NextResponse.json(
        { error: 'Failed to retrieve membership details' },
        { status: 500 }
      );
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error('Membership API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











