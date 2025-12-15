import { NextResponse, type NextRequest } from 'next/server';
import { getRequestContext } from '@/lib/auth/whop';
import { isProductionLikeEnvironment } from '@/lib/env';
import { getQaDemoContext, isQaDemoBypassEnabled } from '@/lib/qaDemo';

export interface AuthResult {
  success: boolean;
  context?: Awaited<ReturnType<typeof getRequestContext>>;
  error?: string;
  status?: number;
  response?: NextResponse;
}

export async function requireAuthContext(request: NextRequest): Promise<AuthResult> {
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

