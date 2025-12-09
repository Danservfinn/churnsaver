import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('WhopAuthService strict mode', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_PG_BOSS;
  });

  it('throws when no token is provided (no fallback company)', async () => {
    const { whopAuthService } = await import('@/lib/whop/auth');

    await expect(
      whopAuthService.authenticate({
        headers: { get: () => null }
      })
    ).rejects.toMatchObject({
      statusCode: 401
    });
  });
});

