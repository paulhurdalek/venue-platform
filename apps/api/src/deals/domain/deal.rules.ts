import { calculateLineTotal } from '../../services/domain/service-calculation.rules.js';
import { percentageOfMinor, roundHalfUp } from '../../revenue/domain/revenue-planning.rules.js';

export const DEAL_STATUSES = ['ENTWURF', 'IN_VERHANDLUNG', 'VEREINBART', 'STORNIERT'] as const;
export const DEAL_COMPONENT_TYPES = [
  'FIXED_RENT',
  'REVENUE_SHARE',
  'MINIMUM_GUARANTEE_SHARE',
] as const;
export const DEAL_BILLING_MODES = ['SEPARATELY_BILLABLE', 'INCLUDED'] as const;
export const DEAL_DISCOUNT_TYPES = ['FIXED', 'PERCENTAGE'] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];
export type DealComponentType = (typeof DEAL_COMPONENT_TYPES)[number];
export type DealBillingMode = (typeof DEAL_BILLING_MODES)[number];
export type DealDiscountType = (typeof DEAL_DISCOUNT_TYPES)[number];

export class DealValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DealValidationError';
  }
}

export interface DiscountInput {
  type: DealDiscountType | null;
  fixedMinor: bigint | null;
  percentageBasisPoints: number | null;
}

export interface DealComponentCalculationInput {
  id: string;
  type: DealComponentType;
  label: string;
  amountNetMinor: bigint | null;
  minimumGuaranteeNetMinor: bigint | null;
  taxRateBasisPoints: number;
  locationShareBasisPoints: number | null;
  counterpartyShareBasisPoints: number | null;
  includeWkz: boolean;
}

export interface DealServiceCalculationInput {
  id: string;
  quantity: string;
  salesUnitPriceNetMinor: bigint;
  internalUnitCostNetMinor: bigint;
  taxRateBasisPoints: number;
  billingMode: DealBillingMode;
  discount: DiscountInput;
}

export interface DealCalculationInput {
  ticketNetRevenueMinor: bigint;
  wkzNetRevenueMinor: bigint;
  components: DealComponentCalculationInput[];
  servicePositions: DealServiceCalculationInput[];
  totalDiscount: DiscountInput;
}

export interface ResolvedDealComponent {
  id: string;
  label: string;
  type: DealComponentType;
  splitBasisMinor: string | null;
  calculatedLocationShareMinor: string | null;
  effectiveLocationAmountMinor: string;
  effectiveGrossMinor: string;
  appliedRule: 'FIXED_RENT' | 'REVENUE_SHARE' | 'MINIMUM_GUARANTEE' | 'CALCULATED_SHARE';
}

export function assertShareInvariant(location: number | null, counterparty: number | null): void {
  if (
    location === null ||
    counterparty === null ||
    !Number.isInteger(location) ||
    !Number.isInteger(counterparty) ||
    location < 0 ||
    counterparty < 0 ||
    location + counterparty !== 10_000
  ) {
    throw new DealValidationError(
      'DEAL_SHARE_MUST_EQUAL_100_PERCENT',
      'Location- und Gegenpartei-Anteil müssen zusammen exakt 100 Prozent ergeben',
    );
  }
}

export function assertStatusTransition(from: DealStatus, to: DealStatus): void {
  const allowed: Record<DealStatus, DealStatus[]> = {
    ENTWURF: ['IN_VERHANDLUNG', 'STORNIERT'],
    IN_VERHANDLUNG: ['ENTWURF', 'VEREINBART', 'STORNIERT'],
    VEREINBART: ['STORNIERT'],
    STORNIERT: [],
  };
  if (from !== to && !allowed[from].includes(to)) {
    throw new DealValidationError(
      'DEAL_STATUS_TRANSITION_INVALID',
      `Der Dealstatus kann nicht von ${from} nach ${to} wechseln`,
    );
  }
}

