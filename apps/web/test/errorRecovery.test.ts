import { getSuggestedActions, getRecoveryActions, ACTIONS_BY_CATEGORY } from '../src/lib/errorCategorization';
import { ErrorCategory } from '../src/lib/apiResponse';
import { CategorizedError } from '../src/lib/errorCategorization';

// Test framework following the pattern from existing tests
const test = (name: string, fn: () => void) => {
  console.log(`🧪 ${name}`);
  try {
    fn();
    console.log(`✅ ${name} - PASSED`);
  } catch (error) {
    console.log(`❌ ${name} - FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

const describe = (name: string, fn: () => void) => {
  console.log(`\n📋 ${name}`);
  fn();
};

const it = test;
const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toEqual: (expected: any) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
  },
  toContain: (item: any) => {
    if (!Array.isArray(actual) || !actual.includes(item)) {
      throw new Error(`Expected array to contain ${item}`);
    }
  },
  toBeGreaterThan: (expected: number) => {
    if (!(actual > expected)) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toHaveLength: (expected: number) => {
    if (!Array.isArray(actual) || actual.length !== expected) {
      throw new Error(`Expected array to have length ${expected}, but got ${actual.length}`);
    }
  }
});

// Helper function to create a test CategorizedError
function createTestCategorizedError(category: ErrorCategory): CategorizedError {
  return {
    originalError: new Error('Test error'),
    categorizedError: {
      message: 'Test error',
      code: 'INTERNAL_SERVER_ERROR',
      category,
      severity: 'MEDIUM',
      statusCode: 500,
      retryable: false,
      name: 'AppError',
      toJSON: () => ({
        error: 'Test error',
        code: 'INTERNAL_SERVER_ERROR',
        category,
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
        requestId: 'test-request-id',
        retryable: false
      })
    },
    context: {},
    detectedPatterns: [],
    suggestedActions: [],
    monitoringData: {}
  };
}

describe('ACTIONS_BY_CATEGORY Usage', () => {
  describe('getSuggestedActions()', () => {
    it('should return suggested actions for DATABASE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check database connection');
      expect(actions).toContain('Verify database credentials');
      expect(actions).toContain('Monitor database performance');
      expect(actions).toContain('Check for deadlocks or connection pool exhaustion');
    });

    it('should return suggested actions for NETWORK category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.NETWORK);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check network connectivity');
      expect(actions).toContain('Verify external service availability');
      expect(actions).toContain('Implement retry logic with exponential backoff');
      expect(actions).toContain('Consider circuit breaker pattern');
    });

    it('should return suggested actions for AUTHENTICATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.AUTHENTICATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Verify authentication token');
      expect(actions).toContain('Check token expiration');
      expect(actions).toContain('Review authentication configuration');
      expect(actions).toContain('Monitor for brute force attempts');
    });

    it('should return suggested actions for AUTHORIZATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.AUTHORIZATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Verify user permissions');
      expect(actions).toContain('Check role-based access control');
      expect(actions).toContain('Review authorization policies');
      expect(actions).toContain('Audit access logs');
    });

    it('should return suggested actions for VALIDATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.VALIDATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Review input validation rules');
      expect(actions).toContain('Check request format');
      expect(actions).toContain('Validate required fields');
      expect(actions).toContain('Update API documentation');
    });

    it('should return suggested actions for RATE_LIMIT category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.RATE_LIMIT);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Implement rate limiting headers');
      expect(actions).toContain('Add retry-after logic');
      expect(actions).toContain('Monitor usage patterns');
      expect(actions).toContain('Consider rate limit adjustments');
    });

    it('should return suggested actions for EXTERNAL_SERVICE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.EXTERNAL_SERVICE);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check external service status');
      expect(actions).toContain('Verify API credentials');
      expect(actions).toContain('Implement fallback mechanisms');
      expect(actions).toContain('Monitor service level agreements');
    });

    it('should return suggested actions for SECURITY category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.SECURITY);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Immediate security review required');
      expect(actions).toContain('Check for suspicious activity patterns');
      expect(actions).toContain('Review access logs');
      expect(actions).toContain('Consider temporary IP blocking');
    });

    it('should return suggested actions for SYSTEM category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.SYSTEM);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(3);
      expect(actions).toContain('Investigate error details');
      expect(actions).toContain('Check system logs');
      expect(actions).toContain('Monitor for recurrence');
      expect(actions).toContain('Escalate if persistent');
    });

    it('should return suggested actions for UNKNOWN category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.UNKNOWN);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(3);
      expect(actions).toContain('Investigate error details');
      expect(actions).toContain('Check system logs');
      expect(actions).toContain('Monitor for recurrence');
      expect(actions).toContain('Escalate if persistent');
    });

    it('should return suggested actions for BUSINESS_LOGIC category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.BUSINESS_LOGIC);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Review business logic rules');
      expect(actions).toContain('Check input data validation');
      expect(actions).toContain('Verify business requirements');
      expect(actions).toContain('Update business logic documentation');
    });

    it('should filter out recovery actions and return only suggested actions', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getSuggestedActions(categorizedError);

      // Should not contain recovery actions (those with 'action' property)
      expect(actions).not.toContain('check_database_connection');
      expect(actions).not.toContain('restart_connection_pool');
    });
  });

  describe('getRecoveryActions()', () => {
    it('should return recovery actions for DATABASE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('check_database_connection');
      expect(actions[0].description).toBe('Verify database connectivity and credentials');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');
      expect(actions[0].estimatedTime).toBe('30s');

      expect(actions[1].action).toBe('restart_connection_pool');
      expect(actions[1].description).toBe('Restart database connection pool if needed');
      expect(actions[1].automated).toBe(true);
      expect(actions[1].priority).toBe('medium');
      expect(actions[1].estimatedTime).toBe('10s');
    });

    it('should return recovery actions for NETWORK category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.NETWORK);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('retry_with_backoff');
      expect(actions[0].description).toBe('Retry the operation with exponential backoff');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');
      expect(actions[0].estimatedTime).toBe('1-5s');

      expect(actions[1].action).toBe('check_service_health');
      expect(actions[1].description).toBe('Verify external service health status');
      expect(actions[1].automated).toBe(true);
      expect(actions[1].priority).toBe('medium');
      expect(actions[1].estimatedTime).toBe('5s');
    });

    it('should return recovery actions for RATE_LIMIT category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.RATE_LIMIT);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('wait_retry_after');
      expect(actions[0].description).toBe('Wait for the specified retry-after duration');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');

      expect(actions[1].action).toBe('reduce_request_rate');
      expect(actions[1].description).toBe('Implement client-side rate limiting');
      expect(actions[1].automated).toBe(false);
      expect(actions[1].priority).toBe('medium');
    });

    it('should return recovery actions for EXTERNAL_SERVICE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.EXTERNAL_SERVICE);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('enable_fallback');
      expect(actions[0].description).toBe('Switch to fallback service or cached data');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');

      expect(actions[1].action).toBe('check_service_status');
      expect(actions[1].description).toBe('Verify external service status page');
      expect(actions[1].automated).toBe(false);
      expect(actions[1].priority).toBe('medium');
    });

    it('should return empty array for categories without recovery actions', () => {
      const categoriesWithoutRecovery = [
        ErrorCategory.AUTHENTICATION,
        ErrorCategory.AUTHORIZATION,
        ErrorCategory.VALIDATION,
        ErrorCategory.SECURITY,
        ErrorCategory.SYSTEM,
        ErrorCategory.UNKNOWN,
        ErrorCategory.BUSINESS_LOGIC
      ];

      categoriesWithoutRecovery.forEach(category => {
        const categorizedError = createTestCategorizedError(category);
        const actions = getRecoveryActions(categorizedError);
        expect(actions).toHaveLength(0);
      });
    });

    it('should filter out suggested actions and return only recovery actions', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getRecoveryActions(categorizedError);

      // Should not contain suggested actions (those without 'action' property)
      actions.forEach(action => {
        expect(action.action).toBeDefined();
        expect(typeof action.action).toBe('string');
        expect(action.description).toBeDefined();
        expect(typeof action.automated).toBe('boolean');
        expect(['low', 'medium', 'high', 'critical']).toContain(action.priority);
      });
    });
  });

  describe('ACTIONS_BY_CATEGORY structure validation', () => {
    it('should have all error categories defined', () => {
      const expectedCategories = Object.values(ErrorCategory);
      const actualCategories = Object.keys(ACTIONS_BY_CATEGORY);

      expectedCategories.forEach(category => {
        expect(actualCategories).toContain(category);
      });
    });

    it('should have actions array for each category', () => {
      Object.values(ACTIONS_BY_CATEGORY).forEach(actions => {
        expect(Array.isArray(actions)).toBe(true);
        expect(actions.length).toBeGreaterThan(0);
      });
    });

    it('should have valid action structure for each action', () => {
      Object.values(ACTIONS_BY_CATEGORY).forEach(actions => {
        actions.forEach(action => {
          expect(action.description).toBeDefined();
          expect(typeof action.description).toBe('string');
          expect(action.automated).toBeDefined();
          expect(typeof action.automated).toBe('boolean');
          expect(action.priority).toBeDefined();
          expect(['low', 'medium', 'high', 'critical']).toContain(action.priority);
        });
      });
    });

    it('should have recovery actions with action property', () => {
      // Check DATABASE category which has recovery actions
      const dbActions = ACTIONS_BY_CATEGORY[ErrorCategory.DATABASE];
      const recoveryActions = dbActions.filter(action => action.action);

      expect(recoveryActions.length).toBeGreaterThan(0);
      recoveryActions.forEach(action => {
        expect(action.action).toBeDefined();
        expect(typeof action.action).toBe('string');
        expect(action.estimatedTime).toBeDefined();
      });
    });

    it('should have suggested actions without action property', () => {
      // Check DATABASE category which has suggested actions
      const dbActions = ACTIONS_BY_CATEGORY[ErrorCategory.DATABASE];
      const suggestedActions = dbActions.filter(action => !action.action);

      expect(suggestedActions.length).toBeGreaterThan(0);
      suggestedActions.forEach(action => {
        expect(action.action).toBeUndefined();
      });
    });
  });
});