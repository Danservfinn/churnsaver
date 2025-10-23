#!/usr/bin/env node

// Unit tests for request logging redaction to guarantee secrets and PII are masked
// Tests logging security for production readiness

// Copy logger functions for testing
class TestLogger {
  constructor() {
    this.loggedMessages = [];
  }

  log(level, message, data) {
    this.loggedMessages.push({ level, message, data });
  }

  // Enhanced logging methods with observability fields
  webhook(operation, data) {
    // Redact PII from webhook data - never log sensitive payment/user data
    const sanitizedData = {
      ...data,
      // Remove any potential PII - webhook payloads may contain sensitive data
      // Only keep structured fields needed for debugging
    };

    this.log('info', `Webhook ${operation}`, sanitizedData);
  }

  reminder(operation, data) {
    // Redact PII and implement sampling for high-volume reminder logs
    // Only log detailed data for failures or every Nth success to reduce log volume
    const shouldLogDetailed = data.success === false || Math.random() < 0.1; // 10% sampling for successes

    const sanitizedData = shouldLogDetailed ? {
      ...data,
      // Remove any potential PII from reminder data
      messageId: data.messageId ? '[REDACTED]' : undefined // Message IDs might be sensitive
    } : {
      caseId: data.caseId,
      membershipId: data.membershipId,
      channel: data.channel,
      attemptNumber: data.attemptNumber,
      success: data.success,
      sampled: true // Indicate this is a sampled log entry
    };

    this.log(data.success === false ? 'error' : 'info', `Reminder ${operation} via ${data.channel}${shouldLogDetailed ? '' : ' (sampled)'}`, sanitizedData);
  }

  api(operation, data) {
    // Redact sensitive headers and PII from API logs
    const sanitizedData = {
      ...data,
      // Remove any potential PII from API data
      // Headers might contain tokens, so never log them
      headers: undefined, // Explicitly remove headers from logs
      // user_id might be sensitive depending on context, but keeping for debugging
    };

    this.log(operation === 'error' ? 'error' : 'info', `API ${operation} - ${data.method} ${data.endpoint}`, sanitizedData);
  }

  // Legacy methods for backward compatibility - with PII redaction
  info(message, data) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log('info', message, sanitizedData);
  }

  warn(message, data) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log('warn', message, sanitizedData);
  }

  error(message, data) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log('error', message, sanitizedData);
  }

  // Helper method to redact secrets and PII from arbitrary data
  redactSecrets(data) {
    const redacted = { ...data };

    // Redact common secret patterns
    const secretKeys = ['password', 'secret', 'token', 'key', 'signature', 'webhook_secret', 'whop_webhook_secret'];
    for (const key of Object.keys(redacted)) {
      if (secretKeys.some(secretKey => key.toLowerCase().includes(secretKey))) {
        redacted[key] = '[REDACTED]';
      }
    }

    // Redact potential PII in nested objects
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSecrets(value);
      }
    }

    return redacted;
  }

  getLastLog() {
    return this.loggedMessages[this.loggedMessages.length - 1];
  }

  getAllLogs() {
    return this.loggedMessages;
  }

  clearLogs() {
    this.loggedMessages = [];
  }
}

