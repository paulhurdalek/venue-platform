import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseClient, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import {
  resolveAllocations,
  resolveComponentAmount,
} from '../../revenue/domain/revenue-planning.rules.js';
import type {
  EventCalculationRecord,
  EventFormatServiceRecord,
  EventPositionCatalogPricePreviewRecord,
  EventPositionValues,
  EventServicePositionRecord,
  ListQuery,
  Page,
  ServiceCategoryRecord,
  ServiceListQuery,
  ServiceProviderPriceRecord,
  ServiceRecord,
} from '../application/service-calculation.models.js';
import {
  ServiceCalculationPersistenceError,
  type ServiceCalculationRepository,
} from '../application/service-calculation.repository.js';
import { resolveCatalogProvider } from '../domain/catalog-price-resolution.js';
import { calculateLineTotal, type ServiceUnit } from '../domain/service-calculation.rules.js';

type Database = DatabaseClient | TransactionClient;

const providerInclude = {
  businessPartner: { select: { companyName: true, status: true } },
} satisfies Prisma.ServiceProviderPriceInclude;

const serviceInclude = {
  category: { select: { name: true, status: true } },
  providerPrices: {
    include: providerInclude,
    orderBy: [
      { status: 'asc' as const },
      { preferred: 'desc' as const },
      { createdAt: 'asc' as const },
    ],
  },
} satisfies Prisma.ServiceInclude;

const formatServiceInclude = {
  service: {
    include: {
      category: { select: { name: true } },
      providerPrices: {
        where: { status: 'ACTIVE' as const },
        include: providerInclude,
        orderBy: [{ preferred: 'desc' as const }, { createdAt: 'asc' as const }],
      },
    },
  },
  providerBusinessPartner: { select: { companyName: true, status: true } },
} satisfies Prisma.EventFormatServiceInclude;

const positionInclude = {
  providerBusinessPartner: { select: { companyName: true, status: true } },
  event: { select: { locationId: true } },
} satisfies Prisma.EventServicePositionInclude;

