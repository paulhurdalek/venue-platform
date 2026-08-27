import type {
  AdditionalRevenueType,
  AllocationType,
  PriceInputType,
  RecipientType,
  RevenueAmountType,
} from '../domain/revenue-planning.rules.js';

export type RevenueEntityStatus = 'ACTIVE' | 'ARCHIVED';
export type RevenueConfirmationStatus = 'PLANNED' | 'CONFIRMED';

export interface AllocationValues {
  recipientType: RecipientType;
  artistId: string | null;
  businessPartnerId: string | null;
  externalRecipientName: string | null;
  allocationType: AllocationType;
  percentageBasisPoints: number | null;
  fixedAmountMinor: bigint | null;
  sortOrder: number;
}

export interface ComponentValues {
  name: string;
  amountType: RevenueAmountType;
  percentageRateBasisPoints: number | null;
  inputType: PriceInputType;
  inputAmountMinor: bigint | null;
  taxRateBasisPoints: number;
  taxRateTemplateId: string;
  taxRateTemplateVersion: number;
  taxRateNameSnapshot: string;
  guestPays: boolean;
  sortOrder: number;
  allocations: AllocationValues[];
}

export interface TicketTierValues {
  name: string;
  expectedQuantity: number;
  baseInputType: PriceInputType | null;
  baseInputMinor: bigint | null;
  baseNetUnitMinor: bigint | null;
  baseGrossUnitMinor: bigint | null;
  baseTaxRateBasisPoints: number | null;
  baseTaxRateTemplateId: string | null;
  baseTaxRateTemplateVersion: number | null;
  baseTaxRateNameSnapshot: string | null;
  sortOrder: number;
  sourceTicketProviderTemplateId: string | null;
  components: ComponentValues[];
}

export interface AdditionalRevenueValues {
  name: string;
  calculationType: AdditionalRevenueType;
  inputType: PriceInputType;
  inputAmountMinor: bigint | null;
  percentageRateBasisPoints: number | null;
  taxRateBasisPoints: number;
  taxRateTemplateId: string;
  taxRateTemplateVersion: number;
  taxRateNameSnapshot: string;
  confirmationStatus: RevenueConfirmationStatus;
  note: string | null;
  sortOrder: number;
}

export interface RevenueAllocationRecord {
  id: string;
  recipientType: RecipientType;
  recipientId: string | null;
  recipientName: string;
  allocationType: AllocationType;
  percentageBasisPoints: number | null;
  fixedAmountMinor: string | null;
  resolvedNetUnitMinor: string | null;
  resolvedGrossUnitMinor: string | null;
  sortOrder: number;
  status: RevenueEntityStatus;
  version: number;
}

export interface TicketComponentRecord {
  id: string;
  name: string;
  amountType: RevenueAmountType;
  percentageBasis: 'TICKET_BASE_GROSS' | null;
  percentageRateBasisPoints: number | null;
  inputType: PriceInputType;
  inputAmountMinor: string | null;
  taxRateBasisPoints: number;
  taxRateTemplateId: string | null;
  taxRateTemplateVersion: number | null;
  taxRateNameSnapshot: string | null;
  guestPays: boolean;
  netUnitMinor: string | null;
  grossUnitMinor: string | null;
  allocationComplete: boolean;
  allocationDifferenceGrossMinor: string | null;
  allocations: RevenueAllocationRecord[];
  sortOrder: number;
  status: RevenueEntityStatus;
  version: number;
}

export interface TicketTierRecord {
  id: string;
  name: string;
  expectedQuantity: number;
  baseInputType: PriceInputType | null;
  baseInputMinor: string | null;
  baseNetUnitMinor: string | null;
  baseGrossUnitMinor: string | null;
  baseTaxRateBasisPoints: number | null;
  baseTaxRateTemplateId: string | null;
  baseTaxRateTemplateVersion: number | null;
  baseTaxRateNameSnapshot: string | null;
  sourceTicketProviderTemplateId: string | null;
  sourceTicketProviderTemplateVersion: number | null;
  sourceTicketProviderNameSnapshot: string | null;
  endCustomerUnitGrossMinor: string | null;
  totalBaseNetMinor: string | null;
  totalBaseGrossMinor: string | null;
  totalEndCustomerGrossMinor: string | null;
  components: TicketComponentRecord[];
  sortOrder: number;
  status: RevenueEntityStatus;
  version: number;
}

export interface AdditionalRevenueRecord {
  id: string;
  name: string;
  calculationType: AdditionalRevenueType;
  inputType: PriceInputType;
  inputAmountMinor: string | null;
  percentageRateBasisPoints: number | null;
  taxRateBasisPoints: number;
  taxRateTemplateId: string | null;
  taxRateTemplateVersion: number | null;
  taxRateNameSnapshot: string | null;
  confirmationStatus: RevenueConfirmationStatus;
  note: string | null;
  resolvedQuantity: number | null;
  calculationBasisMinor: string | null;
  totalNetMinor: string | null;
  totalGrossMinor: string | null;
  sortOrder: number;
  status: RevenueEntityStatus;
  version: number;
}

export interface RevenueApprovalBlocker {
  code:
    | 'TICKET_BASE_PRICE_MISSING'
    | 'COMPONENT_AMOUNT_MISSING'
    | 'COMPONENT_ALLOCATION_INCOMPLETE'
    | 'EXPECTED_GUEST_COUNT_MISSING'
    | 'ADDITIONAL_REVENUE_AMOUNT_MISSING';
  message: string;
  targetType: 'TICKET_TIER' | 'TICKET_COMPONENT' | 'ADDITIONAL_REVENUE' | 'EVENT';
  targetId: string;
}

export interface RevenuePlanTotals {
  expectedGuests: number | null;
  expectedTickets: number;
  expectedPayingTickets: number;
  ticketEndCustomerGrossMinor: string;
  ticketBaseNetMinor: string;
  ticketBaseGrossMinor: string;
  ownTicketRevenueNetMinor: string;
  ownTicketRevenueGrossMinor: string;
  artistPartnerShareNetMinor: string;
  artistPartnerShareGrossMinor: string;
  externalPassThroughNetMinor: string;
  externalPassThroughGrossMinor: string;
  additionalRevenueNetMinor: string;
  additionalRevenueGrossMinor: string;
  phase7PlannedCostNetMinor: string;
  operatingResultNetMinor: string;
  costBasisLabel: string;
  incomplete: boolean;
  approvalBlockers: RevenueApprovalBlocker[];
}

export interface RevenuePlanRecord {
  calculationId: string;
  calculationVersion: number;
  calculationStatus: 'DRAFT' | 'REVIEW' | 'APPROVED';
  eventId: string;
  eventVersion: number;
  eventName: string;
  expectedGuestCount: number | null;
  currency: 'EUR';
  ticketTiers: TicketTierRecord[];
  additionalRevenues: AdditionalRevenueRecord[];
  totals: RevenuePlanTotals;
}
