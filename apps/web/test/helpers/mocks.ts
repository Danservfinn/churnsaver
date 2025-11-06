// Service mocks for testing
// Provides mocks for external services like Whop API, notification services, etc.

import { vi } from 'vitest';

/**
 * Mock Whop API client
 */
export function createMockWhopClient() {
  return {
    memberships: {
      addFreeDays: vi.fn().mockResolvedValue({ success: true }),
      get: vi.fn().mockResolvedValue({
        id: 'test-membership-id',
        user_id: 'test-user-id',
        status: 'active',
      }),
      terminate: vi.fn().mockResolvedValue({ success: true }),
    },
    auth: {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      refreshAccessToken: vi.fn().mockResolvedValue('test-token'),
    },
  };
}

/**
 * Mock notification service
 */
export function createMockNotificationService() {
  return {
    sendPush: vi.fn().mockResolvedValue({ success: true }),
    sendDM: vi.fn().mockResolvedValue({ success: true }),
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
  };
}

/**
 * Mock settings service
 */
export function createMockSettingsService(overrides: Partial<any> = {}) {
  return {
    getSettingsForCompany: vi.fn().mockResolvedValue({
      company_id: 'test-company-id',
      incentive_days: 7,
      reminder_offsets_days: [0, 2, 4],
      enable_push: true,
      enable_dm: true,
      ...overrides,
    }),
  };
}

/**
 * Mock logger
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    scheduler: vi.fn(),
  };
}

/**
 * Mock job queue service
 */
export function createMockJobQueue() {
  return {
    enqueueWebhookJob: vi.fn().mockResolvedValue('test-job-id'),
    enqueueReminderJob: vi.fn().mockResolvedValue('test-job-id'),
    init: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock error handler
 */
export function createMockErrorHandler() {
  return {
    wrapAsync: vi.fn().mockImplementation(async (fn: () => Promise<any>) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }),
  };
}

/**
 * Create a complete mock service environment
 */
export function createMockServiceEnvironment(overrides: {
  whopClient?: ReturnType<typeof createMockWhopClient>;
  notificationService?: ReturnType<typeof createMockNotificationService>;
  settingsService?: ReturnType<typeof createMockSettingsService>;
  logger?: ReturnType<typeof createMockLogger>;
  jobQueue?: ReturnType<typeof createMockJobQueue>;
  errorHandler?: ReturnType<typeof createMockErrorHandler>;
} = {}) {
  return {
    whopClient: overrides.whopClient || createMockWhopClient(),
    notificationService: overrides.notificationService || createMockNotificationService(),
    settingsService: overrides.settingsService || createMockSettingsService(),
    logger: overrides.logger || createMockLogger(),
    jobQueue: overrides.jobQueue || createMockJobQueue(),
    errorHandler: overrides.errorHandler || createMockErrorHandler(),
  };
}

