import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
const mockSelect = vi.fn();
const mockInitDb = vi.fn();
const mockInitDbWithRLS = vi.fn();
const mockProcessUnprocessedEvents = vi.fn();

vi.mock('@/lib/db', () => ({
  initDb: (...args: unknown[]) => mockInitDb(...args),
  sql: {
    query: (...args: unknown[]) => mockQuery(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('@/lib/db-rls', () => ({
  initDbWithRLS: (...args: unknown[]) => mockInitDbWithRLS(...args),
}));

vi.mock('@/server/services/eventProcessor', () => ({
  processUnprocessedEvents: (...args: unknown[]) => mockProcessUnprocessedEvents(...args),
}));

// Import after mocks are set up
import { GET } from '@/app/api/cron/process-queue/route';

function makeRequest(headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/cron/process-queue', {
    headers,
  });
}

describe('/api/cron/process-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
  });

  it('returns 401 when unauthorized', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 202 when lock is not acquired', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: false }], rowCount: 1 });

    const res = await GET(makeRequest({ authorization: 'Bearer secret' }));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe('skipped_lock');
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the lock attempt
  });

  it('processes companies and returns metrics when lock is acquired', async () => {
    // Acquire lock
    mockQuery.mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }], rowCount: 1 });
    // Release lock
    mockQuery.mockResolvedValueOnce({ rows: [{ pg_advisory_unlock: true }], rowCount: 1 });

    // Companies to process
    mockSelect
      .mockResolvedValueOnce([{ company_id: 'co_1', oldest: new Date().toISOString() }]) // fetchCompaniesWithPendingEvents
      .mockResolvedValueOnce([{ oldest: new Date().toISOString() }]); // fetchOldestPendingTimestamp

    mockProcessUnprocessedEvents.mockResolvedValue({
      processed: 2,
      successful: 2,
      failed: 0,
    });

    const res = await GET(makeRequest({ authorization: 'Bearer secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.lockAcquired).toBe(true);
    expect(body.processedCompanies).toBe(1);
    expect(body.processedEvents).toBe(2);
    expect(mockProcessUnprocessedEvents).toHaveBeenCalledWith('co_1');
    expect(mockQuery).toHaveBeenCalledTimes(2); // lock + unlock
  });
});


