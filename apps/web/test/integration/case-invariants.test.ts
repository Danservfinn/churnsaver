import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cases from '@/server/services/cases';
import { sqlWithRLS } from '@/lib/db-rls';

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('@/server/services/settings', () => ({
  getSettingsForCompany: vi.fn().mockResolvedValue({
    enable_push: false,
    enable_dm: false,
    incentive_days: 0,
  }),
}));

const sampleEvent = {
  eventId: 'evt-1',
  membershipId: 'mem-1',
  userId: 'user-1',
};

const sampleCase = {
  id: 'case-1',
  company_id: 'company-1',
  membership_id: 'mem-1',
  user_id: 'user-1',
  first_failure_at: new Date(),
  last_nudge_at: null,
  attempts: 0,
  incentive_days: 0,
  status: 'open',
  failure_reason: null,
  recovered_amount_cents: 0,
  created_at: new Date(),
};

describe('One-open-case invariant', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges duplicate payment_failed into existing open case', async () => {
    (sqlWithRLS.select as any).mockResolvedValueOnce([sampleCase]); // findExistingCase
    (sqlWithRLS.insert as any).mockResolvedValue(sampleCase); // updateRecoveryCase
    (sqlWithRLS.execute as any).mockResolvedValue({ rowCount: 1, rows: [sampleCase] });

    const result = await cases.processPaymentFailedEvent(sampleEvent as any, 'company-1');

    expect(sqlWithRLS.select).toHaveBeenCalledWith(
      expect.stringContaining('FROM recovery_cases'),
      expect.arrayContaining(['company-1', sampleEvent.membershipId, 'open']),
      expect.objectContaining({ companyId: 'company-1' })
    );
    expect(result).toBeTruthy();
  });

  it('creates a new case when none exists', async () => {
    (sqlWithRLS.select as any).mockResolvedValueOnce([]); // findExistingCase
    (sqlWithRLS.insert as any).mockResolvedValue(sampleCase); // createRecoveryCase insert
    (sqlWithRLS.execute as any).mockResolvedValue({ rowCount: 0, rows: [] });

    const result = await cases.processPaymentFailedEvent(sampleEvent as any, 'company-1');

    expect(sqlWithRLS.select).toHaveBeenCalled();
    expect(sqlWithRLS.insert).toHaveBeenCalled();
    expect(result?.id).toBe(sampleCase.id);
  });
});

