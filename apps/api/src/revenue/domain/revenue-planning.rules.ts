export const PRICE_INPUT_TYPES = ['NET', 'GROSS'] as const;
export const REVENUE_AMOUNT_TYPES = ['FIXED', 'PERCENTAGE'] as const;
export const ALLOCATION_TYPES = ['FIXED', 'PERCENTAGE'] as const;
export const RECIPIENT_TYPES = ['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'] as const;
export const ADDITIONAL_REVENUE_TYPES = [
  'FIXED',
  'PER_EXPECTED_GUEST',
  'PER_PAYING_TICKET',
  'PERCENT_TICKET_BASE_NET',
] as const;

export type PriceInputType = (typeof PRICE_INPUT_TYPES)[number];
export type RevenueAmountType = (typeof REVENUE_AMOUNT_TYPES)[number];
export type AllocationType = (typeof ALLOCATION_TYPES)[number];
export type RecipientType = (typeof RECIPIENT_TYPES)[number];
export type AdditionalRevenueType = (typeof ADDITIONAL_REVENUE_TYPES)[number];

const BASIS = 10_000n;

export class RevenuePlanningValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RevenuePlanningValidationError';
  }
}

export function cleanRevenueName(value: string, field = 'Bezeichnung'): string {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    throw new RevenuePlanningValidationError('REVENUE_NAME_REQUIRED', `${field} ist erforderlich`);
  }
  if (cleaned.length > 160) {
    throw new RevenuePlanningValidationError(
      'REVENUE_NAME_TOO_LONG',
      `${field} darf höchstens 160 Zeichen lang sein`,
    );
  }
  return cleaned;
}

export function cleanOptionalRevenueText(
  value: string | null | undefined,
  maximum = 5_000,
): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.trim();
  if (cleaned.length > maximum) {
    throw new RevenuePlanningValidationError(
      'REVENUE_TEXT_TOO_LONG',
      `Der Text darf höchstens ${maximum} Zeichen lang sein`,
    );
  }
  return cleaned || null;
}

export function parseRevenueMinor(value: string | null | undefined, field: string): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) {
    throw new RevenuePlanningValidationError(
      'INVALID_REVENUE_MINOR_UNITS',
      `${field} muss als nichtnegative ganzzahlige Minor Units angegeben werden`,
    );
  }
  return BigInt(value);
}

export function assertBasisPoints(value: number, field: string, maximum = 100_000): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RevenuePlanningValidationError(
      'INVALID_BASIS_POINTS',
      `${field} muss als nichtnegative ganzzahlige Basispunkte angegeben werden`,
    );
  }
  return value;
}

export function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RevenuePlanningValidationError(
      'INVALID_NONNEGATIVE_INTEGER',
      `${field} muss eine nichtnegative ganze Zahl sein`,
    );
  }
  return value;
}

/** Integer division rounded HALF_UP. Inputs must be non-negative. */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RevenuePlanningValidationError(
      'INVALID_ROUNDING_INPUT',
      'Rundungswerte müssen nichtnegativ sein und einen positiven Teiler besitzen',
    );
  }
  return (numerator + denominator / 2n) / denominator;
}

export function percentageOfMinor(baseMinor: bigint, rateBasisPoints: number): bigint {
  assertBasisPoints(rateBasisPoints, 'Der Prozentsatz');
  return roundHalfUp(baseMinor * BigInt(rateBasisPoints), BASIS);
}

export interface NetGrossPair {
  netMinor: bigint;
  grossMinor: bigint;
}

/** Converts one entered amount deterministically; VAT is expressed in basis points. */
export function convertNetGross(
  inputMinor: bigint,
  inputType: PriceInputType,
  taxRateBasisPoints: number,
): NetGrossPair {
  if (inputMinor < 0n) {
    throw new RevenuePlanningValidationError(
      'NEGATIVE_REVENUE_AMOUNT',
      'Beträge dürfen nicht negativ sein',
    );
  }
  assertBasisPoints(taxRateBasisPoints, 'Der Umsatzsteuersatz');
  const taxFactor = BASIS + BigInt(taxRateBasisPoints);
  return inputType === 'NET'
    ? { netMinor: inputMinor, grossMinor: roundHalfUp(inputMinor * taxFactor, BASIS) }
    : { netMinor: roundHalfUp(inputMinor * BASIS, taxFactor), grossMinor: inputMinor };
}

export interface ComponentAmountInput {
  amountType: RevenueAmountType;
  inputType: PriceInputType;
  inputAmountMinor: bigint | null;
  percentageRateBasisPoints: number | null;
  taxRateBasisPoints: number;
}

