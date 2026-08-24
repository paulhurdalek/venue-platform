import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PERMISSIONS } from '../../security/security.constants.js';
import type { AccessContext } from '../../security/access.types.js';
import {
  assertCalculationTransition,
  cleanName,
  cleanNullable,
  normalizeName,
  normalizeQuantity,
  parseMinorUnits,
  ServiceCalculationValidationError,
  type CalculationStatus,
  type CostStatus,
  type ServiceUnit,
} from '../domain/service-calculation.rules.js';
import type {
  EventCalculationRecord,
  EventFormatServiceRecord,
  EventPositionCatalogPricePreviewRecord,
  EventPositionValues,
  FormatServiceValues,
  ListQuery,
  ProviderPriceValues,
  ServiceListQuery,
  ServiceRecord,
  ServiceValues,
} from './service-calculation.models.js';
import {
  SERVICE_CALCULATION_REPOSITORY,
  ServiceCalculationPersistenceError,
  type ServiceCalculationRepository,
} from './service-calculation.repository.js';

export interface CategoryInput {
  name?: string;
}

export interface ServiceInput {
  categoryId?: string;
  name?: string;
  unit?: ServiceUnit;
  defaultSalesPriceMinor?: string | null;
  internalNote?: string | null;
}

export interface ProviderPriceInput {
  businessPartnerId?: string;
  purchasePriceMinor?: string | null;
  preferred?: boolean;
  internalNote?: string | null;
}

export interface FormatServiceInput {
  serviceId?: string;
  quantity?: string;
  providerBusinessPartnerId?: string | null;
  purchasePriceOverrideMinor?: string | null;
  salesPriceOverrideMinor?: string | null;
  sortOrder?: number;
}

export interface EventPositionInput {
  sourceServiceId?: string | null;
  name?: string;
  categoryName?: string;
  unit?: ServiceUnit;
  quantity?: string;
  providerBusinessPartnerId?: string | null;
  purchaseUnitPriceMinor?: string | null;
  salesUnitPriceMinor?: string | null;
  costStatus?: CostStatus;
  sortOrder?: number;
  note?: string | null;
}

@Injectable()
export class ServiceCalculationService {
  constructor(
    @Inject(SERVICE_CALCULATION_REPOSITORY)
    private readonly repository: ServiceCalculationRepository,
  ) {}

  listCategories(organizationId: string, query: ListQuery) {
    return this.repository.listCategories(organizationId, query);
  }

  async findCategory(organizationId: string, categoryId: string) {
    return this.requireRecord(
      await this.repository.findCategory(organizationId, categoryId),
      'SERVICE_CATEGORY_NOT_FOUND',
      'Leistungskategorie nicht gefunden',
    );
  }

