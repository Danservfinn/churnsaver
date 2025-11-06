import { Whop } from "@whop/sdk";
import { env } from "@/lib/env";
import { jwtVerify, importPKCS8, SignJWT } from 'jose';
import { makeWebhookValidator, type PaymentWebhookData } from '@whop/api';

/**
 * Request context interface for authentication
 */
export interface RequestContext {
  companyId: string;
  userId: string;
  isAuthenticated: boolean;
  role?: string;
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
 * This is the preferred method for authentication going forward
 */
export async function getRequestContextSDK(request: { headers: { get: (key: string) => string | null } }): Promise<RequestContext> {
  try {
    // Extract token from headers
    const token = request.headers.get('x-whop-user-token');
    
    if (!token) {
      return {
        companyId: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown',
        userId: 'anonymous',
        isAuthenticated: false
      };
    }

    // In development, skip verification if no secret is set
    if (process.env.NODE_ENV === 'development' && !env.WHOP_APP_SECRET) {
      return {
        companyId: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'dev',
        userId: 'dev-user',
        isAuthenticated: true
      };
    }

    // Verify JWT token
    if (env.WHOP_APP_SECRET) {
      const secretKey = await importPKCS8(env.WHOP_APP_SECRET, 'RS256');
      const { payload } = await jwtVerify(token, secretKey);
      
      return {
        companyId: payload.companyId as string || env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown',
        userId: payload.userId as string || 'unknown',
        isAuthenticated: true
      };
    }

    // Fallback to SDK verification
    const headersObj = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headersObj.set(key, value);
      }
    }
    const result = await whopsdk.verifyUserToken(headersObj);
    return {
      companyId: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown',
      userId: result.userId,
      isAuthenticated: true
    };
  } catch (error) {
    // Return anonymous context on verification failure
    return {
      companyId: env.NEXT_PUBLIC_WHOP_APP_ID || env.WHOP_APP_ID || 'unknown',
      userId: 'anonymous',
      isAuthenticated: false
    };
  }
}

/**
 * Verify user token from request headers using the Whop SDK
 * This is the preferred method for authentication going forward
 */
export async function verifyUserToken(headers: Headers): Promise<{ userId: string }> {
  try {
    const result = await whopsdk.verifyUserToken(headers);
    return { userId: result.userId };
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
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
 * Get company context from webhook headers
 */
export function getWebhookCompanyContext(headers: Record<string, string>): string | undefined {
  // Try to extract company ID from headers
  // This is a simplified implementation - in a real scenario you might
  // want to validate the signature against the company's webhook secret
  return headers['x-whop-company-id'];
}

// Export the SDK instance for direct usage if needed
export default whopsdk;