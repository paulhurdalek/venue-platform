import type { AccessContext } from '../../security/access.types.js';
import type { CalculationStatus } from '../domain/service-calculation.rules.js';
import type {
  CategoryValues,
  EventCalculationRecord,
  EventFormatServiceRecord,
  EventPositionCatalogPricePreviewRecord,
  EventPositionValues,
  EventServicePositionRecord,
  FormatServiceValues,
  ListQuery,
  Page,
  ProviderPriceValues,
  ServiceCategoryRecord,
  ServiceListQuery,
  ServiceProviderPriceRecord,
  ServiceRecord,
  ServiceValues,
} from './service-calculation.models.js';

export const SERVICE_CALCULATION_REPOSITORY = Symbol('SERVICE_CALCULATION_REPOSITORY');

export interface ServiceCalculationRepository {
  listCategories(organizationId: string, query: ListQuery): Promise<Page<ServiceCategoryRecord>>;
  findCategory(
    organizationId: string,
    categoryId: string,
  ): Promise<ServiceCategoryRecord | undefined>;
  createCategory(access: AccessContext, values: CategoryValues): Promise<ServiceCategoryRecord>;
  updateCategory(
    access: AccessContext,
    categoryId: string,
    version: number,
    values: CategoryValues,
  ): Promise<ServiceCategoryRecord | undefined>;
  setCategoryStatus(
    access: AccessContext,
    categoryId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<ServiceCategoryRecord | undefined>;

  listServices(organizationId: string, query: ServiceListQuery): Promise<Page<ServiceRecord>>;
  findService(organizationId: string, serviceId: string): Promise<ServiceRecord | undefined>;
  createService(access: AccessContext, values: ServiceValues): Promise<ServiceRecord>;
  updateService(
    access: AccessContext,
    serviceId: string,
    version: number,
    values: ServiceValues,
  ): Promise<ServiceRecord | undefined>;
  setServiceStatus(
    access: AccessContext,
    serviceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<ServiceRecord | undefined>;

  createProviderPrice(
    access: AccessContext,
    serviceId: string,
    values: ProviderPriceValues,
  ): Promise<ServiceProviderPriceRecord>;
  findProviderPrice(
    organizationId: string,
    providerPriceId: string,
  ): Promise<ServiceProviderPriceRecord | undefined>;
  updateProviderPrice(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    values: ProviderPriceValues,
  ): Promise<ServiceProviderPriceRecord | undefined>;
  setProviderPriceStatus(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<ServiceProviderPriceRecord | undefined>;

  listFormatServices(
    organizationId: string,
    eventFormatId: string,
    includeArchived: boolean,
  ): Promise<EventFormatServiceRecord[] | undefined>;
  createFormatService(
    access: AccessContext,
    eventFormatId: string,
    values: FormatServiceValues,
  ): Promise<EventFormatServiceRecord>;
  findFormatService(
    organizationId: string,
    formatServiceId: string,
  ): Promise<EventFormatServiceRecord | undefined>;
  updateFormatService(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    values: FormatServiceValues,
  ): Promise<EventFormatServiceRecord | undefined>;
  setFormatServiceStatus(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<EventFormatServiceRecord | undefined>;

  findCalculation(
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<EventCalculationRecord | undefined>;
  addEventPosition(
    access: AccessContext,
    eventId: string,
    values: EventPositionValues,
  ): Promise<EventServicePositionRecord>;
  findEventPosition(
    organizationId: string,
    positionId: string,
    locationIds?: string[],
  ): Promise<EventServicePositionRecord | undefined>;
  updateEventPosition(
    access: AccessContext,
    positionId: string,
    version: number,
    values: EventPositionValues,
  ): Promise<EventServicePositionRecord | undefined>;
  previewEventPositionCatalogPrices(
    access: AccessContext,
    positionId: string,
  ): Promise<EventPositionCatalogPricePreviewRecord | undefined>;
  applyEventPositionCatalogPrices(
    access: AccessContext,
    positionId: string,
    version: number,
    apply: { purchase: boolean; sales: boolean },
  ): Promise<EventServicePositionRecord | undefined>;
  setEventPositionStatus(
    access: AccessContext,
    positionId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<EventServicePositionRecord | undefined>;
  setCalculationStatus(
    access: AccessContext,
    eventId: string,
    version: number,
    status: CalculationStatus,
    note: string | null,
  ): Promise<EventCalculationRecord | undefined>;
}

export class ServiceCalculationPersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: 'CONFLICT' | 'REFERENCE' = 'CONFLICT',
  ) {
    super(message);
    this.name = 'ServiceCalculationPersistenceError';
  }
}
