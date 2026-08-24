export const SERVICE_UNITS = [
  'PIECE',
  'HOUR',
  'DAY',
  'PERSON',
  'FLAT_RATE',
  'PER_GUEST',
  'PER_TICKET',
] as const;

export const CALCULATION_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED'] as const;
export const COST_STATUSES = ['PLANNED', 'COMMITTED'] as const;

export type ServiceUnit = (typeof SERVICE_UNITS)[number];
export type CalculationStatus = (typeof CALCULATION_STATUSES)[number];
export type CostStatus = (typeof COST_STATUSES)[number];

export class ServiceCalculationValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceCalculationValidationError';
  }
}

export function cleanName(value: string, field: string, maximum: number): string {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    throw new ServiceCalculationValidationError('NAME_REQUIRED', `${field} ist erforderlich`);
  }
  if (cleaned.length > maximum) {
    throw new ServiceCalculationValidationError(
      'NAME_TOO_LONG',
      `${field} darf höchstens ${maximum} Zeichen lang sein`,
    );
  }
  return cleaned;
}

export function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

export function cleanNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

export function parseMinorUnits(value: string | null | undefined, field: string): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) {
    throw new ServiceCalculationValidationError(
      'INVALID_MINOR_UNITS',
      `${field} muss als nichtnegative ganzzahlige Minor Units angegeben werden`,
    );
  }
  return BigInt(value);
}

/** Converts a localized non-negative EUR amount to cents without using floating point. */
export function parseEuroAmountToMinor(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw new ServiceCalculationValidationError(
      'INVALID_EURO_AMOUNT',
      'Der Eurobetrag muss zum Beispiel als 200, 200,00 oder 200.00 angegeben werden',
    );
  }
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
}

export function normalizeQuantity(value: string): string {
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(normalized);
  if (!match) {
    throw new ServiceCalculationValidationError(
      'INVALID_QUANTITY',
      'Die Menge muss positiv sein und darf höchstens vier Nachkommastellen haben',
    );
  }
  const fraction = (match[2] ?? '').padEnd(4, '0');
  const scaled = BigInt(match[1]!) * 10_000n + BigInt(fraction || '0');
  if (scaled <= 0n) {
    throw new ServiceCalculationValidationError(
      'INVALID_QUANTITY',
      'Die Menge muss größer als 0 sein',
    );
  }
  const whole = scaled / 10_000n;
  const trimmedFraction = (scaled % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

/**
 * Multiplies a non-negative quantity (maximum scale 4) by cents and rounds to the
 * nearest cent. Exact half-cent values are rounded up (commercial HALF_UP).
 */
export function calculateLineTotal(quantity: string, unitPriceMinor: bigint): bigint {
  const canonical = normalizeQuantity(quantity);
  const [whole = '0', fraction = ''] = canonical.split('.');
  const scaledQuantity = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0') || '0');
  return (scaledQuantity * unitPriceMinor + 5_000n) / 10_000n;
}

export function assertCalculationTransition(
  previous: CalculationStatus,
  next: CalculationStatus,
): void {
  const allowed: Record<CalculationStatus, readonly CalculationStatus[]> = {
    DRAFT: ['REVIEW'],
    REVIEW: ['DRAFT', 'APPROVED'],
    APPROVED: ['DRAFT'],
  };
  if (!allowed[previous].includes(next)) {
    throw new ServiceCalculationValidationError(
      'CALCULATION_STATUS_TRANSITION_INVALID',
      'Dieser Kalkulationsstatuswechsel ist nicht erlaubt',
    );
  }
}
