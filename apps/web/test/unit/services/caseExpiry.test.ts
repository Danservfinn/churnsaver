import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expireOldCases } from '@/server/services/caseExpiry';
import { sqlWithRLS } from '@/lib/db-rls';

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('expireOldCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-31T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks open cases older than window as expired', async () => {
    vi.mocked(sqlWithRLS.execute).mockResolvedValueOnce({ rowCount: 3 });

    const updated = await expireOldCases('company_test', 30);

    expect(updated).toBe(3);
    expect(sqlWithRLS.execute).toHaveBeenCalledTimes(1);

    const [, params] = vi.mocked(sqlWithRLS.execute).mock.calls[0];
    const cutoff: Date = params[1] as Date;
    const daysDiff = Math.round(
      (new Date('2024-01-31T00:00:00.000Z').getTime() - cutoff.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    expect(daysDiff).toBe(30);
  });
});

