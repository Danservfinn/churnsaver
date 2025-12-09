import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateTimestamp } from '@/lib/whop/webhookValidator';
import * as envModule from '@/lib/env';

describe('Webhook timestamp replay protection', () => {
  beforeEach(() => {
    vi.spyOn(envModule, 'isProductionLikeEnvironment').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects timestamps older than the allowed skew window', () => {
    const toleranceSeconds = 60;
    const oldTimestamp = Math.floor(Date.now() / 1000) - (toleranceSeconds + 300);

    const result = validateTimestamp(oldTimestamp.toString(), toleranceSeconds);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed window');
  });
});