export function resolveComponentAmount(
  baseGrossMinor: bigint | null,
  input: ComponentAmountInput,
): NetGrossPair | null {
  if (input.amountType === 'FIXED') {
    return input.inputAmountMinor === null
      ? null
      : convertNetGross(input.inputAmountMinor, input.inputType, input.taxRateBasisPoints);
  }
  if (baseGrossMinor === null || input.percentageRateBasisPoints === null) return null;
  const amount = percentageOfMinor(baseGrossMinor, input.percentageRateBasisPoints);
  return convertNetGross(amount, input.inputType, input.taxRateBasisPoints);
}

export interface AllocationInput {
  id: string;
  recipientType: RecipientType;
  allocationType: AllocationType;
  fixedAmountMinor: bigint | null;
  percentageBasisPoints: number | null;
}

export interface ResolvedAllocation extends AllocationInput {
  grossAmountMinor: bigint | null;
  netAmountMinor: bigint | null;
}

export function resolveAllocations(
  component: NetGrossPair | null,
  allocations: AllocationInput[],
): { items: ResolvedAllocation[]; complete: boolean; differenceGrossMinor: bigint | null } {
  let items = allocations.map((allocation) => {
    const grossAmountMinor =
      component === null
        ? null
        : allocation.allocationType === 'FIXED'
          ? allocation.fixedAmountMinor
          : allocation.percentageBasisPoints === null
            ? null
            : percentageOfMinor(component.grossMinor, allocation.percentageBasisPoints);
    const netAmountMinor =
      component === null || grossAmountMinor === null || component.grossMinor === 0n
        ? component?.grossMinor === 0n && grossAmountMinor === 0n
          ? 0n
          : null
        : roundHalfUp(component.netMinor * grossAmountMinor, component.grossMinor);
    return { ...allocation, grossAmountMinor, netAmountMinor };
  });
  if (component === null) return { items, complete: false, differenceGrossMinor: null };
  const resolved = items.filter(
    (item): item is ResolvedAllocation & { grossAmountMinor: bigint } =>
      item.grossAmountMinor !== null,
  );
  const allocated = resolved.reduce((sum, item) => sum + item.grossAmountMinor, 0n);
  const difference = component.grossMinor - allocated;
  if (allocations.length > 0 && resolved.length === allocations.length && difference === 0n) {
    const exactNetAmounts = allocateProportionallyExact(
      component.netMinor,
      component.grossMinor,
      resolved.map((item) => item.grossAmountMinor),
    );
    items = items.map((item, index) => ({ ...item, netAmountMinor: exactNetAmounts[index]! }));
  }
  return {
    items,
    complete: allocations.length > 0 && resolved.length === allocations.length && difference === 0n,
    differenceGrossMinor: difference,
  };
}

/**
 * Distributes a net amount proportionally to gross shares without losing a cent.
 * Remaining cents go to the largest fractional remainders, then stable input order.
 */
function allocateProportionallyExact(
  netTotal: bigint,
  grossTotal: bigint,
  grossShares: bigint[],
): bigint[] {
  if (grossTotal === 0n) return grossShares.map(() => 0n);
  const shares = grossShares.map((gross, index) => {
    const numerator = netTotal * gross;
    return {
      index,
      value: numerator / grossTotal,
      remainder: numerator % grossTotal,
    };
  });
  let remaining = netTotal - shares.reduce((sum, share) => sum + share.value, 0n);
  for (const share of [...shares].sort((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  )) {
    if (remaining === 0n) break;
    share.value += 1n;
    remaining -= 1n;
  }
  return shares.sort((left, right) => left.index - right.index).map((share) => share.value);
}

export interface AdditionalRevenueAmountInput {
  calculationType: AdditionalRevenueType;
  inputType: PriceInputType;
  inputAmountMinor: bigint | null;
  percentageRateBasisPoints: number | null;
  taxRateBasisPoints: number;
}

export function resolveAdditionalRevenue(
  input: AdditionalRevenueAmountInput,
  basis: {
    expectedGuests: number | null;
    payingTickets: number;
    ticketBaseNetMinor: bigint;
  },
): (NetGrossPair & { quantity: number | null; basisMinor: bigint | null }) | null {
  if (input.calculationType === 'PERCENT_TICKET_BASE_NET') {
    if (input.percentageRateBasisPoints === null) return null;
    const amount = percentageOfMinor(basis.ticketBaseNetMinor, input.percentageRateBasisPoints);
    return {
      ...convertNetGross(amount, input.inputType, input.taxRateBasisPoints),
      quantity: null,
      basisMinor: basis.ticketBaseNetMinor,
    };
  }
  if (input.inputAmountMinor === null) return null;
  const quantity =
    input.calculationType === 'FIXED'
      ? 1
      : input.calculationType === 'PER_EXPECTED_GUEST'
        ? basis.expectedGuests
        : basis.payingTickets;
  if (quantity === null) return null;
  const unit = convertNetGross(input.inputAmountMinor, input.inputType, input.taxRateBasisPoints);
  return {
    netMinor: unit.netMinor * BigInt(quantity),
    grossMinor: unit.grossMinor * BigInt(quantity),
    quantity,
    basisMinor: null,
  };
}
