import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

const {
  mockClientQuery,
  mockTransaction,
  mockSqlExecute,
  mockJobInit,
  mockJobEnqueue,
} = vi.hoisted(() => ({
  mockClientQuery: vi.fn(),
  mockTransaction: vi.fn(),
  mockSqlExecute: vi.fn(),
  mockJobInit: vi.fn(),
  mockJobEnqueue: vi.fn(),
}));

let whopModule: typeof import('@/server/webhooks/whop');

vi.mock('@/lib/env', () => ({
  env: { WHOP_WEBHOOK_SECRET: 'test-secret' },
  additionalEnv: { WEBHOOK_TIMESTAMP_SKEW_SECONDS: 300 },
}));

vi.mock('@/lib/db-rls', () => ({
  initDbWithRLS: vi.fn(),
  sqlWithRLS: {
    transaction: mockTransaction,
    execute: mockSqlExecute,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    webhook: vi.fn(),
  },
}));

vi.mock('@/lib/validation', () => ({
  WebhookPayloadSchema: {},
  validateAndTransform: vi.fn((_schema, data) => ({ success: true, data })),
}));

vi.mock('@/lib/whop-sdk', () => ({
  whopsdk: {},
  getWebhookCompanyContext: vi.fn(() => 'company-1'),
}));

vi.mock('@/server/services/jobQueue', () => ({
  jobQueue: {
    init: mockJobInit,
    enqueueWebhookJob: mockJobEnqueue,
  },
}));

vi.mock('@/lib/whop/dataTransformers', () => ({
  encryptWebhookPayload: vi.fn(async () => 'encrypted'),
  deriveMinimalPayload: vi.fn(() => ({ minimal: true })),
}));

vi.mock('@/lib/whop/sdkConfig', () => ({
  getWhopSdkConfig: vi.fn(() => ({
    appId: 'app_123',
    apiKey: 'key_123',
    webhookSecret: 'test-secret',
  })),
  whopConfig: {
    get: vi.fn(() => ({
      appId: 'app_123',
      apiKey: 'key_123',
      webhookSecret: 'test-secret',
    })),
  },
}));

vi.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    processSecurityEvent: vi.fn(),
  },
}));

describe.skip('Whop webhook handler', () => {
  const payload = {
    id: 'evt_test_1',
    type: 'payment.succeeded',
    data: { membership_id: 'mem_123' },
    created_at: new Date().toISOString(),
  };

  const makeRequest = (options?: { signature?: string; timestamp?: number }) => {
    const body = JSON.stringify(payload);
    const timestamp = options?.timestamp ?? Math.floor(Date.now() / 1000);
    const signature =
      options?.signature ??
      createHmac('sha256', 'test-secret').update(body, 'utf8').digest('hex');

    return new NextRequest('http://localhost/api/webhooks/whop', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'x-whop-signature': signature,
        'x-whop-timestamp': `${timestamp}`,
      }),
      body,
    });
  };

  beforeAll(async () => {
    whopModule = await import('@/server/webhooks/whop');
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockTransaction.mockImplementation(async (callback) => {
      return callback({
        query: mockClientQuery,
      });
    });

    mockClientQuery.mockResolvedValue({ rowCount: 0, rows: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 when event persisted and job enqueued', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // existing check
      .mockResolvedValueOnce({ rowCount: 1 }); // insert
    mockJobEnqueue.mockResolvedValueOnce('job-1');

    const res = await whopModule.handleWhopWebhook(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true });
    expect(mockJobEnqueue).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).toHaveBeenCalledTimes(3);
  });

  it('rejects webhook with invalid signature', async () => {
    const res = await whopModule.handleWhopWebhook(makeRequest({ signature: 'bad-signature' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects webhook with stale timestamp', async () => {
    const stale = Math.floor(Date.now() / 1000) - 1000; // beyond skew
    const res = await whopModule.handleWhopWebhook(makeRequest({ timestamp: stale }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('enforces idempotency for duplicate whop_event_id', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing
      .mockResolvedValueOnce({ rowCount: 1 }); // insert
    mockJobEnqueue.mockResolvedValueOnce('job-1');

    const res1 = await whopModule.handleWhopWebhook(makeRequest());
    expect(res1.status).toBe(200);
    expect(mockJobEnqueue).toHaveBeenCalledTimes(1);

    mockClientQuery
      .mockResolvedValueOnce({}) // advisory lock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'evt_test_1' }] }); // existing found

    const res2 = await whopModule.handleWhopWebhook(makeRequest());
    expect(res2.status).toBe(200);
    expect(mockJobEnqueue).toHaveBeenCalledTimes(1); // no additional enqueue
  });

  it('returns 500 when persistence fails', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing
      .mockRejectedValueOnce(new Error('db failure'));

    const res = await whopModule.handleWhopWebhook(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeDefined();
  });

  it('returns 500 when job enqueue fails', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // advisory lock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no existing
      .mockResolvedValueOnce({ rowCount: 1 });
    mockJobEnqueue.mockRejectedValueOnce(new Error('queue down'));

    const res = await whopModule.handleWhopWebhook(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeDefined();
    expect(mockJobEnqueue).toHaveBeenCalledTimes(1);
  });
  it('rejects when company context cannot be resolved', async () => {
    const { getWebhookCompanyContext } = await import('@/lib/whop-sdk');
    vi.mocked(getWebhookCompanyContext).mockReturnValueOnce(null);

    const res = await whopModule.handleWhopWebhook(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/company context/i);
    expect(mockClientQuery).not.toHaveBeenCalled();

    const { securityMonitor } = await import('@/lib/security-monitoring');
    expect(securityMonitor.processSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook_company_unresolvable',
      })
    );
  });
});

describe.skip('Timestamp Boundary Conditions', () => {
  const body = JSON.stringify({ test: true });
  const computeValidSignature = () =>
    createHmac('sha256', 'test-secret').update(body, 'utf8').digest('hex');
  const SKEW_SECONDS = 300;

  it.each([
    { offsetSeconds: SKEW_SECONDS - 1, expected: true, label: 'just within window' },
    { offsetSeconds: SKEW_SECONDS, expected: true, label: 'exactly at boundary' },
    { offsetSeconds: SKEW_SECONDS + 1, expected: false, label: 'just outside window' },
    { offsetSeconds: -SKEW_SECONDS + 1, expected: true, label: 'future just within window' },
    { offsetSeconds: -SKEW_SECONDS - 1, expected: false, label: 'future outside window' },
  ])('should be $label (offset: $offsetSeconds)', ({ offsetSeconds, expected }) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timestamp = String(nowSeconds - offsetSeconds);

    const result = whopModule.verifyWebhookSignature(
      body,
      computeValidSignature(),
      'test-secret',
      timestamp
    );

    expect(result).toBe(expected);
  });
});

