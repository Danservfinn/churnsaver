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
) {
  try {
    // Get company context from request
    const context = getRequestContext(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to membership details - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    const { membershipId } = await params;

    // Validate membership access
    const hasAccess = await validateMembershipAccess(membershipId);
    if (!hasAccess) {
      return errors.notFound('Membership not found or not accessible');
    }

    // Get full membership details
    const membership = await getMembershipDetails(membershipId);
    if (!membership) {
      return errors.internalServerError('Failed to retrieve membership details');
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error('Membership API error:', error);
    return errors.internalServerError('Internal server error');
  }
}