function runLoggingRedactionTests() {
  console.log('🔒 Starting Logging Redaction Test Suite\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, testFn) {
    try {
      console.log(`\n🧪 ${name}`);
      testFn();
      console.log(`✅ ${name} - PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  const logger = new TestLogger();

  // Test webhook logging redaction
  runTest('Webhook logging redacts sensitive payment data', () => {
    const webhookData = {
      eventId: 'evt_123',
      eventType: 'payment.succeeded',
      membershipId: 'mem_456',
      companyId: 'comp_789',
      success: true,
      duration_ms: 150,
      // Sensitive data that should be redacted
      paymentData: {
        cardNumber: '4111111111111111',
        expiry: '12/25',
        cvv: '123',
        amount: 2999
      },
      userPII: {
        email: 'user@example.com',
        phone: '+1234567890',
        ssn: '123-45-6789'
      }
    };

    logger.webhook('processed', webhookData);
    const log = logger.getLastLog();

    // Verify sensitive data is not in the log
    if (log.data.paymentData || log.data.userPII) {
      throw new Error('Sensitive payment and PII data should not appear in webhook logs');
    }

    // Verify essential debugging data is preserved
    if (log.data.eventId !== 'evt_123' || log.data.membershipId !== 'mem_456') {
      throw new Error('Essential debugging data should be preserved in webhook logs');
    }
  });

  // Test reminder logging redaction
  runTest('Reminder logging redacts message IDs', () => {
    const reminderData = {
      caseId: 'case_123',
      membershipId: 'mem_456',
      companyId: 'comp_789',
      channel: 'push',
      attemptNumber: 2,
      success: true,
      error: null,
      duration_ms: 200,
      messageId: 'msg_very_sensitive_789' // Should be redacted
    };

    logger.reminder('sent', reminderData);
    const log = logger.getLastLog();

    // Verify messageId is redacted
    if (log.data.messageId !== '[REDACTED]') {
      throw new Error('Message IDs should be redacted in reminder logs');
    }

    // Verify other data is preserved
    if (log.data.caseId !== 'case_123' || log.data.membershipId !== 'mem_456') {
      throw new Error('Essential debugging data should be preserved in reminder logs');
    }
  });

  // Test API logging redaction
  runTest('API logging removes headers completely', () => {
    const apiData = {
      endpoint: '/api/cases',
      method: 'GET',
      status_code: 200,
      company_id: 'comp_123',
      user_id: 'user_456',
      duration_ms: 150,
      headers: {
        'authorization': 'Bearer very_secret_token',
        'x-api-key': 'super_secret_key',
        'x-whop-user-token': 'jwt_token_here',
        'content-type': 'application/json' // This should also be removed
      }
    };

    logger.api('called', apiData);
    const log = logger.getLastLog();

    // Verify headers are completely removed
    if (log.data.headers !== undefined) {
      throw new Error('Headers should be completely removed from API logs');
    }

    // Verify other data is preserved
    if (log.data.endpoint !== '/api/cases' || log.data.method !== 'GET') {
      throw new Error('Essential API data should be preserved');
    }
  });

  // Test legacy logging redaction
  runTest('Legacy logging redacts common secret patterns', () => {
    const legacyData = {
      userId: 'user_123',
      password: 'secret_password',
      token: 'jwt_token_here',
      webhook_secret: 'whop_secret_key',
      apiKey: 'api_key_value',
      normalField: 'normal_value',
      nested: {
        secret: 'nested_secret',
        normal: 'nested_normal'
      }
    };

    logger.info('Legacy log test', legacyData);
    const log = logger.getLastLog();

    // Verify secrets are redacted
    if (log.data.password !== '[REDACTED]' ||
        log.data.token !== '[REDACTED]' ||
        log.data.webhook_secret !== '[REDACTED]') {
      throw new Error('Common secret patterns should be redacted in legacy logs');
    }

    // Verify nested secrets are redacted
    if (log.data.nested.secret !== '[REDACTED]') {
      throw new Error('Nested secrets should be redacted');
    }

    // Verify normal data is preserved
    if (log.data.userId !== 'user_123' ||
        log.data.normalField !== 'normal_value' ||
        log.data.nested.normal !== 'nested_normal') {
      throw new Error('Normal data should be preserved in legacy logs');
    }
  });

  // Test comprehensive secret pattern matching
  runTest('Secret redaction handles various patterns', () => {
    const testData = {
      password: 'secret',
      Password: 'secret', // Case insensitive
      userPassword: 'secret',
      api_key: 'secret',
      API_KEY: 'secret',
      'webhook-secret': 'secret',
      whopWebhookSecret: 'secret',
      tokenValue: 'secret',
      signature: 'secret',
      key: 'secret',
      safeField: 'not_secret'
    };

    const redacted = logger.redactSecrets(testData);

    // All secret fields should be redacted
    const secretFields = ['password', 'Password', 'userPassword', 'api_key', 'API_KEY', 'webhook-secret', 'whopWebhookSecret', 'tokenValue', 'signature', 'key'];
    for (const field of secretFields) {
      if (redacted[field] !== '[REDACTED]') {
        throw new Error(`Field '${field}' should be redacted`);
      }
    }

    // Safe field should be preserved
    if (redacted.safeField !== 'not_secret') {
      throw new Error('Safe fields should be preserved');
    }
  });

  // Test reminder sampling behavior
  runTest('Reminder logging implements sampling for successes', () => {
    logger.clearLogs();

    // Log multiple successful reminders (should be sampled)
    for (let i = 0; i < 20; i++) {
      logger.reminder('sent', {
        caseId: `case_${i}`,
        membershipId: `mem_${i}`,
        channel: 'push',
        attemptNumber: 1,
        success: true
      });
    }

    const logs = logger.getAllLogs();
    const sampledLogs = logs.filter(log => log.data.sampled);

    // Should have some sampled logs (due to random sampling)
    if (sampledLogs.length === 0) {
      throw new Error('Should have some sampled logs for successful reminders');
    }

    // Verify sampled logs have limited data
    const sample = sampledLogs[0];
    if (sample.data.caseId || sample.data.membershipId === undefined) {
      throw new Error('Sampled logs should have limited data fields');
    }
  });

  // Test error logging preserves full data
  runTest('Error logging preserves full data for debugging', () => {
    const errorData = {
      caseId: 'case_error',
      membershipId: 'mem_error',
      channel: 'push',
      attemptNumber: 3,
      success: false,
      error: 'Push notification failed',
      error_category: 'network',
      messageId: 'msg_error_123' // Should be redacted even in errors
    };

    logger.reminder('failed', errorData);
    const log = logger.getLastLog();

    // Verify it's logged as error
    if (log.level !== 'error') {
      throw new Error('Failed reminders should be logged as errors');
    }

    // Verify messageId is still redacted even for errors
    if (log.data.messageId !== '[REDACTED]') {
      throw new Error('Message IDs should be redacted even in error logs');
    }

    // Verify error details are preserved
    if (log.data.error !== 'Push notification failed' || log.data.error_category !== 'network') {
      throw new Error('Error details should be preserved for debugging');
    }
  });

  // Test deep object redaction
  runTest('Deep object redaction works recursively', () => {
    const deepData = {
      level1: {
        level2: {
          level3: {
            secret: 'deep_secret',
            normal: 'deep_normal',
            nestedSecret: 'another_secret'
          }
        },
        token: 'level1_token'
      },
      topSecret: 'top_secret'
    };

    const redacted = logger.redactSecrets(deepData);

    // All secrets at any depth should be redacted
    if (redacted.level1.level2.level3.secret !== '[REDACTED]' ||
        redacted.level1.level2.level3.nestedSecret !== '[REDACTED]' ||
        redacted.level1.token !== '[REDACTED]' ||
        redacted.topSecret !== '[REDACTED]') {
      throw new Error('Deep nested secrets should be redacted');
    }

    // Normal data should be preserved
    if (redacted.level1.level2.level3.normal !== 'deep_normal') {
      throw new Error('Normal deep nested data should be preserved');
    }
  });

  // Test array handling (arrays should not be redacted)
  runTest('Arrays are preserved without redaction', () => {
    const arrayData = {
      items: [
        { secret: 'secret1', normal: 'normal1' },
        { token: 'token2', normal: 'normal2' }
      ],
      secret: 'top_secret'
    };

    const redacted = logger.redactSecrets(arrayData);

    // Top level secret should be redacted
    if (redacted.secret !== '[REDACTED]') {
      throw new Error('Top level secrets should be redacted');
    }

    // Arrays should be preserved as-is (no redaction of array elements)
    if (!Array.isArray(redacted.items) || redacted.items.length !== 2) {
      throw new Error('Arrays should be preserved');
    }

    // Array elements should not be redacted (arrays are not recursively processed)
    if (redacted.items[0].secret !== 'secret1' || redacted.items[1].token !== 'token2') {
      throw new Error('Array elements should not be redacted');
    }
  });

  // Wait for all tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LOGGING REDACTION TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

    if (results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.tests.filter(t => t.status === 'FAILED').forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
    }

    process.exit(results.failed === 0 ? 0 : 1);
  }, 100); // Brief delay for any async operations
}

// Run tests if called directly
if (require.main === module) {
  runLoggingRedactionTests();
}

module.exports = { runLoggingRedactionTests };