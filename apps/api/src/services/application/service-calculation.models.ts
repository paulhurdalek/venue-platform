import type {
  CalculationStatus,
  CostStatus,
  ServiceUnit,
} from '../domain/service-calculation.rules.js';

export type EntityStatus = 'ACTIVE' | 'ARCHIVED';

export interface ServiceCategoryRecord {
  id: string;
  organizationId: string;
  name: string;
  normalizedName: string;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceProviderPriceRecord {
  id: string;
  organizationId: string;
  serviceId: string;
  businessPartnerId: string;
  businessPartnerName: string;
  businessPartnerStatus: EntityStatus;
  purchasePriceMinor?: string | null;
  currency?: 'EUR';
  preferred: boolean;
  internalNote?: string | null;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: string;
  organizationId: string;
  categoryId: string;
  categoryName: string;
  categoryStatus: EntityStatus;
  name: string;
  normalizedName: string;
  unit: ServiceUnit;
  defaultSalesPriceMinor?: string | null;
  currency?: 'EUR';
  internalNote?: string | null;
  preferredProvider?: ServiceProviderPriceRecord | null;
  providerPrices?: ServiceProviderPriceRecord[];
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListQuery {
  q?: string;
  status: EntityStatus | 'ALL';
  limit: number;
  offset: number;
}

export interface ServiceListQuery extends ListQuery {
  categoryId?: string;
}

export interface EventFormatServiceRecord {
  id: string;
  organizationId: string;
  eventFormatId: string;
  serviceId: string;
  serviceName: string;
  serviceStatus: EntityStatus;
  serviceVersion: number;
  categoryName: string;
  unit: ServiceUnit;
  quantity: string;
  providerBusinessPartnerId: string | null;
  providerName: string | null;
  providerStatus: EntityStatus | null;
  purchasePriceOverrideMinor?: string | null;
  salesPriceOverrideMinor?: string | null;
  resolvedPurchasePriceMinor?: string | null;
  resolvedSalesPriceMinor?: string | null;
  currency?: 'EUR';
  sortOrder: number;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventPositionSource = 'EVENT_FORMAT' | 'SERVICE_CATALOG' | 'CUSTOM';

export interface EventServicePositionRecord {
  id: string;
  organizationId: string;
  eventId: string;
  calculationId: string;
  source: EventPositionSource;
  sourceServiceId: string | null;
  sourceServiceVersion: number | null;
  sourceEventFormatServiceId: string | null;
  sourceEventFormatServiceVersion: number | null;
  name: string;
  categoryName: string;
  unit: ServiceUnit;
  quantity: string;
  providerBusinessPartnerId: string | null;
  providerName: string | null;
  purchaseUnitPriceMinor?: string | null;
  purchaseTotalMinor?: string | null;
  salesUnitPriceMinor?: string | null;
  salesTotalMinor?: string | null;
  currency?: 'EUR';
  costStatus: CostStatus;
  sortOrder: number;
  note: string | null;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventPositionCatalogPricePreviewRecord {
  positionId: string;
  positionVersion: number;
  source: Exclude<EventPositionSource, 'CUSTOM'>;
  providerBusinessPartnerId: string | null;
  providerName: string | null;
  providerWillBeApplied: boolean;
  purchaseUnitPriceMinor?: string | null;
  purchaseWillBeApplied?: boolean;
  salesUnitPriceMinor?: string | null;
  salesWillBeApplied?: boolean;
}

export interface BookingCostRecord {
  id: string;
  bookingId: string;
  kind: 'FEE' | 'TRAVEL' | 'HOTEL_BUYOUT';
  label: string;
  artistName: string;
  bookingStatus: string;
  costStatus: CostStatus;
  amountMinor?: string;
  currency?: 'EUR';
}

export interface CalculationStatusHistoryRecord {
  id: string;
  previousStatus: CalculationStatus;
  newStatus: CalculationStatus;
  actorName: string;
  note: string | null;
  reason: string | null;
  changedSourceType: string | null;
  changedSourceId: string | null;
  changedAt: string;
}

export interface CalculationTotals {
  estimatedCostMinor?: string;
  committedCostMinor?: string;
  plannedCostMinor?: string;
  servicePurchaseValueMinor?: string;
  serviceSalesValueMinor?: string;
  serviceMarginMinor?: string;
  incomplete: boolean;
  missingPurchasePricePositionIds: string[];
  missingSalesPricePositionIds: string[];
}

export interface EventCalculationRecord {
  id: string;
  organizationId: string;
  eventId: string;
  eventName: string;
  locationId: string;
  status: CalculationStatus;
  version: number;
  approvedAt: string | null;
  approvedByName: string | null;
  positions: EventServicePositionRecord[];
  bookingCosts: BookingCostRecord[];
  totals: CalculationTotals;
  history: CalculationStatusHistoryRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CategoryValues {
  name: string;
  normalizedName: string;
}

export interface ServiceValues {
  categoryId: string;
  name: string;
  normalizedName: string;
  unit: ServiceUnit;
  defaultSalesPriceMinor: bigint | null;
  internalNote: string | null;
}

export interface ProviderPriceValues {
  businessPartnerId: string;
  purchasePriceMinor: bigint | null;
  preferred: boolean;
  internalNote: string | null;
}

export interface FormatServiceValues {
  serviceId: string;
  quantity: string;
  providerBusinessPartnerId: string | null;
  purchasePriceOverrideMinor: bigint | null;
  salesPriceOverrideMinor: bigint | null;
  sortOrder: number;
}

export interface EventPositionValues {
  sourceServiceId: string | null;
  name: string | null;
  categoryName: string | null;
  unit: ServiceUnit | null;
  quantity: string;
  providerBusinessPartnerId: string | null;
  purchaseUnitPriceMinor: bigint | null | undefined;
  salesUnitPriceMinor: bigint | null | undefined;
  costStatus: CostStatus;
  sortOrder: number;
  note: string | null;
}
