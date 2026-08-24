export const BOOKING_STATUSES = [
  'SHORTLISTED',
  'REQUESTED',
  'OPTION',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const LINEUP_ROLES = ['ARTIST', 'MODERATOR', 'OTHER'] as const;
export type LineupRole = (typeof LINEUP_ROLES)[number];

export const HOTEL_ARRANGEMENTS = ['NONE', 'REQUIRED', 'BUYOUT'] as const;
export type HotelArrangement = (typeof HOTEL_ARRANGEMENTS)[number];

export const PROGRAM_ITEM_KINDS = ['PERFORMANCE', 'BREAK'] as const;
export type ProgramItemKind = (typeof PROGRAM_ITEM_KINDS)[number];

export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'SHORTLISTED',
  'REQUESTED',
  'OPTION',
  'CONFIRMED',
];

export class BookingValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BookingValidationError';
  }
}

export function isActiveBookingStatus(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

export function assertStatusTransition(
  previousStatus: BookingStatus,
  newStatus: BookingStatus,
  confirmReactivation: boolean,
): void {
  if (previousStatus === newStatus) {
    throw new BookingValidationError('NO_CHANGES', 'Der Bookingstatus wurde nicht geändert');
  }
  if (
    (previousStatus === 'DECLINED' || previousStatus === 'CANCELLED') &&
    isActiveBookingStatus(newStatus) &&
    !confirmReactivation
  ) {
    throw new BookingValidationError(
      'BOOKING_REACTIVATION_CONFIRMATION_REQUIRED',
      'Die Reaktivierung muss ausdrücklich bestätigt werden',
    );
  }
}

export function normalizeCustomRole(role: LineupRole, label?: string | null) {
  if (role !== 'OTHER') {
    return { customRoleLabel: null, normalizedCustomRoleLabel: null };
  }
  const customRoleLabel = label?.trim() ?? '';
  if (!customRoleLabel) {
    throw new BookingValidationError(
      'CUSTOM_ROLE_LABEL_REQUIRED',
      'Für eine sonstige Auftrittsrolle ist eine Bezeichnung erforderlich',
    );
  }
  if (customRoleLabel.length > 120) {
    throw new BookingValidationError(
      'CUSTOM_ROLE_LABEL_TOO_LONG',
      'Die Rollenbezeichnung darf höchstens 120 Zeichen lang sein',
    );
  }
  return {
    customRoleLabel,
    normalizedCustomRoleLabel: customRoleLabel.toLocaleLowerCase('de-DE'),
  };
}

export function cleanNullable(value?: string | null): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

export function parseMinorUnits(value: string | null | undefined, field: string): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) {
    throw new BookingValidationError(
      'INVALID_MINOR_UNITS',
      `${field} muss als nichtnegative ganzzahlige Minor Units angegeben werden`,
    );
  }
  return BigInt(value);
}

export function normalizeMoney(
  minorValue: string | null | undefined,
  currencyValue: string | null | undefined,
  field: string,
) {
  const minor = parseMinorUnits(minorValue, field);
  if (minor === null) return { minor: null, currency: null };
  const currency = currencyValue?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BookingValidationError(
      'INVALID_CURRENCY',
      `${field} benötigt einen dreistelligen ISO-Währungscode`,
    );
  }
  return { minor, currency };
}
