import { Whop } from "@whop/sdk";
import { env, isProductionLikeEnvironment } from "@/lib/env";
import { logger } from '@/lib/logger';

type HeaderLike = { get: (key: string) => string | null };

const WHOP_TOKEN_HEADER = 'x-whop-user-token';
const AUTHORIZATION_HEADER = 'authorization';

function extractToken(headers: HeaderLike): string | null {
  const headerToken = headers.get(WHOP_TOKEN_HEADER);
  if (headerToken) return headerToken;

  const authorization = headers.get(AUTHORIZATION_HEADER);
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  return null;
}

function buildVerificationHeaders(headers: HeaderLike, token: string): Headers {
  const normalized = new Headers();
  normalized.set(WHOP_TOKEN_HEADER, token);

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    normalized.set('x-forwarded-for', forwardedFor);
  }

  return normalized;
}

/**
 * Request context interface for authentication
 */
export interface RequestContext {
  companyId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  role?: string;
  devBypass?: boolean;
}

/**
 * Canonical Whop SDK client instance
 * Initialized with environment variables for consistent usage across the application
 */
export const whopsdk = new Whop({
  appID: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID,
  apiKey: env.WHOP_API_KEY,
  webhookKey: env.WHOP_WEBHOOK_SECRET ? Buffer.from(env.WHOP_WEBHOOK_SECRET, "utf8").toString("base64") : undefined,
});

/**
 * Get request context from Whop token using JWT verification
 * Uses Whop SDK's verifyUserToken method which handles RS256 verification correctly
 */
export async function getRequestContextSDK(request: { headers: HeaderLike }): Promise<RequestContext> {
  try {
    // In development, skip verification if no secret is set
    if (process.env.NODE_ENV === 'development' && !env.WHOP_APP_SECRET && !env.WHOP_API_KEY) {
      return {
        companyId: env.NEXT_PUBLIC_WHOP_APP_ID || 'dev-company',
        userId: 'dev-user',
        isAuthenticated: true,
        devBypass: true,
      };
    }

    // Extract token from headers
    const token = extractToken(request.headers);
    
    if (!token) {
      return {
        companyId: null,
        userId: null,
        isAuthenticated: false
      };
    }

    const headersForSDK = buildVerificationHeaders(request.headers, token);
    const result = await whopsdk.verifyUserToken(headersForSDK, { dontThrow: true });
    
    if (!result) {
      logger.warn('Whop token verification failed', {
        hasToken: !!token,
        tokenLength: token.length
      });
      return {
        companyId: null,
        userId: null,
        isAuthenticated: false
      };
    }

    // Extract companyId and userId from verified result
    const resolvedCompanyId =
      (result as any).companyId ??
      (result as any).company_id ??
      (result as any).app_id ??
      null;
    const resolvedUserId = result.userId ?? (result as any).user_id ?? null;

    if (!resolvedUserId) {
      logger.warn('Whop token verified but missing user id', {
        hasToken: true,
        tokenLength: token.length,
      });
      return {
        companyId: null,
        userId: null,
        isAuthenticated: false,
      };
    }

    return {
      companyId: typeof resolvedCompanyId === 'string' ? resolvedCompanyId : null,
      userId: typeof resolvedUserId === 'string' ? resolvedUserId : null,
      isAuthenticated: true
    };
  } catch (error) {
    // Log error and return anonymous context on verification failure
    logger.warn('Whop token verification error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return {
      companyId: null,
      userId: null,
      isAuthenticated: false
    };
  }
}

/**
 * Verify user token from request headers using the Whop SDK
 * DEPRECATED: Use getRequestContextSDK instead. This function is kept for backward compatibility.
 * @deprecated Use getRequestContextSDK for new code
 */
