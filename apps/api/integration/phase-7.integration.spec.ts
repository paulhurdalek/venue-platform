import type { INestApplication } from '@nestjs/common';
import { cleanTestDatabase } from '@venue/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { AuthService } from '../src/auth/auth.service.js';
import { createApiApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SetupService } from '../src/setup/setup.service.js';

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe.sequential : describe.skip;
const origin = 'http://localhost:3100';
const password = 'Local-Test-Admin-77!';

describeWithDatabase('Phase 7 services and calculation integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let productionAgent: ReturnType<typeof request.agent>;
  let restrictedProductionAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let secondLocationId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    setup = application.get(SetupService);
    auth = application.get(AuthService);
    await cleanTestDatabase(prisma.database);

    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase Seven Administrator',
        email: 'phase7-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Seven Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    secondLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Second Hall', timezone: 'Europe/Berlin' },
      })
    ).id;
    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase7-admin@example.test')).status).toBe(200);
    productionAgent = await createRoleAgent('production', 'phase7-production@example.test');
    restrictedProductionAgent = await createRoleAgent(
      'production',
      'phase7-restricted@example.test',
      'SELECTED',
      [secondLocationId],
    );
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('backfills the exact Phase 7 default permission matrix', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    const matrix = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions
          .map(({ permission }) => permission.key)
          .filter((key) => key.startsWith('services.') || key.startsWith('calculations.'))
          .sort(),
      ]),
    );
    const allPermissions = [
      'calculations.approve',
      'calculations.purchase',
      'calculations.read',
      'calculations.sales',
      'calculations.write',
      'services.archive',
      'services.read',
      'services.write',
    ];
    expect(matrix).toEqual({
      administrator: allPermissions,
      booking: ['services.read'],
      management_finance: allPermissions,
      production: ['calculations.read', 'services.read'],
      read_only: ['calculations.read', 'services.read'],
    });
  });

  it('covers catalog lifecycle, relational snapshots, exact totals and approval reset', async () => {
    const category = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/service-categories`)
      .send({ name: '  Technik  ' });
    expect(category.status).toBe(201);
    expect(category.body).toMatchObject({ name: 'Technik', normalizedName: 'technik' });
    const duplicateCategory = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/service-categories`)
      .send({ name: 'TECHNIK' });
    expect(duplicateCategory.status).toBe(409);
    expect(duplicateCategory.body.code).toBe('SERVICE_CATEGORY_NAME_CONFLICT');

    const service = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/services`)
      .send({
        categoryId: category.body.id,
        name: 'Tontechnik',
        unit: 'HOUR',
        defaultSalesPriceMinor: '60000',
        internalNote: 'Nur intern',
      });
    expect(service.status).toBe(201);
    expect(service.body).toMatchObject({ defaultSalesPriceMinor: '60000', currency: 'EUR' });

    const [partnerOne, partnerTwo] = await Promise.all([
      prisma.database.businessPartner.create({
        data: { organizationId, companyName: 'Technikfirma A' },
      }),
      prisma.database.businessPartner.create({
        data: { organizationId, companyName: 'Technikfirma B' },
      }),
    ]);
    const providerOne = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/services/${service.body.id as string}/provider-prices`,
      )
      .send({ businessPartnerId: partnerOne.id, purchasePriceMinor: '35000', preferred: true });
    const providerTwo = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/services/${service.body.id as string}/provider-prices`,
      )
      .send({ businessPartnerId: partnerTwo.id, purchasePriceMinor: '0', preferred: false });
    expect(providerOne.status).toBe(201);
    expect(providerTwo.status).toBe(201);
    expect(providerTwo.body.purchasePriceMinor).toBe('0');
    const duplicatePreferred = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-provider-prices/${providerTwo.body.id as string}`,
      )
      .send({ version: providerTwo.body.version, preferred: true });
    expect(duplicatePreferred.status).toBe(409);
    expect(duplicatePreferred.body.code).toBe('SERVICE_PROVIDER_CONFLICT');
    const archivedProvider = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-provider-prices/${providerTwo.body.id as string}/status`,
      )
      .send({ version: providerTwo.body.version, status: 'ARCHIVED' });
    expect(archivedProvider.body.status).toBe('ARCHIVED');
    const reactivatedProvider = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-provider-prices/${providerTwo.body.id as string}/status`,
      )
      .send({ version: archivedProvider.body.version, status: 'ACTIVE' });
    expect(reactivatedProvider.body).toMatchObject({ status: 'ACTIVE', purchasePriceMinor: '0' });

    const temporaryCategory = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/service-categories`)
      .send({ name: 'Temporär' });
    const archivedCategory = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-categories/${temporaryCategory.body.id as string}/status`,
      )
      .send({ version: temporaryCategory.body.version, status: 'ARCHIVED' });
    expect(archivedCategory.body.status).toBe('ARCHIVED');
    const reactivatedCategory = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-categories/${temporaryCategory.body.id as string}/status`,
      )
      .send({ version: archivedCategory.body.version, status: 'ACTIVE' });
    expect(reactivatedCategory.body.status).toBe('ACTIVE');

    const blockedCategoryArchive = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-categories/${category.body.id as string}/status`,
      )
      .send({ version: category.body.version, status: 'ARCHIVED' });
    expect(blockedCategoryArchive.status).toBe(409);
    expect(blockedCategoryArchive.body.code).toBe('SERVICE_CATEGORY_IN_USE');

    const format = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'Phase Seven Show', eventKind: 'OWN_PRODUCTION' });
    expect(format.status).toBe(201);
    const formatService = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/event-formats/${format.body.id as string}/services`,
      )
      .send({
        serviceId: service.body.id,
        quantity: '2,5',
        providerBusinessPartnerId: partnerOne.id,
        salesPriceOverrideMinor: '70000',
        sortOrder: 1,
      });
    expect(formatService.status).toBe(201);
    expect(formatService.body).toMatchObject({
      quantity: '2.5',
      resolvedPurchasePriceMinor: '35000',
      resolvedSalesPriceMinor: '70000',
    });

    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        sourceEventFormatId: format.body.id,
        locationId,
        eventDate: '2026-12-10',
      });
    expect(event.status).toBe(201);
    const eventId = event.body.id as string;
    let calculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    expect(calculation.status).toBe(200);
    expect(calculation.body.positions).toEqual([
      expect.objectContaining({
        source: 'EVENT_FORMAT',
        sourceServiceId: service.body.id,
        sourceServiceVersion: 1,
        sourceEventFormatServiceId: formatService.body.id,
        sourceEventFormatServiceVersion: 1,
        name: 'Tontechnik',
        categoryName: 'Technik',
        quantity: '2.5',
        providerName: 'Technikfirma A',
        purchaseUnitPriceMinor: '35000',
        salesUnitPriceMinor: '70000',
      }),
    ]);
    const snapshotPosition = calculation.body.positions[0] as Record<string, unknown>;

    const changedService = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/services/${service.body.id as string}`)
      .send({
        version: service.body.version,
        name: 'Tontechnik Neu',
        defaultSalesPriceMinor: '90000',
      });
    expect(changedService.status).toBe(200);
    const changedPosition = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}`,
      )
      .send({ version: snapshotPosition.version, quantity: '2.75' });
    expect(changedPosition.status).toBe(200);
    expect(changedPosition.body).toMatchObject({
      name: 'Tontechnik',
      categoryName: 'Technik',
      sourceServiceVersion: 1,
      quantity: '2.75',
      purchaseUnitPriceMinor: '35000',
      salesUnitPriceMinor: '70000',
    });
    const clearedSnapshotPrices = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}`,
      )
      .send({
        version: changedPosition.body.version,
        purchaseUnitPriceMinor: null,
        salesUnitPriceMinor: null,
      });
    expect(clearedSnapshotPrices.status).toBe(200);
    expect(clearedSnapshotPrices.body).toMatchObject({
      purchaseUnitPriceMinor: null,
      salesUnitPriceMinor: null,
    });
    const snapshotPricePreview = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}/catalog-price-preview`,
    );
    expect(snapshotPricePreview.status).toBe(200);
    expect(snapshotPricePreview.body).toMatchObject({
      positionVersion: clearedSnapshotPrices.body.version,
      source: 'EVENT_FORMAT',
      purchaseUnitPriceMinor: '35000',
      purchaseWillBeApplied: true,
      salesUnitPriceMinor: '70000',
      salesWillBeApplied: true,
    });
    const redactedSnapshotPreview = await productionAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}/catalog-price-preview`,
    );
    expect(redactedSnapshotPreview.status).toBe(200);
    expect(redactedSnapshotPreview.body).not.toHaveProperty('purchaseUnitPriceMinor');
    expect(redactedSnapshotPreview.body).not.toHaveProperty('purchaseWillBeApplied');
    expect(redactedSnapshotPreview.body).not.toHaveProperty('salesUnitPriceMinor');
    expect(redactedSnapshotPreview.body).not.toHaveProperty('salesWillBeApplied');
    const scopedPreview = await restrictedProductionAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}/catalog-price-preview`,
    );
    expect(scopedPreview.status).toBe(404);
    const appliedSnapshotPrices = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}/catalog-prices`,
      )
      .send({ version: clearedSnapshotPrices.body.version });
    expect(appliedSnapshotPrices.status).toBe(200);
    expect(appliedSnapshotPrices.body).toMatchObject({
      sourceServiceVersion: 1,
      sourceEventFormatServiceVersion: 1,
      purchaseUnitPriceMinor: '35000',
      salesUnitPriceMinor: '70000',
    });
    expect(
      await prisma.database.auditLog.count({
        where: {
          organizationId,
          action: 'event_service_position.catalog_prices_applied',
          targetId: snapshotPosition.id as string,
        },
      }),
    ).toBe(1);
    const staleSnapshotApply = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}/catalog-prices`,
      )
      .send({ version: clearedSnapshotPrices.body.version });
    expect(staleSnapshotApply.status).toBe(409);
    expect(staleSnapshotApply.body.code).toBe('VERSION_CONFLICT');
    const restoredPosition = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${snapshotPosition.id as string}`,
      )
      .send({ version: appliedSnapshotPrices.body.version, quantity: '2.5' });
    expect(restoredPosition.status).toBe(200);

    const option = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/date-options`)
      .send({
        locationId,
        optionDate: '2026-12-12',
        occupancyStartTime: '16:00',
        occupancyEndTime: '23:00',
        label: 'Phase Seven Option',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(option.status).toBe(201);
    const converted = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/date-options/${option.body.id as string}/convert`,
      )
      .send({ version: option.body.version, sourceEventFormatId: format.body.id });
    expect(converted.status).toBe(201);
    const convertedCalculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${converted.body.id as string}/calculation`,
    );
    expect(convertedCalculation.body.positions).toEqual([
      expect.objectContaining({
        source: 'EVENT_FORMAT',
        name: 'Tontechnik Neu',
        salesUnitPriceMinor: '70000',
      }),
    ]);

    const freeEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Freie Kalkulation',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-12-14',
      });
    expect(freeEvent.status).toBe(201);
    const freeCalculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${freeEvent.body.id as string}/calculation`,
    );
    expect(freeCalculation.body.positions).toEqual([]);

    const catalogEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        name: 'Katalogpreisregeln',
        eventKind: 'OWN_PRODUCTION',
        locationId,
        eventDate: '2026-12-15',
      });
    expect(catalogEvent.status).toBe(201);
    const catalogEventId = catalogEvent.body.id as string;
    const preferredCatalogPosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/positions`,
      )
      .send({ sourceServiceId: service.body.id, quantity: '1', sortOrder: 1 });
    expect(preferredCatalogPosition.status).toBe(201);
    expect(preferredCatalogPosition.body).toMatchObject({
      source: 'SERVICE_CATALOG',
      providerBusinessPartnerId: partnerOne.id,
      providerName: 'Technikfirma A',
      purchaseUnitPriceMinor: '35000',
      salesUnitPriceMinor: '90000',
    });
    const selectedCatalogPosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/positions`,
      )
      .send({
        sourceServiceId: service.body.id,
        providerBusinessPartnerId: partnerTwo.id,
        quantity: '1',
        sortOrder: 2,
      });
    expect(selectedCatalogPosition.status).toBe(201);
    expect(selectedCatalogPosition.body).toMatchObject({
      providerBusinessPartnerId: partnerTwo.id,
      purchaseUnitPriceMinor: '0',
      salesUnitPriceMinor: '90000',
    });
    const explicitCatalogPosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/positions`,
      )
      .send({
        sourceServiceId: service.body.id,
        quantity: '1',
        purchaseUnitPriceMinor: '11111',
        salesUnitPriceMinor: '22222',
        sortOrder: 3,
      });
    expect(explicitCatalogPosition.status).toBe(201);
    expect(explicitCatalogPosition.body).toMatchObject({
      purchaseUnitPriceMinor: '11111',
      salesUnitPriceMinor: '22222',
    });
    const preservedExplicitPosition = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${explicitCatalogPosition.body.id as string}`,
      )
      .send({ version: explicitCatalogPosition.body.version, quantity: '2' });
    expect(preservedExplicitPosition.body).toMatchObject({
      purchaseUnitPriceMinor: '11111',
      salesUnitPriceMinor: '22222',
    });
    const removedExplicitSalesPrice = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${explicitCatalogPosition.body.id as string}`,
      )
      .send({ version: preservedExplicitPosition.body.version, salesUnitPriceMinor: null });
    expect(removedExplicitSalesPrice.body).toMatchObject({
      purchaseUnitPriceMinor: '11111',
      salesUnitPriceMinor: null,
    });
    const restoredExplicitSalesPrice = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${explicitCatalogPosition.body.id as string}/catalog-prices`,
      )
      .send({ version: removedExplicitSalesPrice.body.version });
    expect(restoredExplicitSalesPrice.body).toMatchObject({
      purchaseUnitPriceMinor: '11111',
      salesUnitPriceMinor: '90000',
    });

    const singleProviderService = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/services`)
      .send({
        categoryId: category.body.id,
        name: 'Einziger Dienstleister',
        unit: 'FLAT_RATE',
        defaultSalesPriceMinor: '40000',
      });
    expect(singleProviderService.status).toBe(201);
    expect(
      (
        await administratorAgent
          .post(
            `/api/v1/organizations/${organizationId}/services/${singleProviderService.body.id as string}/provider-prices`,
          )
          .send({
            businessPartnerId: partnerOne.id,
            purchasePriceMinor: '12000',
            preferred: false,
          })
      ).status,
    ).toBe(201);
    const singleProviderPosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/positions`,
      )
      .send({ sourceServiceId: singleProviderService.body.id, quantity: '1', sortOrder: 4 });
    expect(singleProviderPosition.body).toMatchObject({
      providerBusinessPartnerId: partnerOne.id,
      purchaseUnitPriceMinor: '12000',
      salesUnitPriceMinor: '40000',
    });

    const ambiguousProviderService = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/services`)
      .send({
        categoryId: category.body.id,
        name: 'Mehrere Dienstleister',
        unit: 'FLAT_RATE',
        defaultSalesPriceMinor: '50000',
      });
    const ambiguousProviderOne = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/services/${ambiguousProviderService.body.id as string}/provider-prices`,
      )
      .send({ businessPartnerId: partnerOne.id, purchasePriceMinor: '21000', preferred: false });
    const ambiguousProviderTwo = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/services/${ambiguousProviderService.body.id as string}/provider-prices`,
      )
      .send({ businessPartnerId: partnerTwo.id, purchasePriceMinor: '22000', preferred: false });
    expect(ambiguousProviderOne.status).toBe(201);
    expect(ambiguousProviderTwo.status).toBe(201);
    const ambiguousPosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/positions`,
      )
      .send({
        sourceServiceId: ambiguousProviderService.body.id,
        quantity: '1',
        salesUnitPriceMinor: '77777',
        sortOrder: 5,
      });
    expect(ambiguousPosition.body).toMatchObject({
      providerBusinessPartnerId: null,
      purchaseUnitPriceMinor: null,
      salesUnitPriceMinor: '77777',
    });
    const unresolvedAmbiguousPreview = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${ambiguousPosition.body.id as string}/catalog-price-preview`,
    );
    expect(unresolvedAmbiguousPreview.body).toMatchObject({
      purchaseUnitPriceMinor: null,
      purchaseWillBeApplied: false,
      salesWillBeApplied: false,
    });
    const preferredAmbiguousProvider = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/service-provider-prices/${ambiguousProviderTwo.body.id as string}`,
      )
      .send({ version: ambiguousProviderTwo.body.version, preferred: true });
    expect(preferredAmbiguousProvider.status).toBe(200);
    const resolvableAmbiguousPreview = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${ambiguousPosition.body.id as string}/catalog-price-preview`,
    );
    expect(resolvableAmbiguousPreview.body).toMatchObject({
      providerBusinessPartnerId: partnerTwo.id,
      providerWillBeApplied: true,
      purchaseUnitPriceMinor: '22000',
      purchaseWillBeApplied: true,
      salesWillBeApplied: false,
    });
    const resolvedAmbiguousPosition = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${ambiguousPosition.body.id as string}/catalog-prices`,
      )
      .send({ version: ambiguousPosition.body.version });
    expect(resolvedAmbiguousPosition.body).toMatchObject({
      providerBusinessPartnerId: partnerTwo.id,
      purchaseUnitPriceMinor: '22000',
      salesUnitPriceMinor: '77777',
    });
    const catalogCalculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation`,
    );
    expect(catalogCalculation.body.totals.incomplete).toBe(false);
    const catalogReview = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/status`)
      .send({ version: catalogCalculation.body.version, status: 'REVIEW' });
    expect(catalogReview.status).toBe(200);
    const catalogApproval = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${catalogEventId}/calculation/status`)
      .send({ version: catalogReview.body.version, status: 'APPROVED' });
    expect(catalogApproval.status).toBe(200);

    const incompletePosition = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${freeEvent.body.id as string}/calculation/positions`,
      )
      .send({
        name: 'Preis noch offen',
        categoryName: 'Sonstiges',
        unit: 'FLAT_RATE',
        quantity: '1',
        purchaseUnitPriceMinor: null,
        salesUnitPriceMinor: null,
        costStatus: 'PLANNED',
        sortOrder: 1,
      });
    expect(incompletePosition.status).toBe(201);
    const customPricePreview = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-service-positions/${incompletePosition.body.id as string}/catalog-price-preview`,
    );
    expect(customPricePreview.status).toBe(422);
    expect(customPricePreview.body.code).toBe('CATALOG_PRICE_REFRESH_UNAVAILABLE');
    const incompleteReview = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/events/${freeEvent.body.id as string}/calculation/status`,
      )
      .send({ version: freeCalculation.body.version + 1, status: 'REVIEW' });
    expect(incompleteReview.status).toBe(200);
    const blockedApproval = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/events/${freeEvent.body.id as string}/calculation/status`,
      )
      .send({ version: incompleteReview.body.version, status: 'APPROVED' });
    expect(blockedApproval.status).toBe(422);
    expect(blockedApproval.body.code).toBe('CALCULATION_PRICES_INCOMPLETE');

    const individual = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/positions`)
      .send({
        name: 'Stagehands',
        categoryName: 'Personal',
        unit: 'HOUR',
        quantity: '3',
        purchaseUnitPriceMinor: '1000',
        salesUnitPriceMinor: '2000',
        costStatus: 'COMMITTED',
        sortOrder: 2,
      });
    expect(individual.status).toBe(201);

    const artist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Phase Seven Artist' },
    });
    const booking = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
      .send({
        artistId: artist.id,
        role: 'ARTIST',
        status: 'OPTION',
        agreedFeeMinor: '10000',
        agreedFeeCurrency: 'EUR',
        travelCostMinor: '2500',
        travelCostCurrency: 'EUR',
        hotelArrangement: 'BUYOUT',
        hotelBuyoutMinor: '5000',
        hotelBuyoutCurrency: 'EUR',
      });
    expect(booking.status).toBe(201);

    const [confirmedArtist, declinedArtist, cancelledArtist] = await Promise.all([
      prisma.database.artist.create({
        data: { organizationId, stageName: 'Confirmed Phase Seven Artist' },
      }),
      prisma.database.artist.create({
        data: { organizationId, stageName: 'Declined Phase Seven Artist' },
      }),
      prisma.database.artist.create({
        data: { organizationId, stageName: 'Cancelled Phase Seven Artist' },
      }),
    ]);
    expect(
      (
        await administratorAgent
          .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
          .send({
            artistId: confirmedArtist.id,
            role: 'ARTIST',
            status: 'CONFIRMED',
            agreedFeeMinor: '4000',
            agreedFeeCurrency: 'EUR',
            hotelArrangement: 'NONE',
          })
      ).status,
    ).toBe(201);
    for (const [excludedArtist, status] of [
      [declinedArtist, 'DECLINED'],
      [cancelledArtist, 'CANCELLED'],
    ] as const) {
      expect(
        (
          await administratorAgent
            .post(`/api/v1/organizations/${organizationId}/events/${eventId}/bookings`)
            .send({
              artistId: excludedArtist.id,
              role: 'ARTIST',
              status,
              agreedFeeMinor: '99900',
              agreedFeeCurrency: 'EUR',
              hotelArrangement: 'NONE',
            })
        ).status,
      ).toBe(201);
    }

    calculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    expect(calculation.body.bookingCosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'FEE', amountMinor: '10000', costStatus: 'PLANNED' }),
        expect.objectContaining({ kind: 'TRAVEL', amountMinor: '2500', costStatus: 'PLANNED' }),
        expect.objectContaining({
          kind: 'HOTEL_BUYOUT',
          amountMinor: '5000',
          costStatus: 'PLANNED',
        }),
        expect.objectContaining({ kind: 'FEE', amountMinor: '4000', costStatus: 'COMMITTED' }),
      ]),
    );
    expect(calculation.body.bookingCosts).toHaveLength(4);
    expect(calculation.body.totals).toMatchObject({
      estimatedCostMinor: '112000',
      committedCostMinor: '7000',
      plannedCostMinor: '105000',
      servicePurchaseValueMinor: '90500',
      serviceSalesValueMinor: '181000',
      serviceMarginMinor: '90500',
      incomplete: false,
    });

    const review = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/status`)
      .send({ version: calculation.body.version, status: 'REVIEW', note: 'Vier-Augen-Prüfung' });
    expect(review.status).toBe(200);
    const approved = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/status`)
      .send({ version: review.body.version, status: 'APPROVED', note: 'Freigegeben' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'APPROVED',
      approvedByName: 'Phase Seven Administrator',
    });

    const bookingChangeAuditCount = await prisma.database.auditLog.count({
      where: {
        organizationId,
        action: 'event_calculation.booking_source_changed',
        targetId: approved.body.id as string,
      },
    });
    const changedBooking = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/bookings/${booking.body.id as string}`)
      .send({ version: booking.body.version, agreedFeeMinor: '20000', agreedFeeCurrency: 'EUR' });
    expect(changedBooking.status).toBe(200);
    const reset = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    expect(reset.body.status).toBe('DRAFT');
    expect(reset.body.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previousStatus: 'APPROVED',
          newStatus: 'DRAFT',
          changedSourceType: 'booking',
          changedSourceId: booking.body.id,
          reason: 'Booking-Finanzdaten geändert',
        }),
      ]),
    );
    expect(
      await prisma.database.auditLog.count({
        where: {
          organizationId,
          action: 'event_calculation.booking_source_changed',
          targetId: reset.body.id,
        },
      }),
    ).toBe(bookingChangeAuditCount + 1);

    const productionView = await productionAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    expect(productionView.status).toBe(200);
    expect(productionView.body.positions[0]).not.toHaveProperty('purchaseUnitPriceMinor');
    expect(productionView.body.positions[0]).not.toHaveProperty('salesUnitPriceMinor');
    expect(productionView.body.bookingCosts[0]).not.toHaveProperty('amountMinor');
    expect(productionView.body.totals).not.toHaveProperty('estimatedCostMinor');
    expect(productionView.body.totals).not.toHaveProperty('serviceMarginMinor');
    expect(
      (
        await restrictedProductionAgent.get(
          `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
        )
      ).status,
    ).toBe(404);

    const firstPositionChange = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${individual.body.id as string}`,
      )
      .send({ version: individual.body.version, quantity: '4' });
    expect(firstPositionChange.status).toBe(200);
    const stalePosition = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/event-service-positions/${individual.body.id as string}`,
      )
      .send({ version: individual.body.version, quantity: '5' });
    expect(stalePosition.status).toBe(409);
    expect(stalePosition.body.code).toBe('VERSION_CONFLICT');

    const archivedService = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/services/${service.body.id as string}/status`)
      .send({ version: changedService.body.version, status: 'ARCHIVED' });
    expect(archivedService.status).toBe(200);
    const invalidFutureEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        sourceEventFormatId: format.body.id,
        locationId,
        eventDate: '2026-12-16',
      });
    expect(invalidFutureEvent.status).toBe(422);
    expect(invalidFutureEvent.body.code).toBe('EVENT_FORMAT_SERVICES_REQUIRE_CORRECTION');
  });

  async function createRoleAgent(
    roleKey: string,
    email: string,
    locationScope: 'ALL' | 'SELECTED' = 'ALL',
    locationIds: string[] = [],
  ) {
    const created = await auth.auth.api.createUser({
      body: { name: `Phase Seven ${roleKey}`, email, password },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: created.user.id },
        data: { emailVerified: true },
      });
      const role = await transaction.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: roleKey } },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: created.user.id, locationScope },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
      if (locationScope === 'SELECTED') {
        await transaction.membershipLocation.createMany({
          data: locationIds.map((assignedLocationId) => ({
            organizationId,
            membershipId: membership.id,
            locationId: assignedLocationId,
          })),
        });
      }
    });
    const agent = request.agent(application.getHttpServer());
    expect((await signInAs(agent, email)).status).toBe(200);
    return agent;
  }
});

async function signInAs(agent: ReturnType<typeof request.agent>, email: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}
