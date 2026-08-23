import { describe, expect, it } from 'vitest';

import {
  createFreeEventValues,
  createEventSnapshot,
  eventEndMinutes,
  formatLocalTime,
  parseLocalDate,
  parseLocalTime,
  validateEventSchedule,
  type EventFormatSnapshotSource,
  type EventStatus,
} from './event.rules.js';

const source: EventFormatSnapshotSource = {
  id: '10000000-0000-4000-8000-000000000001',
  version: 4,
  name: 'Mix Show',
  description: 'Standardbeschreibung',
  eventKind: 'OWN_PRODUCTION',
  technicalGetInMinutes: 960,
  artistGetInMinutes: 1050,
  doorsMinutes: 1140,
  startMinutes: 1200,
  endMinutes: 1530,
  recordingDefault: 'ENABLED',
};

describe('event domain rules', () => {
  it('accepts real local dates without converting them to UTC instants', () => {
    expect(parseLocalDate('2026-03-29')).toBe('2026-03-29');
    expect(parseLocalDate('2026-10-25')).toBe('2026-10-25');
    expect(() => parseLocalDate('2026-02-30')).toThrowError(
      expect.objectContaining({ code: 'INVALID_EVENT_DATE' }),
    );
  });

  it('maps local times and distinguishes an end on the following day', () => {
    expect(parseLocalTime('20:00')).toBe(1200);
    expect(eventEndMinutes('01:30', true)).toBe(1530);
    expect(formatLocalTime(1530)).toBe('01:30');
  });

  it('accepts missing optional times without inventing an order', () => {
    expect(() =>
      validateEventSchedule({
        technicalGetInMinutes: 1000,
        artistGetInMinutes: null,
        doorsMinutes: null,
        startMinutes: null,
        endMinutes: 120,
      }),
    ).not.toThrow();
  });

  it('rejects invalid event schedule ordering with one stable code', () => {
    expect(() =>
      validateEventSchedule({
        technicalGetInMinutes: null,
        artistGetInMinutes: null,
        doorsMinutes: 1201,
        startMinutes: 1200,
        endMinutes: 1200,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_EVENT_SCHEDULE' }));
  });

  it('copies an exact format snapshot and keeps source provenance', () => {
    expect(createEventSnapshot(source, {})).toEqual({
      name: 'Mix Show',
      description: 'Standardbeschreibung',
      snapshotSource: 'EVENT_FORMAT',
      formatNameSnapshot: 'Mix Show',
      formatDescriptionSnapshot: 'Standardbeschreibung',
      eventKind: 'OWN_PRODUCTION',
      technicalGetInMinutes: 960,
      artistGetInMinutes: 1050,
      doorsMinutes: 1140,
      startMinutes: 1200,
      endMinutes: 1530,
      recordingSetting: 'ENABLED',
      sourceEventFormatId: source.id,
      sourceEventFormatVersion: 4,
    });
  });

  it('creates a free event without any hidden format provenance', () => {
    expect(
      createFreeEventValues('THIRD_PARTY_EVENT', {
        name: 'Freie Vermietung',
        technicalGetInTime: '16:00',
        endTime: '01:00',
        endNextDay: true,
      }),
    ).toMatchObject({
      name: 'Freie Vermietung',
      eventKind: 'THIRD_PARTY_EVENT',
      snapshotSource: null,
      sourceEventFormatId: null,
      sourceEventFormatVersion: null,
      formatNameSnapshot: null,
      formatDescriptionSnapshot: null,
      technicalGetInMinutes: 960,
      endMinutes: 1500,
    });
  });

  it('applies only allowed event overrides without changing the format snapshot identity', () => {
    expect(
      createEventSnapshot(source, {
        name: 'Individueller Abend',
        description: null,
        startTime: '20:30',
        endTime: '02:00',
        endNextDay: true,
        recordingSetting: 'DISABLED',
      }),
    ).toMatchObject({
      name: 'Individueller Abend',
      description: null,
      formatNameSnapshot: 'Mix Show',
      eventKind: 'OWN_PRODUCTION',
      startMinutes: 1230,
      endMinutes: 1560,
      recordingSetting: 'DISABLED',
      sourceEventFormatId: source.id,
      sourceEventFormatVersion: 4,
    });
  });

  it('clears a copied next-day end without requiring a second flag', () => {
    expect(createEventSnapshot(source, { endTime: null })).toMatchObject({
      endMinutes: null,
      sourceEventFormatId: source.id,
      sourceEventFormatVersion: source.version,
    });
  });

  it('defines only the five global V1 event statuses', () => {
    const statuses: EventStatus[] = ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
    expect(statuses).toHaveLength(5);
  });
});
