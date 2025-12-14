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

  if (!context.companyId) {
    return {
      success: false,
      error: 'Company context required',
      status: 400,
      response: NextResponse.json({ error: 'Company context required' }, { status: 400 })
    };
  }

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

