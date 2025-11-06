// Test data fixtures for E2E tests

export interface TestCompany {
  id: string;
  name: string;
  userId: string;
  email: string;
}

export interface TestUser {
  id: string;
  email: string;
  companyId: string;
}

export interface TestCase {
  id: string;
  membershipId: string;
  userId: string;
  companyId: string;
  status: 'open' | 'recovered' | 'closed_no_recovery';
}

/**
 * Generate test company data
 */
export function createTestCompany(overrides: Partial<TestCompany> = {}): TestCompany {
  const timestamp = Date.now();
  return {
    id: `company_${timestamp}`,
    name: `Test Company ${timestamp}`,
    userId: `user_${timestamp}`,
    email: `test_${timestamp}@example.com`,
    ...overrides,
  };
}

/**
 * Generate test user data
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const timestamp = Date.now();
  return {
    id: `user_${timestamp}`,
    email: `user_${timestamp}@example.com`,
    companyId: `company_${timestamp}`,
    ...overrides,
  };
}

/**
 * Generate test case data
 */
export function createTestCase(overrides: Partial<TestCase> = {}): TestCase {
  const timestamp = Date.now();
  return {
    id: `case_${timestamp}`,
    membershipId: `mem_${timestamp}`,
    userId: `user_${timestamp}`,
    companyId: `company_${timestamp}`,
    status: 'open',
    ...overrides,
  };
}

/**
 * Test companies for multi-tenant testing
 */
export const TEST_COMPANIES = {
  COMPANY_A: createTestCompany({
    id: 'company-a-test',
    name: 'Company A',
    userId: 'user-company-a',
    email: 'user@companyA.com',
  }),
  COMPANY_B: createTestCompany({
    id: 'company-b-test',
    name: 'Company B',
    userId: 'user-company-b',
    email: 'user@companyB.com',
  }),
};

/**
 * Clean up test data
 */
export async function cleanupTestData(baseURL: string = 'http://localhost:3000'): Promise<void> {
  // This would call a cleanup endpoint if available
  // For now, it's a placeholder
  try {
    await fetch(`${baseURL}/api/test/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Cleanup endpoint may not exist in all environments
    console.warn('Cleanup endpoint not available:', error);
  }
}

