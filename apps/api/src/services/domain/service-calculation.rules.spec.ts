import { describe, expect, it } from 'vitest';

import {
  assertCalculationTransition,
  calculateLineTotal,
  normalizeName,
  normalizeQuantity,
  parseEuroAmountToMinor,
  parseMinorUnits,
} from './service-calculation.rules.js';

describe('service and calculation rules', () => {
  it('normalizes Unicode, whitespace and case for stable tenant-local duplicate detection', () => {
    expect(normalizeName('  Ton\u212b  Technik ')).toBe(normalizeName('tonÅ technik'));
  });

  it.each([
    ['200', 20_000n],
    ['200,00', 20_000n],
    ['200.00', 20_000n],
    ['0,00', 0n],
  ])('parses %s exactly as EUR minor units', (value, expected) => {
    expect(parseEuroAmountToMinor(value)).toBe(expected);
  });

  it('keeps null distinct from an explicit zero price', () => {
    expect(parseMinorUnits(null, 'Preis')).toBeNull();
    expect(parseMinorUnits('0', 'Preis')).toBe(0n);
  });

  it('normalizes decimal quantities and rounds quantity times unit price HALF_UP', () => {
    expect(normalizeQuantity('2,5000')).toBe('2.5');
    expect(calculateLineTotal('2.5', 101n)).toBe(253n);
    expect(calculateLineTotal('0.005', 100n)).toBe(1n);
  });

  it('only permits the documented calculation transitions', () => {
    expect(() => assertCalculationTransition('DRAFT', 'REVIEW')).not.toThrow();
    expect(() => assertCalculationTransition('REVIEW', 'APPROVED')).not.toThrow();
    expect(() => assertCalculationTransition('APPROVED', 'REVIEW')).toThrow(/nicht erlaubt/);
  });
});
