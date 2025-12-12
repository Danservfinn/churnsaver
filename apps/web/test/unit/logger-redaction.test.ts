import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger log drain redaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('sends only redacted data to the log drain', async () => {
    const sendToLogDrain = vi.fn();
    vi.doMock('@/lib/log-drain', () => ({ sendToLogDrain }));

    const { logger } = await import('@/lib/logger');

    logger.info('testing redaction', {
      token: 'secret-token',
      authorization: 'Bearer very-secret',
      payload: { nested: { token: 'inner-secret' } },
      body: { password: 'super-secret', authorization: 'Bearer hidden' },
      safe: 'value-ok',
    });

    expect(sendToLogDrain).toHaveBeenCalledTimes(1);
    const payload = sendToLogDrain.mock.calls[0][0] as Record<string, unknown>;
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('very-secret');
    expect(serialized).not.toContain('inner-secret');
    expect(serialized).not.toContain('super-secret');
    expect(payload.payload).toBe('[REDACTED]');
    expect(payload.body).toBe('[REDACTED]');
    expect(payload.safe).toBe('value-ok');
  });
});

