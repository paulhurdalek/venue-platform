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
const password = 'Local-Test-Admin-88!';

describeWithDatabase('Phase 8 revenue planning integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let productionAgent: ReturnType<typeof request.agent>;
  let restrictedAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let secondLocationId = '';
  let taxRate7Id = '';
  let taxRate19Id = '';

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
        administratorName: 'Phase Eight Administrator',
        email: 'phase8-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Eight Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    const taxRates = await prisma.database.taxRateTemplate.findMany({
      where: { organizationId },
    });
    taxRate7Id = taxRates.find(({ rateBasisPoints }) => rateBasisPoints === 700)!.id;
    taxRate19Id = taxRates.find(({ rateBasisPoints }) => rateBasisPoints === 1900)!.id;
    secondLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Second Hall', timezone: 'Europe/Berlin' },
      })
    ).id;
    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase8-admin@example.test')).status).toBe(200);
    productionAgent = await createRoleAgent('production', 'phase8-production@example.test');
    restrictedAgent = await createRoleAgent(
      'management_finance',
      'phase8-restricted@example.test',
      'SELECTED',
      [secondLocationId],
    );
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('calculates ticket prices, recipient economics and additional revenue exactly', async () => {
    const artist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Phase Eight Artist' },
    });
    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'OWN_PRODUCTION',
        name: 'Phase Eight Show',
        locationId,
        eventDate: '2027-01-10',
        expectedGuestCount: 150,
      });
    expect(event.status).toBe(201);
    expect(event.body.expectedGuestCount).toBe(150);
    const eventId = event.body.id as string;

    const tier = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/revenue-plan/ticket-tiers`)
      .send({
        name: 'Vorverkauf',
        expectedQuantity: 100,
        baseInputType: 'GROSS',
        baseInputMinor: '2380',
        baseTaxRateTemplateId: taxRate19Id,
      });
    expect(tier.status).toBe(201);
    expect(tier.body).toMatchObject({
      baseNetUnitMinor: '2000',
      baseGrossUnitMinor: '2380',
      totalBaseNetMinor: '200000',
    });

    const incompleteComponent = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/ticket-price-tiers/${tier.body.id as string}/components`,
      )
      .send({
        name: 'WKZ',
        amountType: 'FIXED',
        inputType: 'GROSS',
        inputAmountMinor: '119',
        taxRateTemplateId: taxRate19Id,
        guestPays: true,
        allocations: [
          {
            recipientType: 'ORGANIZATION',
            allocationType: 'PERCENTAGE',
            percentageBasisPoints: 5000,
          },
        ],
      });
    expect(incompleteComponent.status).toBe(201);
    expect(incompleteComponent.body).toMatchObject({
      grossUnitMinor: '119',
      netUnitMinor: '100',
      allocationComplete: false,
    });

    const additional = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${eventId}/revenue-plan/additional-revenues`,
      )
      .send({
        name: 'Gastroerlös',
        calculationType: 'PER_EXPECTED_GUEST',
        inputType: 'NET',
        inputAmountMinor: '250',
        taxRateTemplateId: taxRate7Id,
        confirmationStatus: 'PLANNED',
        note: 'Planwert pro Gast',
      });
    expect(additional.status).toBe(201);
    expect(additional.body).toMatchObject({
      resolvedQuantity: 150,
      totalNetMinor: '37500',
      totalGrossMinor: '40200',
    });

    let plan = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/revenue-plan`,
    );
    expect(plan.status).toBe(200);
    expect(plan.body.totals.incomplete).toBe(true);
    expect(plan.body.totals.approvalBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'COMPONENT_ALLOCATION_INCOMPLETE' }),
      ]),
    );
    expect(plan.body.totals).toMatchObject({
      expectedGuests: 150,
      expectedTickets: 100,
      expectedPayingTickets: 100,
      ticketEndCustomerGrossMinor: '249900',
      ticketBaseNetMinor: '200000',
      additionalRevenueNetMinor: '37500',
      phase7PlannedCostNetMinor: '0',
    });

    let calculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    const review = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/status`)
      .send({ version: calculation.body.version, status: 'REVIEW', note: null });
    expect(review.status).toBe(200);
    const blockedApproval = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/status`)
      .send({ version: review.body.version, status: 'APPROVED', note: null });
    expect(blockedApproval.status).toBe(422);
    expect(blockedApproval.body.code).toBe('CALCULATION_REVENUE_INCOMPLETE');

    const completeComponent = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/ticket-price-components/${incompleteComponent.body.id as string}`,
      )
      .send({
        version: incompleteComponent.body.version,
        name: 'WKZ',
        amountType: 'FIXED',
        inputType: 'GROSS',
        inputAmountMinor: '119',
        taxRateTemplateId: taxRate19Id,
        guestPays: true,
        allocations: [
          {
            recipientType: 'ORGANIZATION',
            allocationType: 'PERCENTAGE',
            percentageBasisPoints: 6000,
          },
          {
            recipientType: 'ARTIST',
            artistId: artist.id,
            allocationType: 'FIXED',
            fixedAmountMinor: '48',
          },
        ],
      });
    expect(completeComponent.status).toBe(200);
    expect(completeComponent.body.allocationComplete).toBe(true);
    expect(completeComponent.body.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientType: 'ORGANIZATION', resolvedGrossUnitMinor: '71' }),
        expect.objectContaining({ recipientType: 'ARTIST', resolvedGrossUnitMinor: '48' }),
      ]),
    );

    plan = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/revenue-plan`,
    );
    expect(plan.body.totals).toMatchObject({
      incomplete: false,
      ownTicketRevenueNetMinor: '206000',
      ownTicketRevenueGrossMinor: '245100',
      artistPartnerShareNetMinor: '4000',
      artistPartnerShareGrossMinor: '4800',
      externalPassThroughNetMinor: '0',
      externalPassThroughGrossMinor: '0',
      operatingResultNetMinor: '243500',
    });

    calculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    const approved = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/events/${eventId}/calculation/status`)
      .send({ version: calculation.body.version, status: 'APPROVED', note: 'Phase 8 geprüft' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const changedRevenue = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/additional-revenues/${additional.body.id as string}`,
      )
      .send({
        version: additional.body.version,
        name: 'Gastroerlös',
        calculationType: 'PER_EXPECTED_GUEST',
        inputType: 'NET',
        inputAmountMinor: '300',
        taxRateTemplateId: taxRate7Id,
        confirmationStatus: 'CONFIRMED',
        note: null,
      });
    expect(changedRevenue.status).toBe(200);
    calculation = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/calculation`,
    );
    expect(calculation.body.status).toBe('DRAFT');
    expect(calculation.body.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previousStatus: 'APPROVED',
          newStatus: 'DRAFT',
          changedSourceType: 'additional_revenue',
          changedSourceId: additional.body.id,
          reason: 'Weiterer Erlös geändert',
        }),
      ]),
    );
    expect(
      await prisma.database.auditLog.count({
        where: {
          organizationId,
          action: 'additional_revenue.updated',
          targetId: additional.body.id,
        },
      }),
    ).toBe(1);

    const stale = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/ticket-price-components/${incompleteComponent.body.id as string}`,
      )
      .send({
        version: incompleteComponent.body.version,
        name: 'Veraltet',
        amountType: 'FIXED',
        inputType: 'GROSS',
        inputAmountMinor: '119',
        taxRateTemplateId: taxRate19Id,
        guestPays: true,
        allocations: [],
      });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
  });

  it('manages templates, copies independent snapshots and applies explicit full replacements', async () => {
    const organizationAllocation = {
      recipientType: 'ORGANIZATION',
      allocationType: 'PERCENTAGE',
      percentageBasisPoints: 10_000,
    };
    const providerComponent = {
      name: 'VVK-Gebühr',
      amountType: 'FIXED',
      inputType: 'GROSS',
      inputAmountMinor: '119',
      taxRateTemplateId: taxRate19Id,
      guestPays: true,
      allocations: [organizationAllocation],
    };
    const provider = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/revenue-templates/ticket-providers`)
      .send({
        name: 'E2E Ticketanbieter',
        description: 'Wiederkehrende VVK-Struktur',
        components: [providerComponent],
      });
    expect(provider.status).toBe(201);
    expect(provider.body.components).toHaveLength(1);

    const calculationTemplate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/revenue-templates/calculations`)
      .send({
        name: 'E2E Standardkalkulation',
        description: 'Vollständige Momentaufnahme',
        expectedGuestCount: 80,
        tiers: [
          {
            name: 'Standard',
            expectedQuantity: 70,
            baseInputType: 'GROSS',
            baseInputMinor: '2380',
            baseTaxRateTemplateId: taxRate19Id,
            sourceTicketProviderTemplateId: provider.body.id,
            components: [providerComponent],
          },
        ],
        additionalRevenues: [
          {
            name: 'Garderobe',
            calculationType: 'PER_EXPECTED_GUEST',
            inputType: 'GROSS',
            inputAmountMinor: '200',
            taxRateTemplateId: taxRate7Id,
            confirmationStatus: 'PLANNED',
          },
        ],
      });
    expect(calculationTemplate.status).toBe(201);
    expect(calculationTemplate.body).toMatchObject({
      expectedGuestCount: 80,
      status: 'ACTIVE',
      version: 1,
    });
    expect(calculationTemplate.body.tiers).toHaveLength(1);

    const duplicate = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/revenue-templates/calculations/${calculationTemplate.body.id as string}/duplicate`,
      )
      .send({ name: 'E2E Standardkalkulation Kopie' });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body).toMatchObject({ name: 'E2E Standardkalkulation Kopie', version: 1 });
    const archivedDuplicate = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/revenue-templates/calculations/${duplicate.body.id as string}/status`,
      )
      .send({ version: duplicate.body.version, status: 'ARCHIVED' });
    expect(archivedDuplicate.body.status).toBe('ARCHIVED');
    const reactivatedDuplicate = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/revenue-templates/calculations/${duplicate.body.id as string}/status`,
      )
      .send({ version: archivedDuplicate.body.version, status: 'ACTIVE' });
    expect(reactivatedDuplicate.body.status).toBe('ACTIVE');

    const format = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({
        name: 'E2E Vorlagenformat',
        eventKind: 'OWN_PRODUCTION',
        defaultStartTime: '20:00',
        defaultCalculationTemplateId: calculationTemplate.body.id,
      });
    expect(format.status).toBe(201);

    const creationCases = [
      {
        name: 'Nur Format',
        date: '2027-02-01',
        body: { sourceEventFormatId: format.body.id },
        format: true,
        calculation: false,
      },
      {
        name: 'Nur Kalkulation',
        date: '2027-02-02',
        body: {
          eventKind: 'OWN_PRODUCTION',
          sourceCalculationTemplateId: calculationTemplate.body.id,
        },
        format: false,
        calculation: true,
      },
      {
        name: 'Beide Vorlagen',
        date: '2027-02-03',
        body: {
          sourceEventFormatId: format.body.id,
          sourceCalculationTemplateId: calculationTemplate.body.id,
        },
        format: true,
        calculation: true,
      },
      {
        name: 'Freie Veranstaltung',
        date: '2027-02-04',
        body: { eventKind: 'OWN_PRODUCTION' },
        format: false,
        calculation: false,
      },
    ];
    for (const creationCase of creationCases) {
      const created = await administratorAgent
        .post(`/api/v1/organizations/${organizationId}/events`)
        .send({
          ...creationCase.body,
          name: creationCase.name,
          locationId,
          eventDate: creationCase.date,
        });
      expect(created.status).toBe(201);
      expect(Boolean(created.body.sourceEventFormatId)).toBe(creationCase.format);
      expect(Boolean(created.body.sourceCalculationTemplateId)).toBe(creationCase.calculation);
      const plan = await administratorAgent.get(
        `/api/v1/organizations/${organizationId}/events/${created.body.id as string}/revenue-plan`,
      );
      expect(plan.body.ticketTiers).toHaveLength(creationCase.calculation ? 1 : 0);
      expect(plan.body.additionalRevenues).toHaveLength(creationCase.calculation ? 1 : 0);
    }

    const snapshotEvent = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'OWN_PRODUCTION',
        name: 'Anbieter-Snapshot',
        locationId,
        eventDate: '2027-02-05',
      });
    const firstTier = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan/ticket-tiers`,
      )
      .send({
        name: 'Erste Stufe',
        expectedQuantity: 10,
        baseInputType: 'GROSS',
        baseInputMinor: '2380',
        baseTaxRateTemplateId: taxRate19Id,
        sourceTicketProviderTemplateId: provider.body.id,
        components: [],
      });
    expect(firstTier.status).toBe(201);
    expect(firstTier.body.components[0]).toMatchObject({
      name: 'VVK-Gebühr',
      inputAmountMinor: '119',
    });
    const secondTier = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan/ticket-tiers`,
      )
      .send({
        name: 'Zweite Stufe',
        expectedQuantity: 5,
        baseInputType: 'GROSS',
        baseInputMinor: '1190',
        baseTaxRateTemplateId: taxRate19Id,
        components: [],
      });
    expect(secondTier.body.sortOrder).toBeGreaterThan(firstTier.body.sortOrder);
    const moved = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/ticket-price-tiers/${secondTier.body.id as string}/order`,
      )
      .send({ version: secondTier.body.version, direction: 'UP' });
    expect(moved.status).toBe(200);

    const updatedProvider = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/revenue-templates/ticket-providers/${provider.body.id as string}`,
      )
      .send({
        version: provider.body.version,
        name: provider.body.name,
        description: provider.body.description,
        components: [{ ...providerComponent, inputAmountMinor: '238' }],
      });
    expect(updatedProvider.status).toBe(200);
    const independentPlan = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan`,
    );
    expect(
      independentPlan.body.ticketTiers.find((tier: { id: string }) => tier.id === firstTier.body.id)
        .components[0].inputAmountMinor,
    ).toBe('119');

    const preview = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan/calculation-template-preview`,
      )
      .send({ calculationTemplateId: calculationTemplate.body.id });
    expect(preview.body).toMatchObject({ replacementRequired: true, tierCount: 1 });
    const unconfirmed = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan/apply-calculation-template`,
      )
      .send({
        calculationTemplateId: calculationTemplate.body.id,
        calculationVersion: preview.body.calculationVersion,
        confirmReplacement: false,
        recipientResolutions: [],
      });
    expect(unconfirmed.status).toBe(422);
    expect(unconfirmed.body.code).toBe('CALCULATION_TEMPLATE_REPLACEMENT_CONFIRMATION_REQUIRED');
    const replaced = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${snapshotEvent.body.id as string}/revenue-plan/apply-calculation-template`,
      )
      .send({
        calculationTemplateId: calculationTemplate.body.id,
        calculationVersion: preview.body.calculationVersion,
        confirmReplacement: true,
        recipientResolutions: [],
      });
    expect(replaced.status).toBe(200);
    expect(
      replaced.body.ticketTiers.filter((tier: { status: string }) => tier.status === 'ACTIVE'),
    ).toHaveLength(1);
    expect(
      replaced.body.additionalRevenues.filter(
        (item: { status: string }) => item.status === 'ACTIVE',
      ),
    ).toHaveLength(1);
  });

  it('requires an explicit resolution for archived template recipients', async () => {
    const artist = await prisma.database.artist.create({
      data: { organizationId, stageName: 'Archivierter Vorlagenartist' },
    });
    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/revenue-templates/calculations`)
      .send({
        name: 'Vorlage mit Empfängerprüfung',
        expectedGuestCount: 10,
        tiers: [
          {
            name: 'Empfängerstufe',
            expectedQuantity: 10,
            baseInputType: 'GROSS',
            baseInputMinor: '1190',
            baseTaxRateTemplateId: taxRate19Id,
            components: [
              {
                name: 'Artist-Anteil',
                amountType: 'FIXED',
                inputType: 'GROSS',
                inputAmountMinor: '119',
                taxRateTemplateId: taxRate19Id,
                guestPays: true,
                allocations: [
                  {
                    recipientType: 'ARTIST',
                    artistId: artist.id,
                    allocationType: 'PERCENTAGE',
                    percentageBasisPoints: 10_000,
                  },
                ],
              },
            ],
          },
        ],
        additionalRevenues: [],
      });
    expect(template.status).toBe(201);
    await prisma.database.artist.update({
      where: { id: artist.id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
    });
    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'OWN_PRODUCTION',
        name: 'Empfängerprüfung',
        locationId,
        eventDate: '2027-02-06',
      });
    const preview = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${event.body.id as string}/revenue-plan/calculation-template-preview`,
      )
      .send({ calculationTemplateId: template.body.id });
    expect(preview.body.invalidRecipients).toHaveLength(1);
    const unresolved = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${event.body.id as string}/revenue-plan/apply-calculation-template`,
      )
      .send({
        calculationTemplateId: template.body.id,
        calculationVersion: preview.body.calculationVersion,
        confirmReplacement: false,
        recipientResolutions: [],
      });
    expect(unresolved.status).toBe(422);
    expect(unresolved.body.code).toBe('CALCULATION_TEMPLATE_RECIPIENTS_REQUIRE_CORRECTION');
    const resolved = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/events/${event.body.id as string}/revenue-plan/apply-calculation-template`,
      )
      .send({
        calculationTemplateId: template.body.id,
        calculationVersion: preview.body.calculationVersion,
        confirmReplacement: false,
        recipientResolutions: [
          { allocationId: preview.body.invalidRecipients[0].allocationId, action: 'REMOVE' },
        ],
      });
    expect(resolved.status).toBe(200);
    expect(resolved.body.ticketTiers[0].components[0].allocationComplete).toBe(false);
  });

  it('enforces financial permissions and Location scope without leaking revenue data', async () => {
    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'OWN_PRODUCTION',
        name: 'Scoped Revenue',
        locationId,
        eventDate: '2027-01-11',
      });
    const path = `/api/v1/organizations/${organizationId}/events/${event.body.id as string}/revenue-plan`;
    const production = await productionAgent.get(path);
    expect(production.status).toBe(403);
    expect(production.body).not.toHaveProperty('ticketTiers');
    const restricted = await restrictedAgent.get(path);
    expect(restricted.status).toBe(404);
  });

  async function createRoleAgent(
    roleKey: string,
    email: string,
    locationScope: 'ALL' | 'SELECTED' = 'ALL',
    locationIds: string[] = [],
  ) {
    const created = await auth.auth.api.createUser({
      body: { name: `Phase Eight ${roleKey}`, email, password },
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
