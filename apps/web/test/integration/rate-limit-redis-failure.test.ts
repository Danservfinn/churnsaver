import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/lib/db', () => ({
  sql: {
    execute: (...args: any[]) => mockExecute(...args),
    select: (...args: any[]) => mockSelect(...args)
  }
}));

describe('Rate limit Redis failure handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mockExecute.mockReset();
    mockSelect.mockReset();
    process.env.REDIS_URL = '';
    process.env.NODE_ENV = 'test';
  });

  it('uses Postgres rate limiting when Redis is unavailable', async () => {
    mockExecute.mockResolvedValue({ rowCount: 1 });
    mockSelect.mockResolvedValue([]);

    const { checkRateLimit } = await import('@/lib/rateLimit');

    const result = await checkRateLimit('id:test', { windowMs: 1000, maxRequests: 5, keyPrefix: 'test' });

    expect(result.allowed).toBe(true);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('fails closed in production when both Redis and Postgres paths fail', async () => {
    process.env.NODE_ENV = 'production';
    mockExecute.mockRejectedValue(new Error('pg down'));
    mockSelect.mockRejectedValue(new Error('pg down'));

    const { checkRateLimit } = await import('@/lib/rateLimit');

    const result = await checkRateLimit('id:test', { windowMs: 1000, maxRequests: 5, keyPrefix: 'test' });

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});