export function parseMinor(value: string | null | undefined, field: string): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) {
    throw new DealValidationError(
      'INVALID_DEAL_MINOR_UNITS',
      `${field} muss als nichtnegative ganzzahlige Minor Units angegeben werden`,
    );
  }
  return BigInt(value);
}

export function cleanDealText(value: string, field: string, maximum = 200): string {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new DealValidationError('DEAL_TEXT_REQUIRED', `${field} ist erforderlich`);
  if (cleaned.length > maximum) {
    throw new DealValidationError(
      'DEAL_TEXT_TOO_LONG',
      `${field} darf höchstens ${maximum} Zeichen lang sein`,
    );
  }
  return cleaned;
}

export function normalizeDealName(value: string): { name: string; normalizedName: string } {
  const name = cleanDealText(value, 'Der Vorlagenname');
  return { name, normalizedName: name.toLocaleLowerCase('de-DE') };
}

export function resolveDiscount(subtotal: bigint, discount: DiscountInput, field: string): bigint {
  if (subtotal < 0n)
    throw new DealValidationError('INVALID_DEAL_SUBTOTAL', `${field} ist ungültig`);
  if (discount.type === null) {
    if (discount.fixedMinor !== null || discount.percentageBasisPoints !== null) {
      throw new DealValidationError('DEAL_DISCOUNT_INCONSISTENT', `${field} ist unvollständig`);
    }
    return 0n;
  }
  const value =
    discount.type === 'FIXED'
      ? discount.fixedMinor
      : discount.percentageBasisPoints === null
        ? null
        : percentageOfMinor(subtotal, discount.percentageBasisPoints);
  if (value === null || value < 0n || value > subtotal) {
    throw new DealValidationError(
      'DEAL_DISCOUNT_EXCEEDS_SUBTOTAL',
      `${field} darf den separat abrechenbaren Nettobetrag nicht überschreiten`,
    );
  }
  if (discount.type === 'FIXED' && discount.percentageBasisPoints !== null) {
    throw new DealValidationError('DEAL_DISCOUNT_INCONSISTENT', `${field} ist widersprüchlich`);
  }
  if (discount.type === 'PERCENTAGE') {
    if (discount.fixedMinor !== null || discount.percentageBasisPoints! > 10_000) {
      throw new DealValidationError('DEAL_DISCOUNT_INCONSISTENT', `${field} ist widersprüchlich`);
    }
  }
  return value;
}