  async createCategory(access: AccessContext, input: CategoryInput) {
    try {
      const name = cleanName(input.name ?? '', 'Der Kategoriename', 160);
      return await this.repository.createCategory(access, {
        name,
        normalizedName: normalizeName(name),
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateCategory(
    access: AccessContext,
    categoryId: string,
    version: number,
    input: CategoryInput,
  ) {
    if (input.name === undefined) this.noChanges();
    try {
      const current = await this.findCategory(access.organizationId, categoryId);
      this.assertVersion(current.version, version);
      const name = cleanName(input.name!, 'Der Kategoriename', 160);
      const updated = await this.repository.updateCategory(access, categoryId, version, {
        name,
        normalizedName: normalizeName(name),
      });
      if (!updated) this.versionConflict();
      return updated!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setCategoryStatus(
    access: AccessContext,
    categoryId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const current = await this.findCategory(access.organizationId, categoryId);
      this.assertVersion(current.version, version);
      if (current.status === status) this.noChanges();
      const updated = await this.repository.setCategoryStatus(access, categoryId, version, status);
      if (!updated) this.versionConflict();
      return updated!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async listServices(access: AccessContext, query: ServiceListQuery) {
    const page = await this.repository.listServices(access.organizationId, query);
    return { ...page, items: page.items.map((item) => this.redactService(access, item)) };
  }

  async findService(access: AccessContext, serviceId: string) {
    const record = this.requireRecord(
      await this.repository.findService(access.organizationId, serviceId),
      'SERVICE_NOT_FOUND',
      'Leistung nicht gefunden',
    );
    return this.redactService(access, record);
  }

  async createService(access: AccessContext, input: ServiceInput) {
    this.assertFinancialWrites(access, input);
    try {
      const record = await this.repository.createService(access, this.serviceValues(input));
      return this.redactService(access, record);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateService(
    access: AccessContext,
    serviceId: string,
    version: number,
    input: ServiceInput,
  ) {
    if (Object.values(input).every((value) => value === undefined)) this.noChanges();
    this.assertFinancialWrites(access, input);
    try {
      const current = this.requireRecord(
        await this.repository.findService(access.organizationId, serviceId),
        'SERVICE_NOT_FOUND',
        'Leistung nicht gefunden',
      );
      this.assertVersion(current.version, version);
      const values = this.serviceValues(input, current);
      const updated = await this.repository.updateService(access, serviceId, version, values);
      if (!updated) this.versionConflict();
      return this.redactService(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setServiceStatus(
    access: AccessContext,
    serviceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const current = this.requireRecord(
        await this.repository.findService(access.organizationId, serviceId),
        'SERVICE_NOT_FOUND',
        'Leistung nicht gefunden',
      );
      this.assertVersion(current.version, version);
      if (current.status === status) this.noChanges();
      const updated = await this.repository.setServiceStatus(access, serviceId, version, status);
      if (!updated) this.versionConflict();
      return this.redactService(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async createProviderPrice(access: AccessContext, serviceId: string, input: ProviderPriceInput) {
    this.assertPurchasePermission(access);
    try {
      return await this.repository.createProviderPrice(
        access,
        serviceId,
        this.providerValues(input),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateProviderPrice(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    input: ProviderPriceInput,
  ) {
    this.assertPurchasePermission(access);
    if (Object.values(input).every((value) => value === undefined)) this.noChanges();
    try {
      const current = this.requireRecord(
        await this.repository.findProviderPrice(access.organizationId, providerPriceId),
        'SERVICE_PROVIDER_PRICE_NOT_FOUND',
        'Dienstleisterpreis nicht gefunden',
      );
      this.assertVersion(current.version, version);
      const updated = await this.repository.updateProviderPrice(
        access,
        providerPriceId,
        version,
        this.providerValues(input, current),
      );
      if (!updated) this.versionConflict();
      return updated!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setProviderPriceStatus(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    this.assertPurchasePermission(access);
    try {
      const current = this.requireRecord(
        await this.repository.findProviderPrice(access.organizationId, providerPriceId),
        'SERVICE_PROVIDER_PRICE_NOT_FOUND',
        'Dienstleisterpreis nicht gefunden',
      );
      this.assertVersion(current.version, version);
      if (current.status === status) this.noChanges();
      const updated = await this.repository.setProviderPriceStatus(
        access,
        providerPriceId,
        version,
        status,
      );
      if (!updated) this.versionConflict();
      return updated!;
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async listFormatServices(access: AccessContext, eventFormatId: string, includeArchived: boolean) {
    const records = this.requireRecord(
      await this.repository.listFormatServices(
        access.organizationId,
        eventFormatId,
        includeArchived,
      ),
      'EVENT_FORMAT_NOT_FOUND',
      'Veranstaltungsformat nicht gefunden',
    );
    return records.map((record) => this.redactFormatService(access, record));
  }

  async createFormatService(
    access: AccessContext,
    eventFormatId: string,
    input: FormatServiceInput,
  ) {
    this.assertFinancialWrites(access, input);
    try {
      return this.redactFormatService(
        access,
        await this.repository.createFormatService(access, eventFormatId, this.formatValues(input)),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateFormatService(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    input: FormatServiceInput,
  ) {
    if (Object.values(input).every((value) => value === undefined)) this.noChanges();
    this.assertFinancialWrites(access, input);
    try {
      const current = this.requireRecord(
        await this.repository.findFormatService(access.organizationId, formatServiceId),
        'EVENT_FORMAT_SERVICE_NOT_FOUND',
        'Leistungsvorgabe nicht gefunden',
      );
      this.assertVersion(current.version, version);
      const updated = await this.repository.updateFormatService(
        access,
        formatServiceId,
        version,
        this.formatValues(input, current),
      );
      if (!updated) this.versionConflict();
      return this.redactFormatService(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setFormatServiceStatus(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const current = this.requireRecord(
        await this.repository.findFormatService(access.organizationId, formatServiceId),
        'EVENT_FORMAT_SERVICE_NOT_FOUND',
        'Leistungsvorgabe nicht gefunden',
      );
      this.assertVersion(current.version, version);
      if (current.status === status) this.noChanges();
      const updated = await this.repository.setFormatServiceStatus(
        access,
        formatServiceId,
        version,
        status,
      );
      if (!updated) this.versionConflict();
      return this.redactFormatService(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async getCalculation(access: AccessContext, eventId: string) {
    const calculation = this.requireRecord(
      await this.repository.findCalculation(
        access.organizationId,
        eventId,
        access.locationScope === 'SELECTED' ? access.locationIds : undefined,
      ),
      'EVENT_CALCULATION_NOT_FOUND',
      'Veranstaltungskalkulation nicht gefunden',
    );
    return this.redactCalculation(access, calculation);
  }

  async addEventPosition(access: AccessContext, eventId: string, input: EventPositionInput) {
    this.assertFinancialWrites(access, input);
    try {
      const created = await this.repository.addEventPosition(
        access,
        eventId,
        this.eventPositionValues(input),
      );
      return this.redactPosition(access, created);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async updateEventPosition(
    access: AccessContext,
    positionId: string,
    version: number,
    input: EventPositionInput,
  ) {
    if (Object.values(input).every((value) => value === undefined)) this.noChanges();
    this.assertFinancialWrites(access, input);
    try {
      const current = this.requireRecord(
        await this.repository.findEventPosition(
          access.organizationId,
          positionId,
          access.locationScope === 'SELECTED' ? access.locationIds : undefined,
        ),
        'EVENT_SERVICE_POSITION_NOT_FOUND',
        'Veranstaltungsposition nicht gefunden',
      );
      this.assertVersion(current.version, version);
      const updated = await this.repository.updateEventPosition(
        access,
        positionId,
        version,
        this.eventPositionValues(input, current),
      );
      if (!updated) this.versionConflict();
      return this.redactPosition(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async previewEventPositionCatalogPrices(access: AccessContext, positionId: string) {
    try {
      const preview = this.requireRecord(
        await this.repository.previewEventPositionCatalogPrices(access, positionId),
        'EVENT_SERVICE_POSITION_NOT_FOUND',
        'Veranstaltungsposition nicht gefunden',
      );
      return this.redactCatalogPricePreview(access, preview);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async applyEventPositionCatalogPrices(
    access: AccessContext,
    positionId: string,
    version: number,
  ) {
    try {
      const current = this.requireRecord(
        await this.repository.findEventPosition(
          access.organizationId,
          positionId,
          access.locationScope === 'SELECTED' ? access.locationIds : undefined,
        ),
        'EVENT_SERVICE_POSITION_NOT_FOUND',
        'Veranstaltungsposition nicht gefunden',
      );
      this.assertVersion(current.version, version);
      if (current.source === 'CUSTOM') {
        throw new ServiceCalculationPersistenceError(
          'CATALOG_PRICE_REFRESH_UNAVAILABLE',
          'Individuelle Positionen haben keine Katalogpreise',
          'REFERENCE',
        );
      }
      const missingPurchase = current.purchaseUnitPriceMinor == null;
      const missingSales = current.salesUnitPriceMinor == null;
      const applyPurchase =
        missingPurchase && access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE);
      const applySales =
        missingSales && access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES);
      if (!applyPurchase && !applySales) {
        if (missingPurchase || missingSales) {
          throw new ForbiddenException({
            code: 'CATALOG_PRICE_PERMISSION_REQUIRED',
            message: 'Für die fehlenden Preise fehlt die Berechtigung',
          });
        }
        this.noChanges();
      }
      const updated = await this.repository.applyEventPositionCatalogPrices(
        access,
        positionId,
        version,
        { purchase: applyPurchase, sales: applySales },
      );
      if (!updated) this.versionConflict();
      return this.redactPosition(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setEventPositionStatus(
    access: AccessContext,
    positionId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    try {
      const current = this.requireRecord(
        await this.repository.findEventPosition(
          access.organizationId,
          positionId,
          access.locationScope === 'SELECTED' ? access.locationIds : undefined,
        ),
        'EVENT_SERVICE_POSITION_NOT_FOUND',
        'Veranstaltungsposition nicht gefunden',
      );
      this.assertVersion(current.version, version);
      if (current.status === status) this.noChanges();
      const updated = await this.repository.setEventPositionStatus(
        access,
        positionId,
        version,
        status,
      );
      if (!updated) this.versionConflict();
      return this.redactPosition(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setCalculationStatus(
    access: AccessContext,
    eventId: string,
    version: number,
    status: CalculationStatus,
    note?: string | null,
  ) {
    if (status === 'APPROVED') {
      this.requirePermission(
        access,
        PERMISSIONS.CALCULATIONS_APPROVE,
        'CALCULATION_APPROVE_PERMISSION_REQUIRED',
      );
    } else {
      this.requirePermission(
        access,
        PERMISSIONS.CALCULATIONS_WRITE,
        'CALCULATION_WRITE_PERMISSION_REQUIRED',
      );
    }
    try {
      const current = this.requireRecord(
        await this.repository.findCalculation(
          access.organizationId,
          eventId,
          access.locationScope === 'SELECTED' ? access.locationIds : undefined,
        ),
        'EVENT_CALCULATION_NOT_FOUND',
        'Veranstaltungskalkulation nicht gefunden',
      );
      this.assertVersion(current.version, version);
      assertCalculationTransition(current.status, status);
      const updated = await this.repository.setCalculationStatus(
        access,
        eventId,
        version,
        status,
        cleanNullable(note),
      );
      if (!updated) this.versionConflict();
      return this.redactCalculation(access, updated!);
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  private serviceValues(input: ServiceInput, current?: ServiceRecord): ServiceValues {
    const name = cleanName(input.name ?? current?.name ?? '', 'Die Leistungsbezeichnung', 200);
    const categoryId = input.categoryId ?? current?.categoryId;
    const unit = input.unit ?? current?.unit;
    if (!categoryId || !unit) {
      throw new ServiceCalculationValidationError(
        'SERVICE_FIELDS_REQUIRED',
        'Kategorie und Abrechnungseinheit sind erforderlich',
      );
    }
    return {
      categoryId,
      name,
      normalizedName: normalizeName(name),
      unit,
      defaultSalesPriceMinor:
        input.defaultSalesPriceMinor === undefined
          ? current?.defaultSalesPriceMinor === undefined
            ? null
            : parseMinorUnits(current.defaultSalesPriceMinor, 'Der Verkaufspreis')
          : parseMinorUnits(input.defaultSalesPriceMinor, 'Der Verkaufspreis'),
      internalNote:
        input.internalNote === undefined
          ? (current?.internalNote ?? null)
          : cleanNullable(input.internalNote),
    };
  }

  private providerValues(
    input: ProviderPriceInput,
    current?: {
      businessPartnerId: string;
      purchasePriceMinor?: string | null;
      preferred: boolean;
      internalNote?: string | null;
    },
  ): ProviderPriceValues {
    const businessPartnerId = input.businessPartnerId ?? current?.businessPartnerId;
    if (!businessPartnerId) {
      throw new ServiceCalculationValidationError(
        'BUSINESS_PARTNER_REQUIRED',
        'Ein Dienstleister ist erforderlich',
      );
    }
    return {
      businessPartnerId,
      purchasePriceMinor:
        input.purchasePriceMinor === undefined
          ? parseMinorUnits(current?.purchasePriceMinor, 'Der Einkaufspreis')
          : parseMinorUnits(input.purchasePriceMinor, 'Der Einkaufspreis'),
      preferred: input.preferred ?? current?.preferred ?? false,
      internalNote:
        input.internalNote === undefined
          ? (current?.internalNote ?? null)
          : cleanNullable(input.internalNote),
    };
  }

  private formatValues(
    input: FormatServiceInput,
    current?: {
      serviceId: string;
      quantity: string;
      providerBusinessPartnerId: string | null;
      purchasePriceOverrideMinor?: string | null;
      salesPriceOverrideMinor?: string | null;
      sortOrder: number;
    },
  ): FormatServiceValues {
    const serviceId = input.serviceId ?? current?.serviceId;
    if (!serviceId) {
      throw new ServiceCalculationValidationError(
        'SERVICE_REQUIRED',
        'Eine Leistung ist erforderlich',
      );
    }
    return {
      serviceId,
      quantity: normalizeQuantity(input.quantity ?? current?.quantity ?? ''),
      providerBusinessPartnerId:
        input.providerBusinessPartnerId === undefined
          ? (current?.providerBusinessPartnerId ?? null)
          : input.providerBusinessPartnerId,
      purchasePriceOverrideMinor:
        input.purchasePriceOverrideMinor === undefined
          ? parseMinorUnits(current?.purchasePriceOverrideMinor, 'Der Einkaufs-Override')
          : parseMinorUnits(input.purchasePriceOverrideMinor, 'Der Einkaufs-Override'),
      salesPriceOverrideMinor:
        input.salesPriceOverrideMinor === undefined
          ? parseMinorUnits(current?.salesPriceOverrideMinor, 'Der Verkaufs-Override')
          : parseMinorUnits(input.salesPriceOverrideMinor, 'Der Verkaufs-Override'),
      sortOrder: input.sortOrder ?? current?.sortOrder ?? 1,
    };
  }

  private eventPositionValues(
    input: EventPositionInput,
    current?: {
      sourceServiceId: string | null;
      name: string;
      categoryName: string;
      unit: ServiceUnit;
      quantity: string;
      providerBusinessPartnerId: string | null;
      purchaseUnitPriceMinor?: string | null;
      salesUnitPriceMinor?: string | null;
      costStatus: CostStatus;
      sortOrder: number;
      note: string | null;
    },
  ): EventPositionValues {
    const sourceServiceId =
      input.sourceServiceId === undefined
        ? (current?.sourceServiceId ?? null)
        : input.sourceServiceId;
    const custom = !sourceServiceId;
    return {
      sourceServiceId,
      name: custom
        ? cleanName(input.name ?? current?.name ?? '', 'Die Positionsbezeichnung', 200)
        : null,
      categoryName: custom
        ? cleanName(input.categoryName ?? current?.categoryName ?? '', 'Die Kategorie', 160)
        : null,
      unit: custom ? (input.unit ?? current?.unit ?? null) : null,
      quantity: normalizeQuantity(input.quantity ?? current?.quantity ?? ''),
      providerBusinessPartnerId:
        input.providerBusinessPartnerId === undefined
          ? (current?.providerBusinessPartnerId ?? null)
          : input.providerBusinessPartnerId,
      purchaseUnitPriceMinor:
        input.purchaseUnitPriceMinor === undefined
          ? current
            ? parseMinorUnits(current.purchaseUnitPriceMinor, 'Der Einkaufspreis')
            : undefined
          : parseMinorUnits(input.purchaseUnitPriceMinor, 'Der Einkaufspreis'),
      salesUnitPriceMinor:
        input.salesUnitPriceMinor === undefined
          ? current
            ? parseMinorUnits(current.salesUnitPriceMinor, 'Der Verkaufspreis')
            : undefined
          : parseMinorUnits(input.salesUnitPriceMinor, 'Der Verkaufspreis'),
      costStatus: input.costStatus ?? current?.costStatus ?? 'PLANNED',
      sortOrder: input.sortOrder ?? current?.sortOrder ?? 1,
      note: input.note === undefined ? (current?.note ?? null) : cleanNullable(input.note),
    };
  }

  private redactService(access: AccessContext, record: ServiceRecord): ServiceRecord {
    const result = { ...record };
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)) {
      delete result.defaultSalesPriceMinor;
    }
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE)) {
      delete result.providerPrices;
      delete result.preferredProvider;
    }
    if (!access.permissions.includes(PERMISSIONS.SERVICES_WRITE)) delete result.internalNote;
    return result;
  }

  private redactFormatService(access: AccessContext, record: EventFormatServiceRecord) {
    const result = { ...record };
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE)) {
      delete result.purchasePriceOverrideMinor;
      delete result.resolvedPurchasePriceMinor;
    }
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)) {
      delete result.salesPriceOverrideMinor;
      delete result.resolvedSalesPriceMinor;
    }
    return result;
  }

  private redactPosition(
    access: AccessContext,
    position: EventCalculationRecord['positions'][number],
  ) {
    const result = { ...position };
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE)) {
      delete result.purchaseUnitPriceMinor;
      delete result.purchaseTotalMinor;
    }
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)) {
      delete result.salesUnitPriceMinor;
      delete result.salesTotalMinor;
    }
    return result;
  }

  private redactCatalogPricePreview(
    access: AccessContext,
    preview: EventPositionCatalogPricePreviewRecord,
  ) {
    const result = { ...preview };
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE)) {
      delete result.purchaseUnitPriceMinor;
      delete result.purchaseWillBeApplied;
    }
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)) {
      delete result.salesUnitPriceMinor;
      delete result.salesWillBeApplied;
    }
    return result;
  }

  private redactCalculation(access: AccessContext, calculation: EventCalculationRecord) {
    const canPurchase = access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE);
    const result = {
      ...calculation,
      positions: calculation.positions.map((position) => this.redactPosition(access, position)),
      bookingCosts: canPurchase
        ? calculation.bookingCosts.map((item) => ({ ...item }))
        : calculation.bookingCosts.map(({ amountMinor: _amountMinor, ...item }) => item),
      totals: { ...calculation.totals },
    };
    if (!canPurchase) {
      delete result.totals.estimatedCostMinor;
      delete result.totals.committedCostMinor;
      delete result.totals.plannedCostMinor;
      delete result.totals.servicePurchaseValueMinor;
    }
    if (!access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)) {
      delete result.totals.serviceSalesValueMinor;
      delete result.totals.serviceMarginMinor;
    }
    return result;
  }

  private assertFinancialWrites(access: AccessContext, input: object): void {
    const values = input as Record<string, unknown>;
    if (
      ('purchasePriceOverrideMinor' in values || 'purchaseUnitPriceMinor' in values) &&
      !access.permissions.includes(PERMISSIONS.CALCULATIONS_PURCHASE)
    ) {
      throw new ForbiddenException({
        code: 'CALCULATION_PURCHASE_PERMISSION_REQUIRED',
        message: 'Für Einkaufswerte fehlt die Berechtigung',
      });
    }
    if (
      ('defaultSalesPriceMinor' in values ||
        'salesPriceOverrideMinor' in values ||
        'salesUnitPriceMinor' in values) &&
      !access.permissions.includes(PERMISSIONS.CALCULATIONS_SALES)
    ) {
      throw new ForbiddenException({
        code: 'CALCULATION_SALES_PERMISSION_REQUIRED',
        message: 'Für Verkaufswerte fehlt die Berechtigung',
      });
    }
  }

  private assertPurchasePermission(access: AccessContext): void {
    this.requirePermission(
      access,
      PERMISSIONS.CALCULATIONS_PURCHASE,
      'CALCULATION_PURCHASE_PERMISSION_REQUIRED',
    );
  }

  private requirePermission(
    access: AccessContext,
    permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
    code: string,
  ): void {
    if (!access.permissions.includes(permission)) {
      throw new ForbiddenException({ code, message: 'Für diese Aktion fehlt die Berechtigung' });
    }
  }

  private requireRecord<T>(record: T | undefined, code: string, message: string): T {
    if (!record) throw new NotFoundException({ code, message });
    return record;
  }

  private assertVersion(current: number, supplied: number): void {
    if (current !== supplied) this.versionConflict();
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof ServiceCalculationValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error instanceof ServiceCalculationPersistenceError) {
      const body = { code: error.code, message: error.message };
      if (error.code.endsWith('_NOT_FOUND')) throw new NotFoundException(body);
      if (error.kind === 'REFERENCE') throw new UnprocessableEntityException(body);
      throw new ConflictException(body);
    }
    throw error;
  }
}
