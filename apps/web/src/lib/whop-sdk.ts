import { Whop } from "@whop/sdk";
import { env } from "@/lib/env";

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
 * Verify user token from request headers using the Whop SDK
 * This is the preferred method for authentication going forward
 */
// async function verifyUserToken(headers: Headers): Promise<{ userId: string }> {
//   try {
//     const result = await whopsdk.verifyUserToken(Object.fromEntries(headers.entries()));
//     return { userId: result.userId };
//   } catch (error) {
//     throw new Error(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
//   }
// }
async function verifyUserToken(headers: Headers): Promise<{ userId: string }> {
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

// Export the SDK instance for direct usage if needed
export default whopsdk;