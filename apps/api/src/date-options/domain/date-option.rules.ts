import {
  cleanEventName,
  cleanNullable,
  eventEndMinutes,
  EventValidationError,
  parseLocalDate,
  parseLocalTime,
} from '../../events/domain/event.rules.js';
import type { LocalOccupancyInterval } from '../../occupancy/domain/occupancy.rules.js';

export function dateOptionValues(input: {
  optionDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay?: boolean;
  label: string;
  note?: string | null;
  validUntil: string;
}) {
  const date = parseLocalDate(input.optionDate);
  const startMinutes = parseLocalTime(input.occupancyStartTime);
  const endMinutes = eventEndMinutes(input.occupancyEndTime, input.occupancyEndNextDay ?? false);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new EventValidationError(
      'INVALID_DATE_OPTION_SCHEDULE',
      'Das Ende der Terminoption muss nach ihrem Belegungsbeginn liegen',
    );
  }
  const label = cleanEventName(input.label);
  if (!label) {
    throw new EventValidationError(
      'DATE_OPTION_LABEL_REQUIRED',
      'Eine Bezeichnung ist erforderlich',
    );
  }
  const validUntil = new Date(input.validUntil);
  if (Number.isNaN(validUntil.valueOf())) {
    throw new EventValidationError(
      'INVALID_DATE_OPTION_EXPIRY',
      'Gültig bis muss ein gültiger Zeitpunkt sein',
    );
  }
  if (validUntil <= new Date()) {
    throw new EventValidationError(
      'INVALID_DATE_OPTION_EXPIRY',
      'Gültig bis muss in der Zukunft liegen',
    );
  }
  return {
    optionDate: date,
    occupancyStartMinutes: startMinutes,
    occupancyEndMinutes: endMinutes,
    label,
    note: cleanNullable(input.note),
    validUntil,
  };
}

export function dateOptionInterval(values: {
  optionDate: string;
  occupancyStartMinutes: number;
  occupancyEndMinutes: number;
}): LocalOccupancyInterval {
  return {
    date: values.optionDate,
    startMinutes: values.occupancyStartMinutes,
    endMinutes: values.occupancyEndMinutes,
  };
}

export function availabilityDates(fromDate: string, toDate: string, weekdays?: number[]): string[] {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  if (from > to) {
    throw new EventValidationError(
      'INVALID_AVAILABILITY_RANGE',
      'Das Bis-Datum darf nicht vor dem Von-Datum liegen',
    );
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > 93) {
    throw new EventValidationError(
      'AVAILABILITY_RANGE_TOO_LARGE',
      'Die Freiterminsuche ist auf 93 Tage begrenzt',
    );
  }
  const allowed = weekdays ? new Set(weekdays) : undefined;
  return Array.from({ length: days }, (_, index) => new Date(start + index * 86_400_000))
    .filter((date) => !allowed || allowed.has(date.getUTCDay()))
    .map((date) => date.toISOString().slice(0, 10));
}
