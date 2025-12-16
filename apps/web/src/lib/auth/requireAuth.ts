import { NextResponse, type NextRequest } from 'next/server';
import { getRequestContext } from '@/lib/auth/whop';
import { isProductionLikeEnvironment } from '@/lib/env';
import { getQaDemoContext, isQaDemoBypassEnabled } from '@/lib/qaDemo';
import { logger } from '@/lib/logger';

// Demo token for screenshot/testing access to demo company data only
// This allows production access to biz_demo_staging without Whop auth
const DEMO_ACCESS_TOKEN = process.env.DEMO_ACCESS_TOKEN || 'churnsaver_demo_2024';
const DEMO_COMPANY_ID = 'biz_demo_staging';

function isDemoTokenAccess(request: NextRequest): { valid: boolean; companyId?: string } {
  const url = new URL(request.url);
  const token = url.searchParams.get('demo_token');
  const companyId = url.searchParams.get('companyId');
  
  // Token must match and company must be the demo company
  if (token === DEMO_ACCESS_TOKEN && companyId === DEMO_COMPANY_ID) {
    logger.info('Demo token access granted', { companyId: DEMO_COMPANY_ID });
    return { valid: true, companyId: DEMO_COMPANY_ID };
  }
  
  return { valid: false };
}

export interface AuthResult {
  success: boolean;
  context?: Awaited<ReturnType<typeof getRequestContext>>;
  error?: string;
  status?: number;
  response?: NextResponse;
}

export async function requireAuthContext(request: NextRequest): Promise<AuthResult> {
  // Check for demo token access (works in production for demo company only)
  const demoAccess = isDemoTokenAccess(request);
  if (demoAccess.valid && demoAccess.companyId) {
    return {
      success: true,
      context: {
        companyId: demoAccess.companyId,
        userId: 'demo_user',
        isAuthenticated: true,
        devBypass: true,
      },
    };
  }

  if (isQaDemoBypassEnabled(request)) {
    return {
      success: true,
      context: getQaDemoContext(),
    };
  }

  const context = await getRequestContext(request);

  // Note: companyId may come from query params in routes, so we don't require it here
  // Routes that need companyId should check both context.companyId and query params
  // See Whop docs: "The company id will be passed in the path parameters when your app is loaded"

  if (isProductionLikeEnvironment() && !context.isAuthenticated) {
    return {
      success: false,
      error: 'Authentication required',
      status: 401,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    };
  }

  return { success: true, context };
}