export async function verifyUserToken(headers: HeaderLike | Headers): Promise<Record<string, unknown> | null> {
  try {
    const token = extractToken(headers);
    if (!token) return null;

    const verificationHeaders = buildVerificationHeaders(headers, token);
    const result = await whopsdk.verifyUserToken(verificationHeaders, { dontThrow: true });
    return result as Record<string, unknown> | null;
  } catch (error) {
    logger.warn('Failed to verify Whop user token', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if a user has access to a specific resource (experience, company, etc.)
 */
export async function checkUserAccess(
  resourceId: string, 
  options: { id: string }
): Promise<{ hasAccess: boolean }> {
  try {
    const result = await whopsdk.users.checkAccess(resourceId, options);
    return { hasAccess: (result as any).has_access };
  } catch (error) {
    throw new Error(`Access check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieve user information
 */
export async function retrieveUser(userId: string) {
  try {
    return await whopsdk.users.retrieve(userId);
  } catch (error) {
    throw new Error(`User retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieve company information
 */
export async function retrieveCompany(companyId: string) {
  try {
    return await whopsdk.companies.retrieve(companyId);
  } catch (error) {
    throw new Error(`Company retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieve experience information
 */
export async function retrieveExperience(experienceId: string) {
  try {
    return await whopsdk.experiences.retrieve(experienceId);
  } catch (error) {
    throw new Error(`Experience retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get company context from webhook headers or payload
 */
export function getWebhookCompanyContext(headers: Record<string, string>, payload?: any): string | undefined {
  const debugEnabled = !isProductionLikeEnvironment();

  // DEBUG: Log payload structure only in non-production-like environments
  if (debugEnabled) {
    logger.debug('getWebhookCompanyContext called', {
      hasHeader: !!headers['x-whop-company-id'],
      hasPayload: !!payload,
      payloadKeys: payload ? Object.keys(payload) : [],
      dataKeys: payload?.data ? Object.keys(payload.data) : [],
      // Log full payload structure (tightly truncated to avoid leaking PII)
      payloadStructure: payload ? JSON.stringify(payload).substring(0, 100) : 'no payload'
    });
  }

  // If payload is provided, extract companyId only from signed payload content (headers are not trusted)
  if (payload) {
    // Try top-level company_id first (some webhook formats)
    if (typeof payload.company_id === 'string' && payload.company_id) {
      if (debugEnabled) logger.debug('CompanyId extracted from payload.company_id', { companyId: payload.company_id });
      return payload.company_id;
    }

    // Try different possible locations for company ID in the payload
    const data = payload.data || {};
    
    // Direct company_id field in data
    if (typeof data.company_id === 'string' && data.company_id) {
      logger.debug('CompanyId extracted from payload.data.company_id', { companyId: data.company_id });
      return data.company_id;
    }
    
    // Nested company object with id
    if (data.company && typeof data.company === 'object') {
      if (typeof data.company.id === 'string' && data.company.id) {
        if (debugEnabled) logger.debug('CompanyId extracted from payload.data.company.id', { companyId: data.company.id });
        return data.company.id;
      }
      if (typeof data.company.company_id === 'string' && data.company.company_id) {
        if (debugEnabled) logger.debug('CompanyId extracted from payload.data.company.company_id', { companyId: data.company.company_id });
        return data.company.company_id;
      }
    }
    
    // Membership object with company_id
    if (data.membership && typeof data.membership === 'object') {
      if (typeof data.membership.company_id === 'string' && data.membership.company_id) {
        if (debugEnabled) logger.debug('CompanyId extracted from payload.data.membership.company_id', { companyId: data.membership.company_id });
        return data.membership.company_id;
      }
      if (data.membership.company && typeof data.membership.company === 'object') {
        if (typeof data.membership.company.id === 'string' && data.membership.company.id) {
          if (debugEnabled) logger.debug('CompanyId extracted from payload.data.membership.company.id', { companyId: data.membership.company.id });
          return data.membership.company.id;
        }
        if (typeof data.membership.company.company_id === 'string' && data.membership.company.company_id) {
          if (debugEnabled) logger.debug('CompanyId extracted from payload.data.membership.company.company_id', { companyId: data.membership.company.company_id });
          return data.membership.company.company_id;
        }
      }
    }
    
    // Payment object might have company_id
    if (data.payment && typeof data.payment === 'object' && typeof data.payment.company_id === 'string' && data.payment.company_id) {
      if (debugEnabled) logger.debug('CompanyId extracted from payload.data.payment.company_id', { companyId: data.payment.company_id });
      return data.payment.company_id;
    }
    
    // Experience object with company_id
    if (data.experience && typeof data.experience === 'object' && typeof data.experience.company_id === 'string' && data.experience.company_id) {
      if (debugEnabled) logger.debug('CompanyId extracted from payload.data.experience.company_id', { companyId: data.experience.company_id });
      return data.experience.company_id;
    }
    
    // Product object might have company_id
    if (data.product && typeof data.product === 'object' && typeof data.product.company_id === 'string' && data.product.company_id) {
      if (debugEnabled) logger.debug('CompanyId extracted from payload.data.product.company_id', { companyId: data.product.company_id });
      return data.product.company_id;
    }
    
    // Try data.company as a string
    if (typeof data.company === 'string' && data.company) {
      if (debugEnabled) logger.debug('CompanyId extracted from payload.data.company', { companyId: data.company });
      return data.company;
    }
    
    // Log detailed structure for debugging (non-production only, tightly truncated)
    if (debugEnabled) {
      logger.debug('No companyId found in payload. Full structure', {
        topLevelKeys: Object.keys(payload),
        dataKeys: Object.keys(data),
        membershipKeys: data.membership ? Object.keys(data.membership) : [],
        paymentKeys: data.payment ? Object.keys(data.payment) : [],
        samplePayload: JSON.stringify(payload).substring(0, 100)
      });
    }
  }

  if (debugEnabled) logger.debug('No companyId could be extracted');
  return undefined;
}

// Export the SDK instance for direct usage if needed
export default whopsdk;