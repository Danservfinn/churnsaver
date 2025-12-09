import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPrefetch, hashIp } from '@/app/api/r/[token]/route';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'test-secret-key-32-bytes-long-123456',
  },
  additionalEnv: {},
}));

describe('Recovery redirect helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats explicit prefetch hints as prefetch', () => {
    const mockRequest = {
      headers: new Map([
        ['purpose', 'prefetch'],
        ['sec-fetch-purpose', 'prefetch'],
        ['sec-fetch-mode', 'prefetch'],
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(isPrefetch(mockRequest)).toBe(true);
  });

  it('does not mark normal navigate requests as prefetch', () => {
    const mockRequest = {
      headers: new Map([
        ['sec-fetch-mode', 'navigate'],
        ['sec-fetch-purpose', 'navigate'],
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(isPrefetch(mockRequest)).toBe(false);
  });

  it('returns a salted, truncated hash for an IP', () => {
    const hash = hashIp('203.0.113.42');
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(32); // 16 bytes hex
  });

  it('returns null when IP is missing', () => {
    expect(hashIp(null)).toBeNull();
  });

  it('produces different hashes for different IPs', () => {
    const h1 = hashIp('203.0.113.42');
    const h2 = hashIp('198.51.100.10');
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1).not.toBe(h2);
  });
});

