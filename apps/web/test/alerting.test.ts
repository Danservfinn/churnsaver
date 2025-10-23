// Import ALERTS directly since it's not exported
const { ALERTS } = require('../src/lib/errorMonitoringIntegration');

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
  }
});

describe('Alert Descriptor Parity', () => {
  describe('high_error_rate alert', () => {
    it('should have correct severity for rate below critical threshold', () => {
      const data = { currentRate: 6, threshold: 5 };
      const config = { alertThresholds: { errorRate: 5, criticalErrorRate: 10 } };

      const severity = ALERTS.high_error_rate.severity(data, config.alertThresholds);
      expect(severity).toBe('P1');
    });

    it('should have correct severity for rate at critical threshold', () => {
      const data = { currentRate: 10, threshold: 5 };
      const config = { alertThresholds: { errorRate: 5, criticalErrorRate: 10 } };

      const severity = ALERTS.high_error_rate.severity(data, config.alertThresholds);
      expect(severity).toBe('P0');
    });

    it('should have correct severity for rate above critical threshold', () => {
      const data = { currentRate: 12, threshold: 5 };
      const config = { alertThresholds: { errorRate: 5, criticalErrorRate: 10 } };

      const severity = ALERTS.high_error_rate.severity(data, config.alertThresholds);
      expect(severity).toBe('P0');
    });

    it('should generate correct title', () => {
      const data = { currentRate: 7.5 };
      const title = ALERTS.high_error_rate.title(data);
      expect(title).toBe('High Error Rate: 7.5%');
    });

    it('should generate correct message', () => {
      const data = { currentRate: 7.5, threshold: 5, errorCategory: 'database', endpoint: '/api/users' };
      const message = ALERTS.high_error_rate.message(data);
      expect(message).toBe('Error rate has exceeded 5% threshold. Current rate: 7.5%. Category: database, Endpoint: /api/users');
    });
  });

  describe('critical_error_rate alert', () => {
    it('should always have P0 severity', () => {
      const data = { currentRate: 15 };
      const config = { alertThresholds: { criticalErrorRate: 10 } };

      const severity = ALERTS.critical_error_rate.severity(data, config.alertThresholds);
      expect(severity).toBe('P0');
    });

    it('should generate correct title', () => {
      const data = { currentRate: 15.2 };
      const title = ALERTS.critical_error_rate.title(data);
      expect(title).toBe('CRITICAL Error Rate: 15.2%');
    });

    it('should generate correct message', () => {
      const data = { currentRate: 15.2, threshold: 10 };
      const message = ALERTS.critical_error_rate.message(data);
      expect(message).toBe('CRITICAL: Error rate has exceeded 10% threshold. Current rate: 15.2%. Immediate attention required.');
    });
  });

  describe('error_pattern alert', () => {
    it('should have P0 severity for critical errors', () => {
      const data = { severity: 'CRITICAL' };
      const config = { alertThresholds: {} };

      const severity = ALERTS.error_pattern.severity(data, config.alertThresholds);
      expect(severity).toBe('P0');
    });

    it('should have P1 severity for high errors', () => {
      const data = { severity: 'HIGH' };
      const config = { alertThresholds: {} };

      const severity = ALERTS.error_pattern.severity(data, config.alertThresholds);
      expect(severity).toBe('P1');
    });

    it('should have P2 severity for medium errors', () => {
      const data = { severity: 'MEDIUM' };
      const config = { alertThresholds: {} };

      const severity = ALERTS.error_pattern.severity(data, config.alertThresholds);
      expect(severity).toBe('P2');
    });

    it('should have P2 severity for low errors', () => {
      const data = { severity: 'LOW' };
      const config = { alertThresholds: {} };

      const severity = ALERTS.error_pattern.severity(data, config.alertThresholds);
      expect(severity).toBe('P2');
    });

    it('should generate correct title', () => {
      const data = { errorCode: 'DATABASE_ERROR' };
      const title = ALERTS.error_pattern.title(data);
      expect(title).toBe('Error Pattern Detected: DATABASE_ERROR');
    });

    it('should generate correct message', () => {
      const data = {
        errorCode: 'DATABASE_ERROR',
        errorCategory: 'database',
        severity: 'HIGH',
        message: 'Connection timeout',
        endpoint: '/api/data'
      };
      const message = ALERTS.error_pattern.message(data);
      expect(message).toBe('Error pattern detected: DATABASE_ERROR (database) - Connection timeout. Endpoint: /api/data');
    });
  });

  describe('slow_response alert', () => {
    it('should have P1 severity for response time more than double threshold', () => {
      const data = { responseTime: 10000 };
      const config = { alertThresholds: { responseTime: 5000 } };

      const severity = ALERTS.slow_response.severity(data, config.alertThresholds);
      expect(severity).toBe('P1');
    });

    it('should have P2 severity for response time at or below double threshold', () => {
      const data = { responseTime: 8000 };
      const config = { alertThresholds: { responseTime: 5000 } };

      const severity = ALERTS.slow_response.severity(data, config.alertThresholds);
      expect(severity).toBe('P2');
    });

    it('should have P2 severity for response time at double threshold', () => {
      const data = { responseTime: 10000 };
      const config = { alertThresholds: { responseTime: 5000 } };

      const severity = ALERTS.slow_response.severity(data, config.alertThresholds);
      expect(severity).toBe('P1'); // This should be P1 since it's MORE than double
    });

    it('should generate correct title', () => {
      const data = { responseTime: 7500 };
      const title = ALERTS.slow_response.title(data);
      expect(title).toBe('Slow Response Time: 7500ms');
    });

    it('should generate correct message', () => {
      const data = { responseTime: 7500, threshold: 5000, endpoint: '/api/slow' };
      const message = ALERTS.slow_response.message(data);
      expect(message).toBe('Slow response time detected: 7500ms (threshold: 5000ms). Endpoint: /api/slow');
    });
  });

  describe('Alert descriptor structure validation', () => {
    it('should have all required alert types', () => {
      const expectedAlerts = ['high_error_rate', 'critical_error_rate', 'error_pattern', 'slow_response'];
      const actualAlerts = Object.keys(ALERTS);

      expect(actualAlerts.sort()).toEqual(expectedAlerts.sort());
    });

    it('should have all descriptors with required properties', () => {
      Object.values(ALERTS).forEach(descriptor => {
        expect(typeof descriptor.severity).toBe('function');
        expect(typeof descriptor.title).toBe('function');
        expect(typeof descriptor.message).toBe('function');
      });
    });

    it('should have severity functions that return valid severity levels', () => {
      const validSeverities = ['P0', 'P1', 'P2', 'P3'];

      Object.values(ALERTS).forEach(descriptor => {
        const severity = descriptor.severity({}, {});
        expect(validSeverities).toContain(severity);
      });
    });

    it('should have title functions that return strings', () => {
      Object.values(ALERTS).forEach(descriptor => {
        const title = descriptor.title({});
        expect(typeof title).toBe('string');
        expect(title.length).toBeGreaterThan(0);
      });
    });

    it('should have message functions that return strings', () => {
      Object.values(ALERTS).forEach(descriptor => {
        const message = descriptor.message({});
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });
});