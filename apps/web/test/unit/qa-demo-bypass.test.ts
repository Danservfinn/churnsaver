import { describe, expect, it, afterEach } from 'vitest';
import { isQaDemoBypassEnabled } from '@/lib/qaDemo';

const originalEnv = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
};

describe('QA demo bypass toggles', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('enables bypass when env flag is set in non-production', () => {
    process.env.QA_DEMO_BYPASS = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;

    expect(isQaDemoBypassEnabled()).toBe(true);
  });

  it('enables bypass when query param is provided', () => {
    process.env.NODE_ENV = 'test';
    const result = isQaDemoBypassEnabled({ url: 'https://example.com/api?qa_demo=1' });

    expect(result).toBe(true);
  });

  it('disables bypass in production even when flag is set', () => {
    process.env.QA_DEMO_BYPASS = 'true';
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';

    expect(isQaDemoBypassEnabled()).toBe(false);
  });
});





