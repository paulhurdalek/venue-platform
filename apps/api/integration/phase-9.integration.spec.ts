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
const password = 'Local-Test-Admin-99!';

describeWithDatabase('Phase 9 deals integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let restrictedAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let otherLocationId = '';
  let partnerId = '';
  let contactId = '';
  let serviceId = '';
  let taxRate19Id = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    auth = application.get(AuthService);
    await cleanTestDatabase(prisma.database);
    const setup = application.get(SetupService);
    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase Nine Administrator',
        email: 'phase9-admin@example.test',
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Nine Venue',
        locationName: 'Rental Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;
    otherLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Other Hall', timezone: 'Europe/Berlin' },
      })
    ).id;
    taxRate19Id = (
      await prisma.database.taxRateTemplate.findFirstOrThrow({
        where: { organizationId, rateBasisPoints: 1_900 },
      })
    ).id;
    const partner = await prisma.database.businessPartner.create({
      data: { organizationId, companyName: 'Rental Customer GmbH' },
    });
    partnerId = partner.id;
    const contact = await prisma.database.contact.create({
      data: { organizationId, firstName: 'Rita', lastName: 'Rental' },
    });
    contactId = contact.id;
    await prisma.database.businessPartnerContact.create({
      data: { organizationId, businessPartnerId: partnerId, contactId },
    });
    const category = await prisma.database.serviceCategory.create({
      data: { organizationId, name: 'Rental Services', normalizedName: 'rental services' },
    });
    serviceId = (
      await prisma.database.service.create({
        data: {
          organizationId,
          categoryId: category.id,
          name: 'Technikpaket',
          normalizedName: 'technikpaket',
          unit: 'FLAT_RATE',
          defaultSalesPriceMinor: 10_000n,
        },
      })
    ).id;
    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, 'phase9-admin@example.test')).status).toBe(200);
    restrictedAgent = await createRestrictedAgent();
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('creates independent template snapshots and calculates combined rent, split, WKZ, discounts and included services', async () => {
    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/deal-templates`)
      .send({
        name: 'Miete plus Split',
        description: 'Standardmodell für Fremdveranstaltungen',
        components: [
          {
            type: 'FIXED_RENT',
            label: 'Grundmiete',
            amountNetMinor: '100000',
            taxRateBasisPoints: 1900,
            includeWkz: false,
          },
          {
            type: 'REVENUE_SHARE',
            label: 'Ticket-Split',
            taxRateBasisPoints: 0,
            locationShareBasisPoints: 6000,
            counterpartyShareBasisPoints: 4000,
            includeWkz: true,
          },
        ],
        servicePositions: [
          {
            sourceServiceId: serviceId,
            quantity: '2',
            salesUnitPriceNetMinor: '10000',
            internalUnitCostNetMinor: '4000',
            taxRateBasisPoints: 1900,
            billingMode: 'SEPARATELY_BILLABLE',
            discount: { type: 'PERCENTAGE', percentageBasisPoints: 1000 },
          },
          {
            sourceServiceId: serviceId,
            quantity: '1',
            salesUnitPriceNetMinor: '10000',
            internalUnitCostNetMinor: '5000',
            taxRateBasisPoints: 1900,
            billingMode: 'INCLUDED',
          },
        ],
        totalDiscount: { type: 'FIXED', fixedMinor: '1000' },
      });
    expect(template.status, JSON.stringify(template.body)).toBe(201);

    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'THIRD_PARTY_EVENT',
        name: 'External Rental',
        locationId,
        eventDate: '2027-03-01',
      });
    expect(event.status).toBe(201);
    const eventId = event.body.id as string;
    const tier = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/revenue-plan/ticket-tiers`)
      .send({
        name: 'Standard',
        expectedQuantity: 100,
        baseInputType: 'NET',
        baseInputMinor: '2000',
        baseTaxRateTemplateId: taxRate19Id,
      });
    expect(tier.status).toBe(201);
    const wkz = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/ticket-price-tiers/${tier.body.id as string}/components`,
      )
      .send({
        name: 'WKZ',
        amountType: 'FIXED',
        inputType: 'NET',
        inputAmountMinor: '100',
        taxRateTemplateId: taxRate19Id,
        guestPays: true,
        allocations: [
          {
            recipientType: 'ORGANIZATION',
            allocationType: 'PERCENTAGE',
            percentageBasisPoints: 10000,
          },
        ],
      });
    expect(wkz.status).toBe(201);

    const deal = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${eventId}/deal`)
      .send({ businessPartnerId: partnerId, contactId, templateId: template.body.id });
    expect(deal.status).toBe(201);
    expect(deal.body).toMatchObject({
      customerName: 'Rental Customer GmbH',
      contactName: 'Rita Rental',
      sourceTemplateVersion: 1,
      summary: {
        ticketNetRevenueMinor: '200000',
        wkzNetRevenueMinor: '10000',
        customerAmountNetMinor: '117000',
        expectedLocationShareNetMinor: '126000',
        internalCostNetMinor: '13000',
        expectedOperatingResultNetMinor: '230000',
      },
    });
    expect(deal.body.servicePositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billingMode: 'INCLUDED', salesUnitPriceNetMinor: '10000' }),
      ]),
    );

    const changedTemplate = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deal-templates/${template.body.id as string}`)
      .send({
        version: template.body.version,
        name: 'Miete plus Split',
        description: 'Später geändert',
        components: [
          {
            type: 'FIXED_RENT',
            label: 'Neue Grundmiete',
            amountNetMinor: '200000',
            taxRateBasisPoints: 1900,
            includeWkz: false,
          },
        ],
        servicePositions: [],
      });
    expect(changedTemplate.status).toBe(200);
    const unchangedDeal = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/events/${eventId}/deal`,
    );
    expect(unchangedDeal.body.components[0]).toMatchObject({
      label: 'Grundmiete',
      amountNetMinor: '100000',
    });

    const preview = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/deals/${deal.body.id as string}/template-preview`,
      )
      .send({
        templateId: template.body.id,
        version: unchangedDeal.body.version,
        confirmReplacement: false,
      });
    expect(preview.status).toBe(200);
    expect(preview.body.replacesExistingSnapshot).toBe(true);
    const unconfirmed = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/deals/${deal.body.id as string}/apply-template`,
      )
      .send({
        templateId: template.body.id,
        version: unchangedDeal.body.version,
        confirmReplacement: false,
      });
    expect(unconfirmed.status).toBe(422);
    expect(unconfirmed.body.code).toBe('DEAL_TEMPLATE_CONFIRMATION_REQUIRED');
  });

  it('enforces share invariants, status transitions, optimistic locking, archive lifecycle and location scope', async () => {
    const event = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events`)
      .send({
        eventKind: 'THIRD_PARTY_EVENT',
        name: 'Scoped Deal',
        locationId,
        eventDate: '2027-03-02',
      });
    const invalid = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${event.body.id as string}/deal`)
      .send({
        businessPartnerId: partnerId,
        components: [
          {
            type: 'REVENUE_SHARE',
            label: 'Invalid split',
            taxRateBasisPoints: 0,
            locationShareBasisPoints: 6000,
            counterpartyShareBasisPoints: 3999,
            includeWkz: false,
          },
        ],
        servicePositions: [],
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('DEAL_SHARE_MUST_EQUAL_100_PERCENT');

    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${event.body.id as string}/deal`)
      .send({ businessPartnerId: partnerId, components: [], servicePositions: [] });
    expect(created.status).toBe(201);
    const invalidStatus = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deals/${created.body.id as string}/status`)
      .send({ version: created.body.version, status: 'VEREINBART' });
    expect(invalidStatus.status).toBe(422);
    expect(invalidStatus.body.code).toBe('DEAL_STATUS_TRANSITION_INVALID');
    const negotiation = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deals/${created.body.id as string}/status`)
      .send({ version: created.body.version, status: 'IN_VERHANDLUNG' });
    expect(negotiation.status).toBe(200);
    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deals/${created.body.id as string}`)
      .send({
        version: created.body.version,
        businessPartnerId: partnerId,
        components: [],
        servicePositions: [],
      });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    const agreed = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deals/${created.body.id as string}/status`)
      .send({ version: negotiation.body.version, status: 'VEREINBART' });
    const cancelled = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/deals/${created.body.id as string}/status`)
      .send({ version: agreed.body.version, status: 'STORNIERT' });
    expect(cancelled.body.status).toBe('STORNIERT');
    expect(
      await prisma.database.dealStatusHistory.count({ where: { dealId: created.body.id } }),
    ).toBe(3);
    const replacement = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/events/${event.body.id as string}/deal`)
      .send({ businessPartnerId: partnerId, components: [], servicePositions: [] });
    expect(replacement.status).toBe(201);

    const restricted = await restrictedAgent.get(
      `/api/v1/organizations/${organizationId}/events/${event.body.id as string}/deal`,
    );
    expect(restricted.status).toBe(404);
    expect(restricted.body).not.toHaveProperty('summary');

    const template = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/deal-templates`)
      .send({ name: 'Archivtest', components: [], servicePositions: [] });
    const archived = await administratorAgent
      .patch(
        `/api/v1/organizations/${organizationId}/deal-templates/${template.body.id as string}/status`,
      )
      .send({ version: template.body.version, status: 'ARCHIVED' });
    expect(archived.body.status).toBe('ARCHIVED');
    expect(archived.body.version).toBe(2);
    const activeList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/deal-templates?status=ACTIVE`,
    );
    expect(activeList.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: template.body.id })]),
    );
  });

  async function createRestrictedAgent() {
    const created = await auth.auth.api.createUser({
      body: { name: 'Phase Nine Restricted', email: 'phase9-restricted@example.test', password },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: created.user.id },
        data: { emailVerified: true },
      });
      const role = await transaction.role.findUniqueOrThrow({
        where: { organizationId_key: { organizationId, key: 'management_finance' } },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: created.user.id, locationScope: 'SELECTED' },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
      await transaction.membershipLocation.create({
        data: { organizationId, membershipId: membership.id, locationId: otherLocationId },
      });
    });
    const agent = request.agent(application.getHttpServer());
    expect((await signInAs(agent, 'phase9-restricted@example.test')).status).toBe(200);
    return agent;
  }
});

async function signInAs(agent: ReturnType<typeof request.agent>, email: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}
