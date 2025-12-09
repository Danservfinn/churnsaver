import { describe, it, expect } from 'vitest';
import { buildEventLockKey } from '@/server/services/shared/advisoryLock';

// Ensures advisory locks are scoped by (companyId, eventId)
describe('Advisory Lock Cross-Tenant', () => {
  it('uses different keys for different companies with same eventId', () => {
    const eventId = 'evt_same';
    const keyA = buildEventLockKey('companyA', eventId);
    const keyB = buildEventLockKey('companyB', eventId);
    expect(keyA).not.toBe(keyB);
  });

  it('uses same key when company and event match', () => {
    const eventId = 'evt_same';
    const keyA = buildEventLockKey('companyA', eventId);
    const keyA2 = buildEventLockKey('companyA', eventId);
    expect(keyA).toBe(keyA2);
  });
});
