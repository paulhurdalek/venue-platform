import { describe, expect, it } from 'vitest';

import {
  assertStatusTransition,
  BOOKING_STATUSES,
  BookingValidationError,
  isActiveBookingStatus,
  normalizeCustomRole,
  normalizeMoney,
} from './booking.rules.js';

describe('booking rules', () => {
  it('defines exactly the six stable booking statuses and active history semantics', () => {
    expect(BOOKING_STATUSES).toEqual([
      'SHORTLISTED',
      'REQUESTED',
      'OPTION',
      'CONFIRMED',
      'DECLINED',
      'CANCELLED',
    ]);
    expect(BOOKING_STATUSES.filter(isActiveBookingStatus)).toEqual([
      'SHORTLISTED',
      'REQUESTED',
      'OPTION',
      'CONFIRMED',
    ]);
  });

  it.each([
    ['SHORTLISTED', 'REQUESTED'],
    ['SHORTLISTED', 'CONFIRMED'],
    ['REQUESTED', 'OPTION'],
    ['OPTION', 'CONFIRMED'],
    ['CONFIRMED', 'OPTION'],
    ['OPTION', 'REQUESTED'],
    ['REQUESTED', 'DECLINED'],
    ['CONFIRMED', 'CANCELLED'],
  ] as const)('allows the direct %s to %s transition', (previous, next) => {
    expect(() => assertStatusTransition(previous, next, false)).not.toThrow();
  });

  it('rejects unchanged and unconfirmed reactivation transitions', () => {
    expect(() => assertStatusTransition('OPTION', 'OPTION', false)).toThrow(BookingValidationError);
    expect(() => assertStatusTransition('CANCELLED', 'SHORTLISTED', false)).toThrowError(
      expect.objectContaining({ code: 'BOOKING_REACTIVATION_CONFIRMATION_REQUIRED' }),
    );
    expect(() => assertStatusTransition('DECLINED', 'CONFIRMED', false)).toThrowError(
      expect.objectContaining({ code: 'BOOKING_REACTIVATION_CONFIRMATION_REQUIRED' }),
    );
    expect(() => assertStatusTransition('CANCELLED', 'SHORTLISTED', true)).not.toThrow();
    expect(() => assertStatusTransition('DECLINED', 'CONFIRMED', true)).not.toThrow();
  });

  it('keeps no fee and zero fee valid while requiring a currency for actual amounts', () => {
    expect(normalizeMoney(null, null, 'Gage')).toEqual({ minor: null, currency: null });
    expect(normalizeMoney('0', 'eur', 'Gage')).toEqual({ minor: 0n, currency: 'EUR' });
    expect(normalizeMoney('125050', 'EUR', 'Gage')).toEqual({
      minor: 125050n,
      currency: 'EUR',
    });
    expect(() => normalizeMoney('100', null, 'Gage')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CURRENCY' }),
    );
  });

  it('rejects foreign currencies for calculation-relevant booking sources', () => {
    expect(() => normalizeMoney('100', 'USD', 'Die Gage')).toThrow(/ausschließlich in EUR/);
  });

  it('requires a relational role plus a bounded label only for custom roles', () => {
    expect(normalizeCustomRole('ARTIST', 'ignored')).toEqual({
      customRoleLabel: null,
      normalizedCustomRoleLabel: null,
    });
    expect(normalizeCustomRole('OTHER', '  Support Act  ')).toEqual({
      customRoleLabel: 'Support Act',
      normalizedCustomRoleLabel: 'support act',
    });
    expect(() => normalizeCustomRole('OTHER', '')).toThrowError(
      expect.objectContaining({ code: 'CUSTOM_ROLE_LABEL_REQUIRED' }),
    );
  });
});
