import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from '../../security/access.types.js';
import type { EventCalculationRecord, ServiceRecord } from './service-calculation.models.js';
import type { ServiceCalculationRepository } from './service-calculation.repository.js';
import { ServiceCalculationService } from './service-calculation.service.js';

const organizationId = '10000000-0000-4000-8000-000000000001';
const eventId = '10000000-0000-4000-8000-000000000002';
const positionId = '10000000-0000-4000-8000-000000000003';

describe('ServiceCalculationService', () => {
  it('redacts purchase, sales, margin and internal values on the server', async () => {
    const repository = fakeRepository({
      listServices: vi.fn(async () => ({
        items: [serviceRecord()],
        total: 1,
        limit: 25,
        offset: 0,
      })),
      findCalculation: vi.fn(async () => calculationRecord()),
    });
    const service = new ServiceCalculationService(repository);
    const structureOnly = access(['services.read', 'calculations.read']);

    const catalog = await service.listServices(structureOnly, {
      status: 'ACTIVE',
      limit: 25,
      offset: 0,
    });
    expect(catalog.items[0]).not.toHaveProperty('defaultSalesPriceMinor');
    expect(catalog.items[0]).not.toHaveProperty('providerPrices');
    expect(catalog.items[0]).not.toHaveProperty('preferredProvider');
    expect(catalog.items[0]).not.toHaveProperty('internalNote');

    const calculation = await service.getCalculation(structureOnly, eventId);
    expect(calculation.positions[0]).not.toHaveProperty('purchaseUnitPriceMinor');
    expect(calculation.positions[0]).not.toHaveProperty('purchaseTotalMinor');
    expect(calculation.positions[0]).not.toHaveProperty('salesUnitPriceMinor');
    expect(calculation.positions[0]).not.toHaveProperty('salesTotalMinor');
    expect(calculation.bookingCosts[0]).not.toHaveProperty('amountMinor');
    expect(calculation.totals).not.toHaveProperty('estimatedCostMinor');
    expect(calculation.totals).not.toHaveProperty('serviceSalesValueMinor');
    expect(calculation.totals).not.toHaveProperty('serviceMarginMinor');
    expect(calculation.positions[0]).toMatchObject({ id: positionId, quantity: '2.5' });
  });

  it('rejects financial writes independently from structural write permission', async () => {
    const service = new ServiceCalculationService(fakeRepository());
    const structuralWriter = access(['calculations.write']);

    await expect(
      service.addEventPosition(structuralWriter, eventId, {
        name: 'Stagehand',
        categoryName: 'Personal',
        unit: 'HOUR',
        quantity: '2',
        purchaseUnitPriceMinor: '5000',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.addEventPosition(structuralWriter, eventId, {
        name: 'Stagehand',
        categoryName: 'Personal',
        unit: 'HOUR',
        quantity: '2',
        salesUnitPriceMinor: '8000',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createService(access(['services.write']), {
        categoryId: '10000000-0000-4000-8000-000000000007',
        name: 'Tontechnik',
        unit: 'FLAT_RATE',
        defaultSalesPriceMinor: '50000',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces approval permission and optimistic versions before persisting', async () => {
    const repository = fakeRepository({ findCalculation: vi.fn(async () => calculationRecord()) });
    const service = new ServiceCalculationService(repository);

    await expect(
      service.setCalculationStatus(access(['calculations.write']), eventId, 4, 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.setCalculationStatus(access(['calculations.approve']), eventId, 3, 'APPROVED'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.setCalculationStatus).not.toHaveBeenCalled();
  });

  it('keeps omitted create prices unresolved while preserving explicit values and null', async () => {
    const addEventPosition = vi.fn<ServiceCalculationRepository['addEventPosition']>(async () =>
      catalogPositionRecord(),
    );
    const service = new ServiceCalculationService(fakeRepository({ addEventPosition }));
    const financialWriter = access(['calculations.purchase', 'calculations.sales']);

    await service.addEventPosition(financialWriter, eventId, {
      sourceServiceId: serviceRecord().id,
      quantity: '1',
    });
    expect(addEventPosition.mock.calls[0]?.[2]).toMatchObject({
      purchaseUnitPriceMinor: undefined,
      salesUnitPriceMinor: undefined,
    });

    await service.addEventPosition(financialWriter, eventId, {
      sourceServiceId: serviceRecord().id,
      quantity: '1',
      purchaseUnitPriceMinor: '1234',
      salesUnitPriceMinor: null,
    });
    expect(addEventPosition.mock.calls[1]?.[2]).toMatchObject({
      purchaseUnitPriceMinor: 1234n,
      salesUnitPriceMinor: null,
    });
  });

  it('distinguishes omitted update prices from explicit null', async () => {
    const current = catalogPositionRecord();
    const updateEventPosition = vi.fn<ServiceCalculationRepository['updateEventPosition']>(
      async () => current,
    );
    const service = new ServiceCalculationService(
      fakeRepository({
        findEventPosition: vi.fn(async () => current),
        updateEventPosition,
      }),
    );
    const financialWriter = access(['calculations.purchase', 'calculations.sales']);

    await service.updateEventPosition(financialWriter, positionId, 1, { quantity: '3' });
    expect(updateEventPosition.mock.calls[0]?.[3]).toMatchObject({
      purchaseUnitPriceMinor: 5000n,
      salesUnitPriceMinor: 8000n,
    });

    await service.updateEventPosition(financialWriter, positionId, 1, {
      purchaseUnitPriceMinor: null,
      salesUnitPriceMinor: '9000',
    });
    expect(updateEventPosition.mock.calls[1]?.[3]).toMatchObject({
      purchaseUnitPriceMinor: null,
      salesUnitPriceMinor: 9000n,
    });
  });

  it('redacts catalog price previews and rejects refreshes for custom positions', async () => {
    const repository = fakeRepository({
      previewEventPositionCatalogPrices: vi.fn<
        ServiceCalculationRepository['previewEventPositionCatalogPrices']
      >(async () => ({
        positionId,
        positionVersion: 1,
        source: 'SERVICE_CATALOG',
        providerBusinessPartnerId: null,
        providerName: null,
        providerWillBeApplied: false,
        purchaseUnitPriceMinor: '5000',
        purchaseWillBeApplied: true,
        salesUnitPriceMinor: '8000',
        salesWillBeApplied: true,
      })),
      findEventPosition: vi.fn(async () => calculationRecord().positions[0]),
    });
    const service = new ServiceCalculationService(repository);
    const preview = await service.previewEventPositionCatalogPrices(
      access(['calculations.read']),
      positionId,
    );
    expect(preview).not.toHaveProperty('purchaseUnitPriceMinor');
    expect(preview).not.toHaveProperty('purchaseWillBeApplied');
    expect(preview).not.toHaveProperty('salesUnitPriceMinor');
    expect(preview).not.toHaveProperty('salesWillBeApplied');

    await expect(
      service.applyEventPositionCatalogPrices(
        access(['calculations.write', 'calculations.purchase', 'calculations.sales']),
        positionId,
        1,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.applyEventPositionCatalogPrices).not.toHaveBeenCalled();
  });
});

function access(permissions: AccessContext['permissions']): AccessContext {
  return {
    user: {
      id: '10000000-0000-4000-8000-000000000004',
      name: 'Phase Seven User',
      email: 'phase7@example.test',
    },
    membershipId: '10000000-0000-4000-8000-000000000005',
    organizationId,
    membershipVersion: 1,
    permissions,
    locationScope: 'ALL',
    locationIds: [],
  };
}

function serviceRecord(): ServiceRecord {
  return {
    id: '10000000-0000-4000-8000-000000000006',
    organizationId,
    categoryId: '10000000-0000-4000-8000-000000000007',
    categoryName: 'Technik',
    categoryStatus: 'ACTIVE',
    name: 'Tontechnik',
    normalizedName: 'tontechnik',
    unit: 'FLAT_RATE',
    defaultSalesPriceMinor: '50000',
    currency: 'EUR',
    internalNote: 'sensible',
    preferredProvider: null,
    providerPrices: [],
    status: 'ACTIVE',
    version: 1,
    archivedAt: null,
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T08:00:00.000Z',
  };
}

function calculationRecord(): EventCalculationRecord {
  return {
    id: '10000000-0000-4000-8000-000000000008',
    organizationId,
    eventId,
    eventName: 'Phase Seven Event',
    locationId: '10000000-0000-4000-8000-000000000009',
    status: 'REVIEW',
    version: 4,
    approvedAt: null,
    approvedByName: null,
    positions: [
      {
        id: positionId,
        organizationId,
        eventId,
        calculationId: '10000000-0000-4000-8000-000000000008',
        source: 'CUSTOM',
        sourceServiceId: null,
        sourceServiceVersion: null,
        sourceEventFormatServiceId: null,
        sourceEventFormatServiceVersion: null,
        name: 'Stagehand',
        categoryName: 'Personal',
        unit: 'HOUR',
        quantity: '2.5',
        providerBusinessPartnerId: null,
        providerName: null,
        purchaseUnitPriceMinor: '5000',
        purchaseTotalMinor: '12500',
        salesUnitPriceMinor: '8000',
        salesTotalMinor: '20000',
        currency: 'EUR',
        costStatus: 'PLANNED',
        sortOrder: 1,
        note: null,
        status: 'ACTIVE',
        version: 1,
        archivedAt: null,
        createdAt: '2026-08-24T08:00:00.000Z',
        updatedAt: '2026-08-24T08:00:00.000Z',
      },
    ],
    bookingCosts: [
      {
        id: 'booking:FEE',
        bookingId: '10000000-0000-4000-8000-000000000010',
        kind: 'FEE',
        label: 'Gage',
        artistName: 'Artist',
        bookingStatus: 'OPTION',
        costStatus: 'PLANNED',
        amountMinor: '25000',
        currency: 'EUR',
      },
    ],
    totals: {
      estimatedCostMinor: '37500',
      committedCostMinor: '0',
      plannedCostMinor: '37500',
      servicePurchaseValueMinor: '12500',
      serviceSalesValueMinor: '20000',
      serviceMarginMinor: '7500',
      incomplete: false,
      missingPurchasePricePositionIds: [],
      missingSalesPricePositionIds: [],
    },
    history: [],
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T08:00:00.000Z',
  };
}

function catalogPositionRecord(): EventCalculationRecord['positions'][number] {
  return {
    ...calculationRecord().positions[0]!,
    source: 'SERVICE_CATALOG',
    sourceServiceId: serviceRecord().id,
    sourceServiceVersion: 1,
  };
}

function fakeRepository(
  overrides: Partial<ServiceCalculationRepository> = {},
): ServiceCalculationRepository {
  return {
    listCategories: vi.fn(),
    findCategory: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    setCategoryStatus: vi.fn(),
    listServices: vi.fn(),
    findService: vi.fn(),
    createService: vi.fn(),
    updateService: vi.fn(),
    setServiceStatus: vi.fn(),
    createProviderPrice: vi.fn(),
    findProviderPrice: vi.fn(),
    updateProviderPrice: vi.fn(),
    setProviderPriceStatus: vi.fn(),
    listFormatServices: vi.fn(),
    createFormatService: vi.fn(),
    findFormatService: vi.fn(),
    updateFormatService: vi.fn(),
    setFormatServiceStatus: vi.fn(),
    findCalculation: vi.fn(),
    addEventPosition: vi.fn(),
    findEventPosition: vi.fn(),
    updateEventPosition: vi.fn(),
    previewEventPositionCatalogPrices: vi.fn(),
    applyEventPositionCatalogPrices: vi.fn(),
    setEventPositionStatus: vi.fn(),
    setCalculationStatus: vi.fn(),
    ...overrides,
  } as ServiceCalculationRepository;
}
