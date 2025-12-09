import { describe, it, expect } from 'vitest';
import { normalizeAmountToDollars } from '@/server/services/eventProcessor';

describe.skip('normalizeAmountToDollars', () => {
  it('converts minor units to dollars for USD', () => {
    expect(normalizeAmountToDollars(1000, 'USD')).toBe(10);
  });

  it('respects zero-decimal currencies like JPY', () => {
    expect(normalizeAmountToDollars(1000, 'JPY')).toBe(1000);
  });

  it('throws when normalized amount is too small to attribute', () => {
    expect(() => normalizeAmountToDollars(0.5, 'USD')).toThrow();
  });

  it('throws when normalized amount is excessive', () => {
    expect(() => normalizeAmountToDollars(1_000_000_00, 'USD')).toThrow();
  });
});

