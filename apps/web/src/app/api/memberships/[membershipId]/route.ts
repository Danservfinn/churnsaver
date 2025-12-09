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
import { requireAuthContext } from '@/lib/auth/requireAuth';

// GET /api/memberships/[membershipId] - Get membership details
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
    logger.error('Membership API error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}











