export type EventKind = 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
export type RecordingDefault = 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';

export interface EventFormatSchedule {
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
}

export class EventFormatValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EventFormatValidationError';
  }
}

export class EventFormatNameConflictError extends Error {
  constructor() {
    super('Ein Veranstaltungsformat mit diesem Namen ist bereits vorhanden');
    this.name = 'EventFormatNameConflictError';
  }
}

export function cleanEventFormatName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function normalizeEventFormatName(value: string): string {
  return cleanEventFormatName(value).toLocaleLowerCase('de-DE');
}

export function parseLocalTime(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) invalidTime();
  const hours = Number(match![1]);
  const minutes = Number(match![2]);
  if (hours > 23 || minutes > 59) invalidTime();
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
    if (nextDay) {
      throw new EventFormatValidationError(
        'EVENT_FORMAT_END_DAY_INVALID',
        'Ein Folgetag kann nur zusammen mit einer Endzeit ausgewählt werden',
      );
    }
    return null;
  }
  return minutes + (nextDay ? 1440 : 0);
}

export function validateEventFormatSchedule(schedule: EventFormatSchedule): void {
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
      throw new EventFormatValidationError(
        'EVENT_FORMAT_TIME_INVALID',
        `Der Zeitwert ${field} ist ungültig`,
      );
    }
  }

  if (startMinutes === null) return;
  if (doorsMinutes !== null && doorsMinutes > startMinutes) {
    invalidOrder('Der Einlass darf nicht nach dem Beginn liegen');
  }
  if (technicalGetInMinutes !== null && technicalGetInMinutes > startMinutes) {
    invalidOrder('Der Get-in Technik darf nicht nach dem Beginn liegen');
  }
  if (artistGetInMinutes !== null && artistGetInMinutes > startMinutes) {
    invalidOrder('Der Get-in Artists darf nicht nach dem Beginn liegen');
  }
  if (endMinutes !== null && endMinutes <= startMinutes) {
    invalidOrder('Das Ende muss nach dem Beginn liegen');
  }
}

function invalidTime(): never {
  throw new EventFormatValidationError(
    'EVENT_FORMAT_TIME_INVALID',
    'Zeitangaben müssen gültige lokale Uhrzeiten im Format HH:mm sein',
  );
}

function invalidOrder(message: string): never {
  throw new EventFormatValidationError('EVENT_FORMAT_TIME_ORDER_INVALID', message);
}