export function calculateDeal(input: DealCalculationInput) {
  const resolvedComponents: ResolvedDealComponent[] = [];
  let fixedRentNet = 0n;
  let fixedRentGross = 0n;
  let locationShare = 0n;
  for (const component of input.components) {
    if (component.type === 'FIXED_RENT') {
      if (component.amountNetMinor === null) {
        throw new DealValidationError(
          'DEAL_FIXED_RENT_REQUIRED',
          'Für die feste Miete fehlt der Nettobetrag',
        );
      }
      const gross = addTax(component.amountNetMinor, component.taxRateBasisPoints);
      fixedRentNet += component.amountNetMinor;
      fixedRentGross += gross;
      resolvedComponents.push({
        id: component.id,
        label: component.label,
        type: component.type,
        splitBasisMinor: null,
        calculatedLocationShareMinor: null,
        effectiveLocationAmountMinor: component.amountNetMinor.toString(),
        effectiveGrossMinor: gross.toString(),
        appliedRule: 'FIXED_RENT',
      });
      continue;
    }
    assertShareInvariant(
      component.locationShareBasisPoints,
      component.counterpartyShareBasisPoints,
    );
    const basis =
      input.ticketNetRevenueMinor + (component.includeWkz ? input.wkzNetRevenueMinor : 0n);
    const calculated = percentageOfMinor(basis, component.locationShareBasisPoints!);
    const guarantee = component.minimumGuaranteeNetMinor ?? 0n;
    const effective =
      component.type === 'MINIMUM_GUARANTEE_SHARE' && guarantee > calculated
        ? guarantee
        : calculated;
    locationShare += effective;
    resolvedComponents.push({
      id: component.id,
      label: component.label,
      type: component.type,
      splitBasisMinor: basis.toString(),
      calculatedLocationShareMinor: calculated.toString(),
      effectiveLocationAmountMinor: effective.toString(),
      effectiveGrossMinor: addTax(effective, component.taxRateBasisPoints).toString(),
      appliedRule:
        component.type === 'REVENUE_SHARE'
          ? 'REVENUE_SHARE'
          : guarantee > calculated
            ? 'MINIMUM_GUARANTEE'
            : 'CALCULATED_SHARE',
    });
  }

  const billableLines = input.servicePositions
    .filter((position) => position.billingMode === 'SEPARATELY_BILLABLE')
    .map((position) => {
      const subtotal = calculateLineTotal(position.quantity, position.salesUnitPriceNetMinor);
      const discount = resolveDiscount(subtotal, position.discount, 'Der Positionsrabatt');
      return { position, subtotal, discount, netAfterPositionDiscount: subtotal - discount };
    });
  const serviceSubtotal = billableLines.reduce((sum, line) => sum + line.subtotal, 0n);
  const positionDiscounts = billableLines.reduce((sum, line) => sum + line.discount, 0n);
  const afterPositionDiscounts = serviceSubtotal - positionDiscounts;
  const totalDiscount = resolveDiscount(
    afterPositionDiscounts,
    input.totalDiscount,
    'Der Gesamtrabatt',
  );
  const allocatedTotalDiscounts = allocateProportionally(
    totalDiscount,
    billableLines.map((line) => line.netAfterPositionDiscount),
  );
  const serviceNet = afterPositionDiscounts - totalDiscount;
  const serviceGross = billableLines.reduce((sum, line, index) => {
    const taxableNet = line.netAfterPositionDiscount - allocatedTotalDiscounts[index]!;
    return sum + addTax(taxableNet, line.position.taxRateBasisPoints);
  }, 0n);
  const internalCosts = input.servicePositions.reduce(
    (sum, position) =>
      sum + calculateLineTotal(position.quantity, position.internalUnitCostNetMinor),
    0n,
  );
  const customerNet = fixedRentNet + serviceNet;
  return {
    ticketNetRevenueMinor: input.ticketNetRevenueMinor.toString(),
    wkzNetRevenueMinor: input.wkzNetRevenueMinor.toString(),
    fixedRentNetMinor: fixedRentNet.toString(),
    billableServiceSubtotalNetMinor: serviceSubtotal.toString(),
    positionDiscountNetMinor: positionDiscounts.toString(),
    totalDiscountNetMinor: totalDiscount.toString(),
    billableServicesNetMinor: serviceNet.toString(),
    customerAmountNetMinor: customerNet.toString(),
    customerAmountGrossMinor: (fixedRentGross + serviceGross).toString(),
    expectedLocationShareNetMinor: locationShare.toString(),
    internalCostNetMinor: internalCosts.toString(),
    expectedOperatingResultNetMinor: (customerNet + locationShare - internalCosts).toString(),
    components: resolvedComponents,
  };
}

function addTax(net: bigint, taxRateBasisPoints: number): bigint {
  if (
    !Number.isInteger(taxRateBasisPoints) ||
    taxRateBasisPoints < 0 ||
    taxRateBasisPoints > 100_000
  ) {
    throw new DealValidationError('INVALID_DEAL_TAX_RATE', 'Der Umsatzsteuersatz ist ungültig');
  }
  return roundHalfUp(net * BigInt(10_000 + taxRateBasisPoints), 10_000n);
}

function allocateProportionally(total: bigint, weights: bigint[]): bigint[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0n);
  if (total === 0n || weightTotal === 0n) return weights.map(() => 0n);
  let allocated = 0n;
  return weights.map((weight, index) => {
    const value = index === weights.length - 1 ? total - allocated : (total * weight) / weightTotal;
    allocated += value;
    return value;
  });
}

export function isWkzName(value: string): boolean {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/[\s_-]+/g, '');
  return normalized === 'wkz' || normalized === 'werbekostenzuschuss';
}
