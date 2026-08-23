import { describe, expect, it } from 'vitest';

import { eventOccupancyInterval, intervalsOverlap } from './occupancy.rules.js';

describe('shared location occupancy rules', () => {
  it('uses the earliest available event time and the explicit end', () => {
    expect(
      eventOccupancyInterval('2026-09-10', {
        technicalGetInMinutes: 960,
        artistGetInMinutes: 1020,
        doorsMinutes: 1140,
        startMinutes: 1200,
        endMinutes: 1500,
      }),
    ).toEqual({ date: '2026-09-10', startMinutes: 960, endMinutes: 1500 });
  });

  it('keeps incomplete schedules saveable but not fully checkable', () => {
    expect(
      eventOccupancyInterval('2026-09-10', {
        technicalGetInMinutes: null,
        artistGetInMinutes: null,
        doorsMinutes: null,
        startMinutes: 1200,
        endMinutes: null,
      }),
    ).toBeUndefined();
  });

  it('treats intervals as half-open and detects midnight overlaps', () => {
    expect(
      intervalsOverlap(
        { startMinutes: 960, endMinutes: 1200 },
        { startMinutes: 1200, endMinutes: 1300 },
      ),
    ).toBe(false);
    expect(
      intervalsOverlap(
        { startMinutes: 1200, endMinutes: 1530 },
        { startMinutes: 1500, endMinutes: 1600 },
      ),
    ).toBe(true);
  });
});
