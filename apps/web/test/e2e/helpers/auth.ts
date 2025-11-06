// Authentication helpers for E2E tests
import { Page } from '@playwright/test';

/**
 * Login helper for E2E tests
 * Note: This is a placeholder - actual implementation depends on your auth flow
 * For Whop apps, authentication is typically handled via OAuth/redirects
 */
export async function loginAsUser(
  page: Page,
  options: {
    email?: string;
    password?: string;
    companyId?: string;
    userId?: string;
  } = {}
): Promise<void> {
  // If using Whop's built-in auth, the app may handle auth automatically
  // For testing, we may need to mock the auth context or use test tokens
  
  // Check if we're already authenticated
  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    return; // Already logged in
  }

  // Navigate to login page if needed
  if (!currentUrl.includes('/login')) {
    await page.goto('/login');
  }

  // If there's a login form, fill it
  const emailInput = page.locator('[data-testid=email-input]');
  const passwordInput = page.locator('[data-testid=password-input]');
  const loginButton = page.locator('[data-testid=login-button]');

  if (await emailInput.isVisible()) {
    if (options.email) {
      await emailInput.fill(options.email);
    }
    if (options.password) {
      await passwordInput.fill(options.password);
    }
    if (await loginButton.isVisible()) {
      await loginButton.click();
    }
  }

  // Wait for redirect to dashboard or authenticated state
  await page.waitForURL(/\/dashboard|\/auth\/callback/, { timeout: 10000 });
}

/**
 * Set authentication context via headers/cookies for API testing
 * This is useful for API-level E2E tests
 */
export async function setAuthContext(
  page: Page,
  context: {
    companyId: string;
    userId: string;
    token?: string;
  }
): Promise<void> {
  // Set cookies or localStorage for auth context
  await page.context().addCookies([
    {
      name: 'x-company-id',
      value: context.companyId,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'x-user-id',
      value: context.userId,
      domain: 'localhost',
      path: '/',
    },
  ]);

  // Or set in localStorage if that's how auth is stored
  await page.addInitScript((token) => {
    if (token) {
      localStorage.setItem('auth_token', token);
    }
  }, context.token);
}

/**
 * Logout helper
 */
export async function logout(page: Page): Promise<void> {
  const logoutButton = page.locator('[data-testid=logout-button]');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }
  
  // Wait for redirect to login
  await page.waitForURL(/\/login/, { timeout: 5000 });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  return currentUrl.includes('/dashboard') || currentUrl.includes('/auth');
}

