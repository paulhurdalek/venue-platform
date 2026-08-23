import { describe, expect, it } from 'vitest';

import { availabilityDates, dateOptionValues } from './date-option.rules.js';

describe('date option rules', () => {
  it('maps a next-day option to one relational local interval', () => {
    expect(
      dateOptionValues({
        optionDate: '2026-09-10',
        occupancyStartTime: '18:00',
        occupancyEndTime: '01:30',
        occupancyEndNextDay: true,
        label: '  Anfrage   Muster  ',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toMatchObject({
      optionDate: '2026-09-10',
      occupancyStartMinutes: 1080,
      occupancyEndMinutes: 1530,
      label: 'Anfrage Muster',
    });
  });

  it('rejects invalid periods and limits availability to 93 days', () => {
    expect(() =>
      dateOptionValues({
        optionDate: '2026-09-10',
        occupancyStartTime: '18:00',
        occupancyEndTime: '17:00',
        label: 'Anfrage',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_DATE_OPTION_SCHEDULE' }));
    expect(() => availabilityDates('2026-01-01', '2026-04-05')).toThrowError(
      expect.objectContaining({ code: 'AVAILABILITY_RANGE_TOO_LARGE' }),
    );
  });

  it('filters availability dates by local weekday', () => {
    expect(availabilityDates('2026-09-07', '2026-09-13', [1, 4])).toEqual([
      '2026-09-07',
      '2026-09-10',
    ]);
  });
});
