export type EventStatus = 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type EventKind = 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
export type RecordingSetting = 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';

export interface EventSchedule {
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
}

export interface EventFormatSnapshotSource extends EventSchedule {
  id: string;
  version: number;
  name: string;
  description: string | null;
  eventKind: EventKind;
  recordingDefault: RecordingSetting;
}

export interface EventSnapshotOverrides {
  name?: string;
  description?: string | null;
  technicalGetInTime?: string | null;
  artistGetInTime?: string | null;
  doorsTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
  recordingSetting?: RecordingSetting;
}

export interface EventSnapshotValues extends EventSchedule {
  name: string;
  description: string | null;
  snapshotSource: 'EVENT_FORMAT' | null;
  formatNameSnapshot: string | null;
  formatDescriptionSnapshot: string | null;
  eventKind: EventKind;
  recordingSetting: RecordingSetting;
  sourceEventFormatId: string | null;
  sourceEventFormatVersion: number | null;
}

export class EventValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

export function cleanEventName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function parseLocalDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalidDate();
  const year = Number(match![1]);
  const month = Number(match![2]);
  const day = Number(match![3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalidDate();
  }
  return value;
}

export function parseLocalTime(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) invalidSchedule('Zeitangaben müssen gültige lokale Uhrzeiten im Format HH:mm sein');
  const hours = Number(match![1]);
  const minutes = Number(match![2]);
  if (hours > 23 || minutes > 59) {
    invalidSchedule('Zeitangaben müssen gültige lokale Uhrzeiten im Format HH:mm sein');
  }
  return hours * 60 + minutes;
}

export function formatLocalTime(minutes: number | null): string | null {
  if (minutes === null) return null;
  const minutesWithinDay = minutes % 1440;
  return `${String(Math.floor(minutesWithinDay / 60)).padStart(2, '0')}:${String(
    minutesWithinDay % 60,
  ).padStart(2, '0')}`;
}

export function eventEndMinutes(value: string | null | undefined, nextDay: boolean): number | null {
  const minutes = parseLocalTime(value);
  if (minutes === null) {
    if (nextDay) invalidSchedule('Ein Folgetag kann nur zusammen mit einer Endzeit gewählt werden');
    return null;
  }
  return minutes + (nextDay ? 1440 : 0);
}

export function validateEventSchedule(schedule: EventSchedule): void {
  const { technicalGetInMinutes, artistGetInMinutes, doorsMinutes, startMinutes, endMinutes } =
    schedule;
  for (const [field, value, maximum] of [
    ['technicalGetInMinutes', technicalGetInMinutes, 1439],
    ['artistGetInMinutes', artistGetInMinutes, 1439],
    ['doorsMinutes', doorsMinutes, 1439],
    ['startMinutes', startMinutes, 1439],
    ['endMinutes', endMinutes, 2879],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > maximum)) {
      invalidSchedule(`Der Zeitwert ${field} ist ungültig`);
    }
  }
  if (startMinutes === null) return;
  if (doorsMinutes !== null && doorsMinutes > startMinutes) {
    invalidSchedule('Der Einlass darf nicht nach dem Beginn liegen');
  }
  if (technicalGetInMinutes !== null && technicalGetInMinutes > startMinutes) {
    invalidSchedule('Der Get-in Technik darf nicht nach dem Beginn liegen');
  }
  if (artistGetInMinutes !== null && artistGetInMinutes > startMinutes) {
    invalidSchedule('Der Get-in Artists darf nicht nach dem Beginn liegen');
  }
  if (endMinutes !== null && endMinutes <= startMinutes) {
    invalidSchedule('Das Ende muss nach dem Beginn liegen');
  }
}

export function createEventSnapshot(
  source: EventFormatSnapshotSource,
  overrides: EventSnapshotOverrides,
): EventSnapshotValues {
  const name = cleanEventName(overrides.name === undefined ? source.name : overrides.name);
  if (!name) {
    throw new EventValidationError(
      'EVENT_NAME_REQUIRED',
      'Der Veranstaltungsname ist erforderlich',
    );
  }
  if (name.length > 200) {
    throw new EventValidationError(
      'EVENT_NAME_TOO_LONG',
      'Der Veranstaltungsname darf höchstens 200 Zeichen lang sein',
    );
  }
  const endTime =
    overrides.endTime === undefined ? formatLocalTime(source.endMinutes) : overrides.endTime;
  const endNextDay =
    overrides.endTime === null && overrides.endNextDay === undefined
      ? false
      : overrides.endNextDay === undefined
        ? source.endMinutes !== null && source.endMinutes >= 1440
        : overrides.endNextDay;
  const schedule: EventSchedule = {
    technicalGetInMinutes:
      overrides.technicalGetInTime === undefined
        ? source.technicalGetInMinutes
        : parseLocalTime(overrides.technicalGetInTime),
    artistGetInMinutes:
      overrides.artistGetInTime === undefined
        ? source.artistGetInMinutes
        : parseLocalTime(overrides.artistGetInTime),
    doorsMinutes:
      overrides.doorsTime === undefined ? source.doorsMinutes : parseLocalTime(overrides.doorsTime),
    startMinutes:
      overrides.startTime === undefined ? source.startMinutes : parseLocalTime(overrides.startTime),
    endMinutes: eventEndMinutes(endTime, endNextDay),
  };
  validateEventSchedule(schedule);
  return {
    name,
    description: cleanNullable(
      overrides.description === undefined ? source.description : overrides.description,
    ),
    snapshotSource: 'EVENT_FORMAT',
    formatNameSnapshot: source.name,
    formatDescriptionSnapshot: source.description,
    eventKind: source.eventKind,
    ...schedule,
    recordingSetting: overrides.recordingSetting ?? source.recordingDefault,
    sourceEventFormatId: source.id,
    sourceEventFormatVersion: source.version,
  };
}

export function createFreeEventValues(
  eventKind: EventKind,
  input: EventSnapshotOverrides & { name?: string },
): EventSnapshotValues {
  const name = cleanEventName(input.name ?? '');
  if (!name) {
    throw new EventValidationError(
      'EVENT_NAME_REQUIRED',
      'Der Veranstaltungsname ist erforderlich',
    );
  }
  if (name.length > 200) {
    throw new EventValidationError(
      'EVENT_NAME_TOO_LONG',
      'Der Veranstaltungsname darf höchstens 200 Zeichen lang sein',
    );
  }
  const schedule: EventSchedule = {
    technicalGetInMinutes: parseLocalTime(input.technicalGetInTime),
    artistGetInMinutes: parseLocalTime(input.artistGetInTime),
    doorsMinutes: parseLocalTime(input.doorsTime),
    startMinutes: parseLocalTime(input.startTime),
    endMinutes: eventEndMinutes(input.endTime, input.endNextDay ?? false),
  };
  validateEventSchedule(schedule);
  return {
    name,
    description: cleanNullable(input.description),
    snapshotSource: null,
    sourceEventFormatId: null,
    sourceEventFormatVersion: null,
    formatNameSnapshot: null,
    formatDescriptionSnapshot: null,
    eventKind,
    ...schedule,
    recordingSetting: input.recordingSetting ?? 'UNSPECIFIED',
  };
}

export function isIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('de-DE', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function cleanNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

function invalidDate(): never {
  throw new EventValidationError(
    'INVALID_EVENT_DATE',
    'Das Veranstaltungsdatum muss ein gültiges lokales Kalenderdatum sein',
  );
}

function invalidSchedule(message: string): never {
  throw new EventValidationError('INVALID_EVENT_SCHEDULE', message);
}
