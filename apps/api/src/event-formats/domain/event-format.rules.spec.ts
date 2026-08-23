import { describe, expect, it } from 'vitest';

import {
  eventEndMinutes,
  EventFormatValidationError,
  formatLocalTime,
  normalizeEventFormatName,
  parseLocalTime,
  validateEventFormatSchedule,
} from './event-format.rules.js';

describe('event-format domain rules', () => {
  it('normalizes Unicode, surrounding whitespace, repeated whitespace and case', () => {
    expect(normalizeEventFormatName('  MiX\u00a0 Show  ')).toBe('mix show');
    expect(normalizeEventFormatName('Ｗｅｂｓｈｏｗ')).toBe('webshow');
  });

  it('maps local times and a next-day end without a UTC conversion', () => {
    expect(parseLocalTime('19:30')).toBe(1170);
    expect(eventEndMinutes('01:30', true)).toBe(1530);
    expect(formatLocalTime(1530)).toBe('01:30');
  });

  it('accepts incomplete optional schedules without inventing an order', () => {
    expect(() =>
      validateEventFormatSchedule({
        technicalGetInMinutes: 900,
        artistGetInMinutes: 840,
        doorsMinutes: null,
        startMinutes: null,
        endMinutes: 120,
      }),
    ).not.toThrow();
  });

  it.each([
    {
      label: 'Einlass nach Beginn',
      schedule: {
        technicalGetInMinutes: null,
        artistGetInMinutes: null,
        doorsMinutes: 1201,
        startMinutes: 1200,
        endMinutes: null,
      },
    },
    {
      label: 'Get-in nach Beginn',
      schedule: {
        technicalGetInMinutes: 1201,
        artistGetInMinutes: null,
        doorsMinutes: null,
        startMinutes: 1200,
        endMinutes: null,
      },
    },
    {
      label: 'Ende gleich Beginn',
      schedule: {
        technicalGetInMinutes: null,
        artistGetInMinutes: null,
        doorsMinutes: null,
        startMinutes: 1200,
        endMinutes: 1200,
      },
    },
  ])('rejects $label', ({ schedule }) => {
    expect(() => validateEventFormatSchedule(schedule)).toThrowError(
      expect.objectContaining({ code: 'EVENT_FORMAT_TIME_ORDER_INVALID' }),
    );
  });

  it('rejects malformed times and a next-day marker without an end time', () => {
    expect(() => parseLocalTime('24:00')).toThrow(EventFormatValidationError);
    expect(() => eventEndMinutes(null, true)).toThrowError(
      expect.objectContaining({ code: 'EVENT_FORMAT_END_DAY_INVALID' }),
    );
  });
});