const calculationInclude = {
  event: {
    select: {
      name: true,
      locationId: true,
      bookings: {
        where: { status: { in: ['SHORTLISTED', 'REQUESTED', 'OPTION', 'CONFIRMED'] as const } },
        select: {
          id: true,
          status: true,
          agreedFeeMinor: true,
          agreedFeeCurrency: true,
          travelCostMinor: true,
          travelCostCurrency: true,
          hotelArrangement: true,
          hotelBuyoutMinor: true,
          hotelBuyoutCurrency: true,
          artist: { select: { stageName: true, firstName: true, lastName: true } },
        },
        orderBy: [{ lineupOrder: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  },
  approvedByUser: { select: { name: true } },
  positions: {
    include: positionInclude,
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  statusHistory: {
    include: { actorUser: { select: { name: true } } },
    orderBy: [{ changedAt: 'desc' as const }, { id: 'desc' as const }],
  },
} satisfies Prisma.EventCalculationInclude;

type CategoryRow = Prisma.ServiceCategoryGetPayload<Record<string, never>>;
type ProviderRow = Prisma.ServiceProviderPriceGetPayload<{ include: typeof providerInclude }>;
type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;
type FormatServiceRow = Prisma.EventFormatServiceGetPayload<{
  include: typeof formatServiceInclude;
}>;
type PositionRow = Prisma.EventServicePositionGetPayload<{ include: typeof positionInclude }>;
type CalculationRow = Prisma.EventCalculationGetPayload<{ include: typeof calculationInclude }>;

interface CatalogPositionForResolution {
  id: string;
  version: number;
  source: 'EVENT_FORMAT' | 'SERVICE_CATALOG' | 'CUSTOM';
  sourceServiceId: string | null;
  sourceEventFormatServiceId: string | null;
  providerBusinessPartnerId: string | null;
  purchaseUnitPriceMinor: bigint | null;
  salesUnitPriceMinor: bigint | null;
}

interface CatalogPriceResolution {
  source: 'EVENT_FORMAT' | 'SERVICE_CATALOG';
  serviceId: string;
  serviceVersion: number;
  formatServiceVersion: number | null;
  providerBusinessPartnerId: string | null;
  providerName: string | null;
  purchaseUnitPriceMinor: bigint | null;
  salesUnitPriceMinor: bigint | null;
}

@Injectable()
export class PrismaServiceCalculationRepository implements ServiceCalculationRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly audit: AuditWriter,
  ) {}

  async listCategories(
    organizationId: string,
    query: ListQuery,
  ): Promise<Page<ServiceCategoryRecord>> {
    const where: Prisma.ServiceCategoryWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.serviceCategory.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.serviceCategory.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.mapCategory(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findCategory(organizationId: string, categoryId: string) {
    const row = await this.prisma.database.serviceCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    return row ? this.mapCategory(row) : undefined;
  }

  createCategory(access: AccessContext, values: { name: string; normalizedName: string }) {
    return this.prisma.transaction(async (database) => {
      try {
        const row = await database.serviceCategory.create({
          data: { organizationId: access.organizationId, ...values },
        });
        await this.appendAudit(
          database,
          access,
          'service_category.created',
          'service_category',
          row.id,
          {
            newVersion: row.version,
          },
        );
        return this.mapCategory(row);
      } catch (error) {
        return this.rethrowUnique(
          error,
          'SERVICE_CATEGORY_NAME_CONFLICT',
          'Eine Kategorie mit diesem Namen besteht bereits',
        );
      }
    });
  }

  updateCategory(
    access: AccessContext,
    categoryId: string,
    version: number,
    values: { name: string; normalizedName: string },
  ) {
    return this.prisma.transaction(async (database) => {
      try {
        const result = await database.serviceCategory.updateMany({
          where: { id: categoryId, organizationId: access.organizationId, version },
          data: { ...values, version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(
          database,
          access,
          'service_category.updated',
          'service_category',
          categoryId,
          {
            previousVersion: version,
            newVersion: version + 1,
          },
        );
        return this.findCategoryWith(database, access.organizationId, categoryId);
      } catch (error) {
        return this.rethrowUnique(
          error,
          'SERVICE_CATEGORY_NAME_CONFLICT',
          'Eine Kategorie mit diesem Namen besteht bereits',
        );
      }
    });
  }

  setCategoryStatus(
    access: AccessContext,
    categoryId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      if (status === 'ARCHIVED') {
        const activeServices = await database.service.count({
          where: { organizationId: access.organizationId, categoryId, status: 'ACTIVE' },
        });
        if (activeServices > 0) {
          throw new ServiceCalculationPersistenceError(
            'SERVICE_CATEGORY_IN_USE',
            'Die Kategorie enthält aktive Leistungen und kann noch nicht archiviert werden',
          );
        }
      }
      const result = await database.serviceCategory.updateMany({
        where: { id: categoryId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.appendAudit(
        database,
        access,
        status === 'ARCHIVED' ? 'service_category.archived' : 'service_category.reactivated',
        'service_category',
        categoryId,
        { previousVersion: version, newVersion: version + 1 },
      );
      return this.findCategoryWith(database, access.organizationId, categoryId);
    });
  }

  async listServices(
    organizationId: string,
    query: ServiceListQuery,
  ): Promise<Page<ServiceRecord>> {
    const where: Prisma.ServiceWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { category: { name: { contains: query.q, mode: 'insensitive' } } },
              {
                providerPrices: {
                  some: {
                    businessPartner: { companyName: { contains: query.q, mode: 'insensitive' } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.service.findMany({
        where,
        include: serviceInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.service.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.mapService(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findService(organizationId: string, serviceId: string) {
    return this.findServiceWith(this.prisma.database, organizationId, serviceId);
  }

  createService(
    access: AccessContext,
    values: Parameters<ServiceCalculationRepository['createService']>[1],
  ) {
    return this.prisma.transaction(async (database) => {
      await this.requireActiveCategory(database, access.organizationId, values.categoryId);
      try {
        const row = await database.service.create({
          data: { organizationId: access.organizationId, currency: 'EUR', ...values },
          include: serviceInclude,
        });
        await this.appendAudit(database, access, 'service.created', 'service', row.id, {
          categoryId: row.categoryId,
          newVersion: row.version,
        });
        return this.mapService(row);
      } catch (error) {
        return this.rethrowUnique(
          error,
          'SERVICE_NAME_CONFLICT',
          'Eine Leistung mit dieser Bezeichnung besteht bereits',
        );
      }
    });
  }

  updateService(
    access: AccessContext,
    serviceId: string,
    version: number,
    values: Parameters<ServiceCalculationRepository['updateService']>[3],
  ) {
    return this.prisma.transaction(async (database) => {
      await this.requireActiveCategory(database, access.organizationId, values.categoryId);
      try {
        const result = await database.service.updateMany({
          where: { id: serviceId, organizationId: access.organizationId, version },
          data: { ...values, currency: 'EUR', version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(database, access, 'service.updated', 'service', serviceId, {
          previousVersion: version,
          newVersion: version + 1,
        });
        return this.findServiceWith(database, access.organizationId, serviceId);
      } catch (error) {
        return this.rethrowUnique(
          error,
          'SERVICE_NAME_CONFLICT',
          'Eine Leistung mit dieser Bezeichnung besteht bereits',
        );
      }
    });
  }

  setServiceStatus(
    access: AccessContext,
    serviceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      if (status === 'ACTIVE') {
        const service = await database.service.findFirst({
          where: { id: serviceId, organizationId: access.organizationId },
          include: { category: { select: { status: true } } },
        });
        if (!service || service.category.status !== 'ACTIVE') {
          throw new ServiceCalculationPersistenceError(
            'SERVICE_CATEGORY_ARCHIVED',
            'Die Kategorie muss vor der Leistung reaktiviert werden',
            'REFERENCE',
          );
        }
      }
      const result = await database.service.updateMany({
        where: { id: serviceId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.appendAudit(
        database,
        access,
        status === 'ARCHIVED' ? 'service.archived' : 'service.reactivated',
        'service',
        serviceId,
        { previousVersion: version, newVersion: version + 1 },
      );
      return this.findServiceWith(database, access.organizationId, serviceId);
    });
  }

  createProviderPrice(
    access: AccessContext,
    serviceId: string,
    values: Parameters<ServiceCalculationRepository['createProviderPrice']>[2],
  ) {
    return this.prisma.transaction(async (database) => {
      await this.requireActiveService(database, access.organizationId, serviceId);
      await this.requireActivePartner(database, access.organizationId, values.businessPartnerId);
      try {
        const row = await database.serviceProviderPrice.create({
          data: { organizationId: access.organizationId, serviceId, currency: 'EUR', ...values },
          include: providerInclude,
        });
        await this.appendAudit(
          database,
          access,
          'service_provider_price.created',
          'service_provider_price',
          row.id,
          {
            serviceId,
            businessPartnerId: row.businessPartnerId,
            preferred: row.preferred,
            newVersion: row.version,
          },
        );
        return this.mapProvider(row);
      } catch (error) {
        return this.rethrowProviderUnique(error);
      }
    });
  }

  async findProviderPrice(organizationId: string, providerPriceId: string) {
    return this.findProviderWith(this.prisma.database, organizationId, providerPriceId);
  }

  updateProviderPrice(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    values: Parameters<ServiceCalculationRepository['updateProviderPrice']>[3],
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await database.serviceProviderPrice.findFirst({
        where: { id: providerPriceId, organizationId: access.organizationId },
      });
      if (!current) return undefined;
      await this.requireActivePartner(database, access.organizationId, values.businessPartnerId);
      try {
        const result = await database.serviceProviderPrice.updateMany({
          where: { id: providerPriceId, organizationId: access.organizationId, version },
          data: { ...values, currency: 'EUR', version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(
          database,
          access,
          'service_provider_price.updated',
          'service_provider_price',
          providerPriceId,
          {
            serviceId: current.serviceId,
            previousVersion: version,
            newVersion: version + 1,
          },
        );
        return this.findProviderWith(database, access.organizationId, providerPriceId);
      } catch (error) {
        return this.rethrowProviderUnique(error);
      }
    });
  }

  setProviderPriceStatus(
    access: AccessContext,
    providerPriceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await database.serviceProviderPrice.findFirst({
        where: { id: providerPriceId, organizationId: access.organizationId },
      });
      if (!current) return undefined;
      if (status === 'ACTIVE') {
        await this.requireActiveService(database, access.organizationId, current.serviceId);
        await this.requireActivePartner(database, access.organizationId, current.businessPartnerId);
      }
      try {
        const result = await database.serviceProviderPrice.updateMany({
          where: { id: providerPriceId, organizationId: access.organizationId, version },
          data: {
            status,
            archivedAt: status === 'ARCHIVED' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(
          database,
          access,
          status === 'ARCHIVED'
            ? 'service_provider_price.archived'
            : 'service_provider_price.reactivated',
          'service_provider_price',
          providerPriceId,
          { serviceId: current.serviceId, previousVersion: version, newVersion: version + 1 },
        );
        return this.findProviderWith(database, access.organizationId, providerPriceId);
      } catch (error) {
        return this.rethrowProviderUnique(error);
      }
    });
  }

  async listFormatServices(
    organizationId: string,
    eventFormatId: string,
    includeArchived: boolean,
  ) {
    const format = await this.prisma.database.eventFormat.findFirst({
      where: { id: eventFormatId, organizationId },
      select: { id: true },
    });
    if (!format) return undefined;
    const rows = await this.prisma.database.eventFormatService.findMany({
      where: { organizationId, eventFormatId, ...(includeArchived ? {} : { status: 'ACTIVE' }) },
      include: formatServiceInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapFormatService(row));
  }

  createFormatService(
    access: AccessContext,
    eventFormatId: string,
    values: Parameters<ServiceCalculationRepository['createFormatService']>[2],
  ) {
    return this.prisma.transaction(async (database) => {
      await this.requireActiveFormat(database, access.organizationId, eventFormatId);
      await this.requireActiveService(database, access.organizationId, values.serviceId);
      await this.validateServiceProvider(
        database,
        access.organizationId,
        values.serviceId,
        values.providerBusinessPartnerId,
      );
      try {
        const row = await database.eventFormatService.create({
          data: {
            organizationId: access.organizationId,
            eventFormatId,
            currency: 'EUR',
            ...values,
          },
          include: formatServiceInclude,
        });
        await this.appendAudit(
          database,
          access,
          'event_format_service.created',
          'event_format_service',
          row.id,
          {
            eventFormatId,
            serviceId: row.serviceId,
            newVersion: row.version,
          },
        );
        return this.mapFormatService(row);
      } catch (error) {
        return this.rethrowFormatUnique(error);
      }
    });
  }

  async findFormatService(organizationId: string, formatServiceId: string) {
    return this.findFormatServiceWith(this.prisma.database, organizationId, formatServiceId);
  }

  updateFormatService(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    values: Parameters<ServiceCalculationRepository['updateFormatService']>[3],
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await database.eventFormatService.findFirst({
        where: { id: formatServiceId, organizationId: access.organizationId },
      });
      if (!current) return undefined;
      await this.requireActiveService(database, access.organizationId, values.serviceId);
      await this.validateServiceProvider(
        database,
        access.organizationId,
        values.serviceId,
        values.providerBusinessPartnerId,
      );
      try {
        const result = await database.eventFormatService.updateMany({
          where: { id: formatServiceId, organizationId: access.organizationId, version },
          data: { ...values, currency: 'EUR', version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(
          database,
          access,
          'event_format_service.updated',
          'event_format_service',
          formatServiceId,
          {
            eventFormatId: current.eventFormatId,
            previousVersion: version,
            newVersion: version + 1,
          },
        );
        return this.findFormatServiceWith(database, access.organizationId, formatServiceId);
      } catch (error) {
        return this.rethrowFormatUnique(error);
      }
    });
  }

  setFormatServiceStatus(
    access: AccessContext,
    formatServiceId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await database.eventFormatService.findFirst({
        where: { id: formatServiceId, organizationId: access.organizationId },
      });
      if (!current) return undefined;
      if (status === 'ACTIVE') {
        await this.requireActiveService(database, access.organizationId, current.serviceId);
        await this.validateServiceProvider(
          database,
          access.organizationId,
          current.serviceId,
          current.providerBusinessPartnerId,
        );
      }
      try {
        const result = await database.eventFormatService.updateMany({
          where: { id: formatServiceId, organizationId: access.organizationId, version },
          data: {
            status,
            archivedAt: status === 'ARCHIVED' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) return undefined;
        await this.appendAudit(
          database,
          access,
          status === 'ARCHIVED'
            ? 'event_format_service.archived'
            : 'event_format_service.reactivated',
          'event_format_service',
          formatServiceId,
          {
            eventFormatId: current.eventFormatId,
            previousVersion: version,
            newVersion: version + 1,
          },
        );
        return this.findFormatServiceWith(database, access.organizationId, formatServiceId);
      } catch (error) {
        return this.rethrowFormatUnique(error);
      }
    });
  }

  async findCalculation(organizationId: string, eventId: string, locationIds?: string[]) {
    const row = await this.prisma.database.eventCalculation.findFirst({
      where: {
        organizationId,
        eventId,
        ...(locationIds ? { event: { locationId: { in: locationIds } } } : {}),
      },
      include: calculationInclude,
    });
    return row ? this.mapCalculation(row) : undefined;
  }

  addEventPosition(access: AccessContext, eventId: string, values: EventPositionValues) {
    return this.prisma.transaction(async (database) => {
      const calculation = await this.lockCalculationForEvent(database, access, eventId);
      const data = await this.resolveEventPositionData(database, access.organizationId, values);
      const row = await database.eventServicePosition.create({
        data: {
          organizationId: access.organizationId,
          eventId,
          calculationId: calculation.id,
          currency: 'EUR',
          ...data,
        },
        include: positionInclude,
      });
      await this.touchCalculation(
        database,
        access,
        calculation,
        'event_service_position',
        row.id,
        'Veranstaltungsposition angelegt',
      );
      await this.appendAudit(
        database,
        access,
        'event_service_position.created',
        'event_service_position',
        row.id,
        {
          eventId,
          source: row.source,
          newVersion: row.version,
        },
      );
      return this.mapPosition(row);
    });
  }

  async findEventPosition(organizationId: string, positionId: string, locationIds?: string[]) {
    const row = await this.prisma.database.eventServicePosition.findFirst({
      where: {
        id: positionId,
        organizationId,
        ...(locationIds ? { event: { locationId: { in: locationIds } } } : {}),
      },
      include: positionInclude,
    });
    return row ? this.mapPosition(row) : undefined;
  }

  updateEventPosition(
    access: AccessContext,
    positionId: string,
    version: number,
    values: EventPositionValues,
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockPosition(database, access, positionId);
      if (!current || current.version !== version) return undefined;
      const calculation = await this.lockCalculation(
        database,
        access.organizationId,
        current.calculationId,
      );
      if (!calculation) return undefined;
      if (values.sourceServiceId !== current.sourceServiceId) {
        throw new ServiceCalculationPersistenceError(
          'EVENT_POSITION_SOURCE_IMMUTABLE',
          'Die Herkunft einer Veranstaltungsposition kann nicht nachträglich geändert werden',
          'REFERENCE',
        );
      }
      const resolved = await this.resolveEventPositionData(
        database,
        access.organizationId,
        values,
        current,
      );
      const result = await database.eventServicePosition.updateMany({
        where: { id: positionId, organizationId: access.organizationId, version },
        data: {
          ...resolved,
          source: current.source === 'EVENT_FORMAT' ? 'EVENT_FORMAT' : resolved.source,
          sourceEventFormatServiceId: current.sourceEventFormatServiceId,
          sourceEventFormatServiceVersion: current.sourceEventFormatServiceVersion,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'event_service_position',
        positionId,
        'Veranstaltungsposition geändert',
      );
      await this.appendAudit(
        database,
        access,
        'event_service_position.updated',
        'event_service_position',
        positionId,
        {
          eventId: current.eventId,
          previousVersion: version,
          newVersion: version + 1,
        },
      );
      return this.findPositionWith(database, access.organizationId, positionId);
    });
  }

  async previewEventPositionCatalogPrices(access: AccessContext, positionId: string) {
    const position = await this.prisma.database.eventServicePosition.findFirst({
      where: {
        id: positionId,
        organizationId: access.organizationId,
        ...(access.locationScope === 'SELECTED'
          ? { event: { locationId: { in: access.locationIds } } }
          : {}),
      },
      select: {
        id: true,
        version: true,
        source: true,
        sourceServiceId: true,
        sourceEventFormatServiceId: true,
        providerBusinessPartnerId: true,
        purchaseUnitPriceMinor: true,
        salesUnitPriceMinor: true,
      },
    });
    if (!position) return undefined;
    const resolution = await this.resolveCatalogPrices(
      this.prisma.database,
      access.organizationId,
      position,
    );
    return this.catalogPricePreview(position, resolution);
  }

  applyEventPositionCatalogPrices(
    access: AccessContext,
    positionId: string,
    version: number,
    apply: { purchase: boolean; sales: boolean },
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockPosition(database, access, positionId);
      if (!current || current.version !== version) return undefined;
      const calculation = await this.lockCalculation(
        database,
        access.organizationId,
        current.calculationId,
      );
      if (!calculation) return undefined;
      const resolution = await this.resolveCatalogPrices(database, access.organizationId, current);
      const purchaseWillBeApplied =
        apply.purchase &&
        current.purchaseUnitPriceMinor === null &&
        resolution.purchaseUnitPriceMinor !== null;
      const salesWillBeApplied =
        apply.sales &&
        current.salesUnitPriceMinor === null &&
        resolution.salesUnitPriceMinor !== null;
      if (!purchaseWillBeApplied && !salesWillBeApplied) {
        throw new ServiceCalculationPersistenceError(
          'CATALOG_PRICES_NOT_AVAILABLE',
          'Im aktuellen Katalog ist für die fehlenden Felder kein Preis hinterlegt',
          'REFERENCE',
        );
      }
      const providerWillBeApplied =
        purchaseWillBeApplied &&
        current.providerBusinessPartnerId === null &&
        resolution.providerBusinessPartnerId !== null;
      const result = await database.eventServicePosition.updateMany({
        where: { id: positionId, organizationId: access.organizationId, version },
        data: {
          ...(purchaseWillBeApplied
            ? { purchaseUnitPriceMinor: resolution.purchaseUnitPriceMinor }
            : {}),
          ...(salesWillBeApplied ? { salesUnitPriceMinor: resolution.salesUnitPriceMinor } : {}),
          ...(providerWillBeApplied
            ? {
                providerBusinessPartnerId: resolution.providerBusinessPartnerId,
                providerNameSnapshot: resolution.providerName,
              }
            : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'event_service_position',
        positionId,
        'Fehlende Preise aus dem Katalog übernommen',
      );
      const appliedFields = [
        ...(purchaseWillBeApplied ? ['purchaseUnitPriceMinor'] : []),
        ...(salesWillBeApplied ? ['salesUnitPriceMinor'] : []),
      ];
      await this.appendAudit(
        database,
        access,
        'event_service_position.catalog_prices_applied',
        'event_service_position',
        positionId,
        {
          eventId: current.eventId,
          source: resolution.source,
          catalogServiceId: resolution.serviceId,
          catalogServiceVersion: resolution.serviceVersion,
          formatServiceVersion: resolution.formatServiceVersion,
          appliedFields,
          providerApplied: providerWillBeApplied,
          previousVersion: version,
          newVersion: version + 1,
        },
      );
      return this.findPositionWith(database, access.organizationId, positionId);
    });
  }

  setEventPositionStatus(
    access: AccessContext,
    positionId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockPosition(database, access, positionId);
      if (!current || current.version !== version) return undefined;
      const calculation = await this.lockCalculation(
        database,
        access.organizationId,
        current.calculationId,
      );
      if (!calculation) return undefined;
      const result = await database.eventServicePosition.updateMany({
        where: { id: positionId, organizationId: access.organizationId, version },
        data: {
          status,
          archivedAt: status === 'ARCHIVED' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await this.touchCalculation(
        database,
        access,
        calculation,
        'event_service_position',
        positionId,
        status === 'ARCHIVED'
          ? 'Veranstaltungsposition archiviert'
          : 'Veranstaltungsposition reaktiviert',
      );
      await this.appendAudit(
        database,
        access,
        status === 'ARCHIVED'
          ? 'event_service_position.archived'
          : 'event_service_position.reactivated',
        'event_service_position',
        positionId,
        { eventId: current.eventId, previousVersion: version, newVersion: version + 1 },
      );
      return this.findPositionWith(database, access.organizationId, positionId);
    });
  }

  setCalculationStatus(
    access: AccessContext,
    eventId: string,
    version: number,
    status: Parameters<ServiceCalculationRepository['setCalculationStatus']>[3],
    note: string | null,
  ) {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockCalculationForEvent(database, access, eventId);
      if (current.version !== version) return undefined;
      if (status === 'APPROVED') {
        const incomplete = await database.eventServicePosition.count({
          where: {
            organizationId: access.organizationId,
            eventId,
            status: 'ACTIVE',
            OR: [{ purchaseUnitPriceMinor: null }, { salesUnitPriceMinor: null }],
          },
        });
        if (incomplete > 0) {
          throw new ServiceCalculationPersistenceError(
            'CALCULATION_PRICES_INCOMPLETE',
            'Alle aktiven Leistungspositionen benötigen vor der Freigabe Einkaufs- und Verkaufspreise',
            'REFERENCE',
          );
        }
        if (await this.hasIncompleteRevenuePlan(database, access.organizationId, eventId)) {
          throw new ServiceCalculationPersistenceError(
            'CALCULATION_REVENUE_INCOMPLETE',
            'Ticketpreise, Steuerangaben, Empfänger-Aufteilungen und weitere Erlösbasen müssen vor der Freigabe vollständig sein',
            'REFERENCE',
          );
        }
      }
      const now = new Date();
      const result = await database.eventCalculation.updateMany({
        where: { id: current.id, organizationId: access.organizationId, version },
        data: {
          status,
          approvedAt: status === 'APPROVED' ? now : null,
          approvedByUserId: status === 'APPROVED' ? access.user.id : null,
          approvedByMembershipId: status === 'APPROVED' ? access.membershipId : null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return undefined;
      await database.eventCalculationStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          calculationId: current.id,
          previousStatus: current.status,
          newStatus: status,
          actorUserId: access.user.id,
          actorMembershipId: access.membershipId,
          note,
        },
      });
      await this.appendAudit(
        database,
        access,
        'event_calculation.status_changed',
        'event_calculation',
        current.id,
        {
          eventId,
          previousStatus: current.status,
          newStatus: status,
          previousVersion: version,
          newVersion: version + 1,
          notePresent: Boolean(note),
        },
      );
      return this.findCalculationWith(database, access.organizationId, eventId);
    });
  }

  private async hasIncompleteRevenuePlan(
    database: TransactionClient,
    organizationId: string,
    eventId: string,
  ): Promise<boolean> {
    const [event, tiers, guestRevenueCount] = await Promise.all([
      database.event.findFirst({
        where: { id: eventId, organizationId },
        select: { expectedGuestCount: true },
      }),
      database.ticketPriceTier.findMany({
        where: { organizationId, eventId, status: 'ACTIVE' },
        select: {
          baseGrossUnitMinor: true,
          baseNetUnitMinor: true,
          components: {
            where: { status: 'ACTIVE' },
            select: {
              amountType: true,
              inputType: true,
              inputAmountMinor: true,
              percentageRateBasisPoints: true,
              taxRateBasisPoints: true,
              allocations: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  recipientType: true,
                  allocationType: true,
                  fixedAmountMinor: true,
                  percentageBasisPoints: true,
                },
              },
            },
          },
        },
      }),
      database.additionalRevenue.count({
        where: {
          organizationId,
          eventId,
          status: 'ACTIVE',
          calculationType: 'PER_EXPECTED_GUEST',
        },
      }),
    ]);
    if (!event) return true;
    if (guestRevenueCount > 0 && event.expectedGuestCount === null) return true;
    for (const tier of tiers) {
      if (tier.baseGrossUnitMinor === null || tier.baseNetUnitMinor === null) return true;
      for (const component of tier.components) {
        const amount = resolveComponentAmount(tier.baseGrossUnitMinor, component);
        if (amount === null) return true;
        const allocations = resolveAllocations(amount, component.allocations);
        if (!allocations.complete) return true;
      }
    }
    return false;
  }

  private async resolveEventPositionData(
    database: TransactionClient,
    organizationId: string,
    values: EventPositionValues,
    current?: {
      source: 'EVENT_FORMAT' | 'SERVICE_CATALOG' | 'CUSTOM';
      sourceServiceId: string | null;
      sourceServiceVersion: number | null;
      sourceEventFormatServiceId: string | null;
      sourceEventFormatServiceVersion: number | null;
      nameSnapshot: string;
      categoryNameSnapshot: string;
      unit: ServiceUnit;
      providerBusinessPartnerId: string | null;
      providerNameSnapshot: string | null;
    },
  ) {
    if (values.sourceServiceId) {
      if (
        current?.sourceServiceId === values.sourceServiceId &&
        current.providerBusinessPartnerId === values.providerBusinessPartnerId
      ) {
        return {
          source: current.source,
          sourceServiceId: current.sourceServiceId,
          sourceServiceVersion: current.sourceServiceVersion,
          sourceEventFormatServiceId: current.sourceEventFormatServiceId,
          sourceEventFormatServiceVersion: current.sourceEventFormatServiceVersion,
          nameSnapshot: current.nameSnapshot,
          categoryNameSnapshot: current.categoryNameSnapshot,
          unit: current.unit,
          quantity: new Prisma.Decimal(values.quantity),
          providerBusinessPartnerId: current.providerBusinessPartnerId,
          providerNameSnapshot: current.providerNameSnapshot,
          purchaseUnitPriceMinor: values.purchaseUnitPriceMinor ?? null,
          salesUnitPriceMinor: values.salesUnitPriceMinor ?? null,
          costStatus: values.costStatus,
          sortOrder: values.sortOrder,
          note: values.note,
        };
      }
      const service = await database.service.findFirst({
        where: { id: values.sourceServiceId, organizationId, status: 'ACTIVE' },
        include: {
          category: { select: { name: true, status: true } },
          providerPrices: {
            where: { status: 'ACTIVE' },
            include: providerInclude,
            orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
      if (!service || service.category.status !== 'ACTIVE') {
        throw new ServiceCalculationPersistenceError(
          'SERVICE_NOT_ACTIVE',
          'Nur aktive Leistungen aus aktiven Kategorien können verwendet werden',
          'REFERENCE',
        );
      }
      const providerPrice = resolveCatalogProvider(
        service.providerPrices,
        values.providerBusinessPartnerId,
      );
      if (values.providerBusinessPartnerId && !providerPrice) {
        throw new ServiceCalculationPersistenceError(
          'SERVICE_PROVIDER_NOT_ACTIVE',
          'Der Dienstleister ist dieser Leistung nicht aktiv zugeordnet',
          'REFERENCE',
        );
      }
      const preserveSnapshot = current?.sourceServiceId === service.id;
      return {
        source:
          current?.source === 'EVENT_FORMAT'
            ? ('EVENT_FORMAT' as const)
            : ('SERVICE_CATALOG' as const),
        sourceServiceId: service.id,
        sourceServiceVersion:
          current?.sourceServiceId === service.id && current?.sourceServiceVersion
            ? current.sourceServiceVersion
            : service.version,
        sourceEventFormatServiceId: current?.sourceEventFormatServiceId ?? null,
        sourceEventFormatServiceVersion: current?.sourceEventFormatServiceVersion ?? null,
        nameSnapshot: preserveSnapshot ? current.nameSnapshot : service.name,
        categoryNameSnapshot: preserveSnapshot
          ? current.categoryNameSnapshot
          : service.category.name,
        unit: preserveSnapshot ? current.unit : service.unit,
        quantity: new Prisma.Decimal(values.quantity),
        providerBusinessPartnerId: providerPrice?.businessPartnerId ?? null,
        providerNameSnapshot: providerPrice?.businessPartner.companyName ?? null,
        purchaseUnitPriceMinor:
          values.purchaseUnitPriceMinor === undefined
            ? (providerPrice?.purchasePriceMinor ?? null)
            : values.purchaseUnitPriceMinor,
        salesUnitPriceMinor:
          values.salesUnitPriceMinor === undefined
            ? service.defaultSalesPriceMinor
            : values.salesUnitPriceMinor,
        costStatus: values.costStatus,
        sortOrder: values.sortOrder,
        note: values.note,
      };
    }
    if (!values.name || !values.categoryName || !values.unit) {
      throw new ServiceCalculationPersistenceError(
        'CUSTOM_POSITION_FIELDS_REQUIRED',
        'Individuelle Positionen benötigen Bezeichnung, Kategorie und Einheit',
        'REFERENCE',
      );
    }
    let provider: { id: string; companyName: string } | null = null;
    if (values.providerBusinessPartnerId) {
      provider = await database.businessPartner.findFirst({
        where: { id: values.providerBusinessPartnerId, organizationId, status: 'ACTIVE' },
        select: { id: true, companyName: true },
      });
      if (!provider) {
        throw new ServiceCalculationPersistenceError(
          'BUSINESS_PARTNER_NOT_ACTIVE',
          'Nur aktive Geschäftspartner können als Dienstleister gewählt werden',
          'REFERENCE',
        );
      }
    }
    return {
      source: 'CUSTOM' as const,
      sourceServiceId: null,
      sourceServiceVersion: null,
      sourceEventFormatServiceId: null,
      sourceEventFormatServiceVersion: null,
      nameSnapshot: values.name,
      categoryNameSnapshot: values.categoryName,
      unit: values.unit,
      quantity: new Prisma.Decimal(values.quantity),
      providerBusinessPartnerId: provider?.id ?? null,
      providerNameSnapshot: provider?.companyName ?? null,
      purchaseUnitPriceMinor: values.purchaseUnitPriceMinor ?? null,
      salesUnitPriceMinor: values.salesUnitPriceMinor ?? null,
      costStatus: values.costStatus,
      sortOrder: values.sortOrder,
      note: values.note,
    };
  }

  private async resolveCatalogPrices(
    database: Database,
    organizationId: string,
    position: CatalogPositionForResolution,
  ): Promise<CatalogPriceResolution> {
    if (position.source === 'CUSTOM' || !position.sourceServiceId) {
      throw new ServiceCalculationPersistenceError(
        'CATALOG_PRICE_REFRESH_UNAVAILABLE',
        'Individuelle Positionen haben keine Katalogpreise',
        'REFERENCE',
      );
    }
    const service = await database.service.findFirst({
      where: {
        id: position.sourceServiceId,
        organizationId,
        status: 'ACTIVE',
        category: { status: 'ACTIVE' },
      },
      include: {
        providerPrices: {
          where: { status: 'ACTIVE' },
          include: providerInclude,
          orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!service) {
      throw new ServiceCalculationPersistenceError(
        'CATALOG_PRICE_SOURCE_NOT_ACTIVE',
        'Die zugehörige Katalogleistung ist nicht mehr aktiv',
        'REFERENCE',
      );
    }
    const formatService = position.sourceEventFormatServiceId
      ? await database.eventFormatService.findFirst({
          where: { id: position.sourceEventFormatServiceId, organizationId },
          select: {
            serviceId: true,
            providerBusinessPartnerId: true,
            purchasePriceOverrideMinor: true,
            salesPriceOverrideMinor: true,
            version: true,
          },
        })
      : null;
    const matchingFormatService =
      formatService?.serviceId === position.sourceServiceId ? formatService : null;
    const requestedProviderId =
      position.providerBusinessPartnerId ??
      matchingFormatService?.providerBusinessPartnerId ??
      null;
    const provider = resolveCatalogProvider(service.providerPrices, requestedProviderId);
    return {
      source: position.source,
      serviceId: service.id,
      serviceVersion: service.version,
      formatServiceVersion: matchingFormatService?.version ?? null,
      providerBusinessPartnerId: provider?.businessPartnerId ?? null,
      providerName: provider?.businessPartner.companyName ?? null,
      purchaseUnitPriceMinor:
        matchingFormatService?.purchasePriceOverrideMinor ?? provider?.purchasePriceMinor ?? null,
      salesUnitPriceMinor:
        matchingFormatService?.salesPriceOverrideMinor ?? service.defaultSalesPriceMinor,
    };
  }

  private catalogPricePreview(
    position: CatalogPositionForResolution,
    resolution: CatalogPriceResolution,
  ): EventPositionCatalogPricePreviewRecord {
    const purchaseWillBeApplied =
      position.purchaseUnitPriceMinor === null && resolution.purchaseUnitPriceMinor !== null;
    const salesWillBeApplied =
      position.salesUnitPriceMinor === null && resolution.salesUnitPriceMinor !== null;
    return {
      positionId: position.id,
      positionVersion: position.version,
      source: resolution.source,
      providerBusinessPartnerId: resolution.providerBusinessPartnerId,
      providerName: resolution.providerName,
      providerWillBeApplied:
        purchaseWillBeApplied &&
        position.providerBusinessPartnerId === null &&
        resolution.providerBusinessPartnerId !== null,
      purchaseUnitPriceMinor: resolution.purchaseUnitPriceMinor?.toString() ?? null,
      purchaseWillBeApplied,
      salesUnitPriceMinor: resolution.salesUnitPriceMinor?.toString() ?? null,
      salesWillBeApplied,
    };
  }

  private async lockCalculationForEvent(
    database: TransactionClient,
    access: AccessContext,
    eventId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{ id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number }>
    >(Prisma.sql`
      SELECT calculation."id", calculation."status", calculation."version"
      FROM "event_calculation" calculation
      JOIN "event" event ON event."id" = calculation."event_id"
        AND event."organization_id" = calculation."organization_id"
      WHERE calculation."organization_id" = ${access.organizationId}::uuid
        AND calculation."event_id" = ${eventId}::uuid
        ${selectedLocationSql(access)}
      FOR UPDATE OF calculation
    `);
    const row = rows[0];
    if (!row) {
      throw new ServiceCalculationPersistenceError(
        'EVENT_CALCULATION_NOT_FOUND',
        'Veranstaltungskalkulation nicht gefunden',
        'REFERENCE',
      );
    }
    return row;
  }

  private async lockCalculation(
    database: TransactionClient,
    organizationId: string,
    calculationId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{ id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number }>
    >(Prisma.sql`
      SELECT "id", "status", "version" FROM "event_calculation"
      WHERE "organization_id" = ${organizationId}::uuid AND "id" = ${calculationId}::uuid
      FOR UPDATE
    `);
    return rows[0];
  }

  private async lockPosition(
    database: TransactionClient,
    access: AccessContext,
    positionId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{
        id: string;
        eventId: string;
        calculationId: string;
        version: number;
        source: 'EVENT_FORMAT' | 'SERVICE_CATALOG' | 'CUSTOM';
        sourceServiceId: string | null;
        sourceServiceVersion: number | null;
        sourceEventFormatServiceId: string | null;
        sourceEventFormatServiceVersion: number | null;
        nameSnapshot: string;
        categoryNameSnapshot: string;
        unit: ServiceUnit;
        providerBusinessPartnerId: string | null;
        providerNameSnapshot: string | null;
        purchaseUnitPriceMinor: bigint | null;
        salesUnitPriceMinor: bigint | null;
      }>
    >(Prisma.sql`
      SELECT position."id",
        position."event_id" AS "eventId",
        position."calculation_id" AS "calculationId",
        position."version",
        position."source",
        position."source_service_id" AS "sourceServiceId",
        position."source_service_version" AS "sourceServiceVersion",
        position."source_event_format_service_id" AS "sourceEventFormatServiceId",
        position."source_event_format_service_version" AS "sourceEventFormatServiceVersion",
        position."name_snapshot" AS "nameSnapshot",
        position."category_name_snapshot" AS "categoryNameSnapshot",
        position."unit",
        position."provider_business_partner_id" AS "providerBusinessPartnerId",
        position."provider_name_snapshot" AS "providerNameSnapshot",
        position."purchase_unit_price_minor" AS "purchaseUnitPriceMinor",
        position."sales_unit_price_minor" AS "salesUnitPriceMinor"
      FROM "event_service_position" position
      JOIN "event" event ON event."id" = position."event_id"
        AND event."organization_id" = position."organization_id"
      WHERE position."organization_id" = ${access.organizationId}::uuid
        AND position."id" = ${positionId}::uuid
        ${selectedLocationSql(access)}
      FOR UPDATE OF position
    `);
    return rows[0];
  }

  private async touchCalculation(
    database: TransactionClient,
    access: AccessContext,
    calculation: { id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number },
    sourceType: string,
    sourceId: string,
    reason: string,
  ) {
    if (calculation.status === 'APPROVED') {
      await database.eventCalculationStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          calculationId: calculation.id,
          previousStatus: 'APPROVED',
          newStatus: 'DRAFT',
          actorUserId: access.user.id,
          actorMembershipId: access.membershipId,
          reason,
          changedSourceType: sourceType,
          changedSourceId: sourceId,
        },
      });
    }
    await database.eventCalculation.update({
      where: { id: calculation.id },
      data: {
        status: calculation.status === 'APPROVED' ? 'DRAFT' : calculation.status,
        ...(calculation.status === 'APPROVED'
          ? {
              approvedAt: null,
              approvedByUserId: null,
              approvedByMembershipId: null,
            }
          : {}),
        version: { increment: 1 },
      },
    });
    await this.appendAudit(
      database,
      access,
      'event_calculation.source_changed',
      'event_calculation',
      calculation.id,
      {
        sourceType,
        sourceId,
        reason,
        resetFromApproved: calculation.status === 'APPROVED',
        previousVersion: calculation.version,
        newVersion: calculation.version + 1,
      },
    );
  }

  private async requireActiveCategory(
    database: Database,
    organizationId: string,
    categoryId: string,
  ) {
    const category = await database.serviceCategory.findFirst({
      where: { id: categoryId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!category) {
      throw new ServiceCalculationPersistenceError(
        'SERVICE_CATEGORY_NOT_ACTIVE',
        'Nur aktive Kategorien können ausgewählt werden',
        'REFERENCE',
      );
    }
  }

  private async requireActiveService(
    database: Database,
    organizationId: string,
    serviceId: string,
  ) {
    const service = await database.service.findFirst({
      where: { id: serviceId, organizationId, status: 'ACTIVE', category: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!service) {
      throw new ServiceCalculationPersistenceError(
        'SERVICE_NOT_ACTIVE',
        'Nur aktive Leistungen aus aktiven Kategorien können ausgewählt werden',
        'REFERENCE',
      );
    }
  }

  private async requireActivePartner(
    database: Database,
    organizationId: string,
    businessPartnerId: string,
  ) {
    const partner = await database.businessPartner.findFirst({
      where: { id: businessPartnerId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!partner) {
      throw new ServiceCalculationPersistenceError(
        'BUSINESS_PARTNER_NOT_ACTIVE',
        'Nur aktive Geschäftspartner können als Dienstleister ausgewählt werden',
        'REFERENCE',
      );
    }
  }

  private async requireActiveFormat(
    database: Database,
    organizationId: string,
    eventFormatId: string,
  ) {
    const format = await database.eventFormat.findFirst({
      where: { id: eventFormatId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!format) {
      throw new ServiceCalculationPersistenceError(
        'EVENT_FORMAT_NOT_ACTIVE',
        'Das Veranstaltungsformat ist nicht aktiv',
        'REFERENCE',
      );
    }
  }

  private async validateServiceProvider(
    database: Database,
    organizationId: string,
    serviceId: string,
    businessPartnerId: string | null,
  ) {
    if (!businessPartnerId) return;
    const relation = await database.serviceProviderPrice.findFirst({
      where: {
        organizationId,
        serviceId,
        businessPartnerId,
        status: 'ACTIVE',
        businessPartner: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!relation) {
      throw new ServiceCalculationPersistenceError(
        'SERVICE_PROVIDER_NOT_ACTIVE',
        'Der Dienstleister ist dieser Leistung nicht aktiv zugeordnet',
        'REFERENCE',
      );
    }
  }

  private async findCategoryWith(database: Database, organizationId: string, categoryId: string) {
    const row = await database.serviceCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    return row ? this.mapCategory(row) : undefined;
  }

  private async findServiceWith(database: Database, organizationId: string, serviceId: string) {
    const row = await database.service.findFirst({
      where: { id: serviceId, organizationId },
      include: serviceInclude,
    });
    return row ? this.mapService(row) : undefined;
  }

  private async findProviderWith(
    database: Database,
    organizationId: string,
    providerPriceId: string,
  ) {
    const row = await database.serviceProviderPrice.findFirst({
      where: { id: providerPriceId, organizationId },
      include: providerInclude,
    });
    return row ? this.mapProvider(row) : undefined;
  }

  private async findFormatServiceWith(
    database: Database,
    organizationId: string,
    formatServiceId: string,
  ) {
    const row = await database.eventFormatService.findFirst({
      where: { id: formatServiceId, organizationId },
      include: formatServiceInclude,
    });
    return row ? this.mapFormatService(row) : undefined;
  }

  private async findPositionWith(database: Database, organizationId: string, positionId: string) {
    const row = await database.eventServicePosition.findFirst({
      where: { id: positionId, organizationId },
      include: positionInclude,
    });
    return row ? this.mapPosition(row) : undefined;
  }

  private async findCalculationWith(database: Database, organizationId: string, eventId: string) {
    const row = await database.eventCalculation.findFirst({
      where: { organizationId, eventId },
      include: calculationInclude,
    });
    return row ? this.mapCalculation(row) : undefined;
  }

  private mapCategory(row: CategoryRow): ServiceCategoryRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      normalizedName: row.normalizedName,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapProvider(row: ProviderRow): ServiceProviderPriceRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      serviceId: row.serviceId,
      businessPartnerId: row.businessPartnerId,
      businessPartnerName: row.businessPartner.companyName,
      businessPartnerStatus: row.businessPartner.status,
      purchasePriceMinor: row.purchasePriceMinor?.toString() ?? null,
      currency: 'EUR',
      preferred: row.preferred,
      internalNote: row.internalNote,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapService(row: ServiceRow): ServiceRecord {
    const providers = row.providerPrices.map((provider) => this.mapProvider(provider));
    return {
      id: row.id,
      organizationId: row.organizationId,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      categoryStatus: row.category.status,
      name: row.name,
      normalizedName: row.normalizedName,
      unit: row.unit,
      defaultSalesPriceMinor: row.defaultSalesPriceMinor?.toString() ?? null,
      currency: 'EUR',
      internalNote: row.internalNote,
      preferredProvider:
        providers.find((provider) => provider.status === 'ACTIVE' && provider.preferred) ?? null,
      providerPrices: providers,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapFormatService(row: FormatServiceRow): EventFormatServiceRecord {
    const resolvedProvider = resolveCatalogProvider(
      row.service.providerPrices,
      row.providerBusinessPartnerId,
    );
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventFormatId: row.eventFormatId,
      serviceId: row.serviceId,
      serviceName: row.service.name,
      serviceStatus: row.service.status,
      serviceVersion: row.service.version,
      categoryName: row.service.category.name,
      unit: row.service.unit,
      quantity: decimalString(row.quantity),
      providerBusinessPartnerId: row.providerBusinessPartnerId,
      providerName:
        row.providerBusinessPartner?.companyName ??
        resolvedProvider?.businessPartner.companyName ??
        null,
      providerStatus:
        row.providerBusinessPartner?.status ?? resolvedProvider?.businessPartner.status ?? null,
      purchasePriceOverrideMinor: row.purchasePriceOverrideMinor?.toString() ?? null,
      salesPriceOverrideMinor: row.salesPriceOverrideMinor?.toString() ?? null,
      resolvedPurchasePriceMinor:
        (row.purchasePriceOverrideMinor ?? resolvedProvider?.purchasePriceMinor)?.toString() ??
        null,
      resolvedSalesPriceMinor:
        (row.salesPriceOverrideMinor ?? row.service.defaultSalesPriceMinor)?.toString() ?? null,
      currency: 'EUR',
      sortOrder: row.sortOrder,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPosition(row: PositionRow): EventServicePositionRecord {
    const quantity = decimalString(row.quantity);
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      calculationId: row.calculationId,
      source: row.source,
      sourceServiceId: row.sourceServiceId,
      sourceServiceVersion: row.sourceServiceVersion,
      sourceEventFormatServiceId: row.sourceEventFormatServiceId,
      sourceEventFormatServiceVersion: row.sourceEventFormatServiceVersion,
      name: row.nameSnapshot,
      categoryName: row.categoryNameSnapshot,
      unit: row.unit,
      quantity,
      providerBusinessPartnerId: row.providerBusinessPartnerId,
      providerName: row.providerNameSnapshot,
      purchaseUnitPriceMinor: row.purchaseUnitPriceMinor?.toString() ?? null,
      purchaseTotalMinor:
        row.purchaseUnitPriceMinor === null
          ? null
          : calculateLineTotal(quantity, row.purchaseUnitPriceMinor).toString(),
      salesUnitPriceMinor: row.salesUnitPriceMinor?.toString() ?? null,
      salesTotalMinor:
        row.salesUnitPriceMinor === null
          ? null
          : calculateLineTotal(quantity, row.salesUnitPriceMinor).toString(),
      currency: 'EUR',
      costStatus: row.costStatus,
      sortOrder: row.sortOrder,
      note: row.note,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapCalculation(row: CalculationRow): EventCalculationRecord {
    const positions = row.positions.map((position) => this.mapPosition(position));
    const activePositions = positions.filter((position) => position.status === 'ACTIVE');
    const bookingCosts = row.event.bookings.flatMap((booking) => {
      const costStatus =
        booking.status === 'CONFIRMED' ? ('COMMITTED' as const) : ('PLANNED' as const);
      const artistName =
        booking.artist.stageName ??
        ([booking.artist.firstName, booking.artist.lastName].filter(Boolean).join(' ') || 'Artist');
      const values = [
        {
          kind: 'FEE' as const,
          label: 'Gage',
          minor: booking.agreedFeeMinor,
          currency: booking.agreedFeeCurrency,
        },
        {
          kind: 'TRAVEL' as const,
          label: 'Reisekosten',
          minor: booking.travelCostMinor,
          currency: booking.travelCostCurrency,
        },
        {
          kind: 'HOTEL_BUYOUT' as const,
          label: 'Hotel-Buy-out',
          minor: booking.hotelArrangement === 'BUYOUT' ? booking.hotelBuyoutMinor : null,
          currency: booking.hotelBuyoutCurrency,
        },
      ];
      return values
        .filter((value) => value.minor !== null && value.currency === 'EUR')
        .map((value) => ({
          id: `${booking.id}:${value.kind}`,
          bookingId: booking.id,
          kind: value.kind,
          label: value.label,
          artistName,
          bookingStatus: booking.status,
          costStatus,
          amountMinor: value.minor!.toString(),
          currency: 'EUR' as const,
        }));
    });
    let servicePurchase = 0n;
    let serviceSales = 0n;
    let committed = 0n;
    let planned = 0n;
    const missingPurchase: string[] = [];
    const missingSales: string[] = [];
    for (const position of activePositions) {
      if (position.purchaseTotalMinor === null || position.purchaseTotalMinor === undefined) {
        missingPurchase.push(position.id);
      } else {
        const value = BigInt(position.purchaseTotalMinor);
        servicePurchase += value;
        if (position.costStatus === 'COMMITTED') committed += value;
        else planned += value;
      }
      if (position.salesTotalMinor === null || position.salesTotalMinor === undefined) {
        missingSales.push(position.id);
      } else {
        serviceSales += BigInt(position.salesTotalMinor);
      }
    }
    for (const cost of bookingCosts) {
      const value = BigInt(cost.amountMinor!);
      if (cost.costStatus === 'COMMITTED') committed += value;
      else planned += value;
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      eventName: row.event.name,
      locationId: row.event.locationId,
      status: row.status,
      version: row.version,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedByName: row.approvedByUser?.name ?? null,
      positions,
      bookingCosts,
      totals: {
        estimatedCostMinor: (committed + planned).toString(),
        committedCostMinor: committed.toString(),
        plannedCostMinor: planned.toString(),
        servicePurchaseValueMinor: servicePurchase.toString(),
        serviceSalesValueMinor: serviceSales.toString(),
        serviceMarginMinor: (serviceSales - servicePurchase).toString(),
        incomplete: missingPurchase.length > 0 || missingSales.length > 0,
        missingPurchasePricePositionIds: missingPurchase,
        missingSalesPricePositionIds: missingSales,
      },
      history: row.statusHistory.map((history) => ({
        id: history.id,
        previousStatus: history.previousStatus,
        newStatus: history.newStatus,
        actorName: history.actorUser.name,
        note: history.note,
        reason: history.reason,
        changedSourceType: history.changedSourceType,
        changedSourceId: history.changedSourceId,
        changedAt: history.changedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async appendAudit(
    database: TransactionClient,
    access: AccessContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await this.audit.append(database, access, action, targetType, targetId, metadata);
  }

  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (isPrismaError(error, 'P2002')) throw new ServiceCalculationPersistenceError(code, message);
    throw error;
  }

  private rethrowProviderUnique(error: unknown): never {
    if (isPrismaError(error, 'P2002')) {
      throw new ServiceCalculationPersistenceError(
        'SERVICE_PROVIDER_CONFLICT',
        'Der Dienstleister ist bereits aktiv zugeordnet oder es besteht bereits ein bevorzugter Dienstleister',
      );
    }
    throw error;
  }

  private rethrowFormatUnique(error: unknown): never {
    if (isPrismaError(error, 'P2002')) {
      throw new ServiceCalculationPersistenceError(
        'EVENT_FORMAT_SERVICE_CONFLICT',
        'Die Leistung oder Reihenfolge ist in diesem Format bereits aktiv belegt',
      );
    }
    throw error;
  }
}

function decimalString(value: Prisma.Decimal): string {
  return value
    .toFixed(4)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

function selectedLocationSql(access: AccessContext): Prisma.Sql {
  if (access.locationScope !== 'SELECTED') return Prisma.empty;
  if (access.locationIds.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND event."location_id" IN (${Prisma.join(
    access.locationIds.map((id) => Prisma.sql`${id}::uuid`),
  )})`;
}

function isPrismaError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
