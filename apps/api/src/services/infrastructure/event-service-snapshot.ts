import type { TransactionClient } from '@venue/database';

import { resolveCatalogProvider } from '../domain/catalog-price-resolution.js';

export class EventServiceSnapshotError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EventServiceSnapshotError';
  }
}

/**
 * Creates the event's single calculation and copies format services in the same
 * transaction as event creation. Catalog values are resolved exactly once here.
 */
export async function createEventServiceSnapshot(
  database: TransactionClient,
  organizationId: string,
  eventId: string,
  eventFormatId: string | null,
): Promise<void> {
  const calculation = await database.eventCalculation.create({
    data: { organizationId, eventId },
  });
  if (!eventFormatId) return;

  const requirements = await database.eventFormatService.findMany({
    where: { organizationId, eventFormatId, status: 'ACTIVE' },
    include: {
      service: {
        include: {
          category: { select: { name: true, status: true } },
          providerPrices: {
            where: { status: 'ACTIVE' },
            include: { businessPartner: { select: { companyName: true, status: true } } },
            orderBy: [{ preferred: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
      providerBusinessPartner: { select: { companyName: true, status: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  const invalid = requirements.find((requirement) => {
    if (
      requirement.service.status !== 'ACTIVE' ||
      requirement.service.category.status !== 'ACTIVE'
    ) {
      return true;
    }
    if (
      requirement.providerBusinessPartnerId &&
      (requirement.providerBusinessPartner?.status !== 'ACTIVE' ||
        !requirement.service.providerPrices.some(
          (price) =>
            price.businessPartnerId === requirement.providerBusinessPartnerId &&
            price.businessPartner.status === 'ACTIVE',
        ))
    ) {
      return true;
    }
    return false;
  });
  if (invalid) {
    throw new EventServiceSnapshotError(
      'EVENT_FORMAT_SERVICES_REQUIRE_CORRECTION',
      `Die Leistungsvorgabe „${invalid.service.name}“ verweist auf archivierte oder nicht mehr aktive Stammdaten`,
    );
  }

  if (requirements.length === 0) return;
  await database.eventServicePosition.createMany({
    data: requirements.map((requirement) => {
      const providerPrice = resolveCatalogProvider(
        requirement.service.providerPrices,
        requirement.providerBusinessPartnerId,
      );
      return {
        organizationId,
        eventId,
        calculationId: calculation.id,
        source: 'EVENT_FORMAT' as const,
        sourceServiceId: requirement.serviceId,
        sourceServiceVersion: requirement.service.version,
        sourceEventFormatServiceId: requirement.id,
        sourceEventFormatServiceVersion: requirement.version,
        nameSnapshot: requirement.service.name,
        categoryNameSnapshot: requirement.service.category.name,
        unit: requirement.service.unit,
        quantity: requirement.quantity,
        providerBusinessPartnerId: providerPrice?.businessPartnerId ?? null,
        providerNameSnapshot: providerPrice?.businessPartner.companyName ?? null,
        purchaseUnitPriceMinor:
          requirement.purchasePriceOverrideMinor ?? providerPrice?.purchasePriceMinor ?? null,
        salesUnitPriceMinor:
          requirement.salesPriceOverrideMinor ?? requirement.service.defaultSalesPriceMinor,
        currency: 'EUR',
        costStatus: 'PLANNED' as const,
        sortOrder: requirement.sortOrder,
      };
    }),
  });
}
