import { describe, it, expect } from 'vitest';
import { formatMoney, formatMinorUnits } from '@/lib/money';
import { formatBDT } from '@/lib/api/finance';

describe('P5 remediation — BDT display formatting', () => {
  it('10. BDT values never render with a $ symbol', () => {
    expect(formatMoney('1000.00', 'BDT')).not.toContain('$');
    expect(formatMoney(1000, 'BDT')).not.toContain('$');
    expect(formatMinorUnits(100000, 'BDT')).not.toContain('$');
    expect(formatBDT(100000)).not.toContain('$');
  });

  it('11. example output is exactly "BDT 1,000.00"', () => {
    expect(formatMoney('1000.00', 'BDT')).toBe('BDT 1,000.00');
    expect(formatMoney(1000, 'BDT')).toBe('BDT 1,000.00');
    expect(formatMinorUnits(100000, 'BDT')).toBe('BDT 1,000.00');
    expect(formatBDT(100000)).toBe('BDT 1,000.00');
  });

  it('defaults to BDT and tolerates missing / invalid values', () => {
    expect(formatMoney('2500.5')).toBe('BDT 2,500.50');
    expect(formatMoney(null)).toBe('BDT 0.00');
    expect(formatMinorUnits(undefined)).toBe('BDT 0.00');
    expect(formatMinorUnits(0, 'BDT')).toBe('BDT 0.00');
  });

  it('formats large amounts with thousands grouping', () => {
    expect(formatMinorUnits(12500000, 'BDT')).toBe('BDT 125,000.00');
  });
});
