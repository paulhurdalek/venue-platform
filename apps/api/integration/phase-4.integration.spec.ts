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
const administratorEmail = 'phase4-admin@example.test';
const password = 'Local-Test-Admin-44!';
const sensitiveDescription = 'Phase 4 confidential description 88421';

describeWithDatabase('Phase 4 event-format integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let bookingAgent: ReturnType<typeof request.agent>;
  let productionAgent: ReturnType<typeof request.agent>;
  let readOnlyAgent: ReturnType<typeof request.agent>;
  let managementAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let eventFormatId = '';
  let eventFormatVersion = 1;

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
        administratorName: 'Phase Four Administrator',
        email: administratorEmail,
        password,
        passwordConfirmation: password,
        organizationName: 'Phase Four Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    administratorAgent = request.agent(application.getHttpServer());
    expect((await signInAs(administratorAgent, administratorEmail)).status).toBe(200);

    bookingAgent = await createRoleAgent('booking', 'phase4-booking@example.test');
    productionAgent = await createRoleAgent('production', 'phase4-production@example.test');
    readOnlyAgent = await createRoleAgent('read_only', 'phase4-read@example.test');
    managementAgent = await createRoleAgent('management_finance', 'phase4-management@example.test');
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
    await application?.close();
  });

  it('installs the event-format permission matrix for existing and future organizations', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    const eventPermissions = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions
          .map(({ permission }) => permission.key)
          .filter((key) => key.startsWith('event_formats.'))
          .sort(),
      ]),
    );
    expect(eventPermissions).toEqual({
      administrator: ['event_formats.archive', 'event_formats.read', 'event_formats.write'],
      booking: ['event_formats.read'],
      management_finance: ['event_formats.archive', 'event_formats.read', 'event_formats.write'],
      production: ['event_formats.read', 'event_formats.write'],
      read_only: ['event_formats.read'],
    });
  });

  it('validates local optional times and creates a normalized concrete format template', async () => {
    const invalidClock = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'Bad clock', eventKind: 'OWN_PRODUCTION', defaultStartTime: '24:00' });
    expect(invalidClock.status).toBe(422);

    const invalidDoors = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({
        name: 'Bad doors',
        eventKind: 'OWN_PRODUCTION',
        defaultDoorsTime: '20:01',
        defaultStartTime: '20:00',
      });
    expect(invalidDoors.status).toBe(422);
    expect(invalidDoors.body.code).toBe('EVENT_FORMAT_TIME_ORDER_INVALID');

    const invalidGetIn = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({
        name: 'Bad get-in',
        eventKind: 'OWN_PRODUCTION',
        defaultTechnicalGetInTime: '20:01',
        defaultStartTime: '20:00',
      });
    expect(invalidGetIn.status).toBe(422);
    expect(invalidGetIn.body.code).toBe('EVENT_FORMAT_TIME_ORDER_INVALID');

    for (const endTime of ['20:00', '19:59']) {
      const invalidEnd = await administratorAgent
        .post(`/api/v1/organizations/${organizationId}/event-formats`)
        .send({
          name: `Bad end ${endTime}`,
          eventKind: 'OWN_PRODUCTION',
          defaultStartTime: '20:00',
          defaultEndTime: endTime,
        });
      expect(invalidEnd.status).toBe(422);
      expect(invalidEnd.body.code).toBe('EVENT_FORMAT_TIME_ORDER_INVALID');
    }

    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({
        name: '  Mix   Show  ',
        description: sensitiveDescription,
        eventKind: 'OWN_PRODUCTION',
        defaultTechnicalGetInTime: '16:00',
        defaultArtistGetInTime: '17:30',
        defaultDoorsTime: '19:00',
        defaultStartTime: '20:00',
        defaultEndTime: '01:30',
        defaultEndNextDay: true,
        recordingDefault: 'ENABLED',
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId,
      name: 'Mix Show',
      normalizedName: 'mix show',
      eventKind: 'OWN_PRODUCTION',
      defaultEndTime: '01:30',
      defaultEndNextDay: true,
      recordingDefault: 'ENABLED',
      status: 'ACTIVE',
      version: 1,
    });
    eventFormatId = created.body.id as string;

    const duplicate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'ＭＩＸ　ＳＨＯＷ', eventKind: 'THIRD_PARTY_EVENT' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('EVENT_FORMAT_NAME_CONFLICT');
  });

  it('searches, filters and paginates with a stable order', async () => {
    for (const input of [
      { name: 'Alpha Rental', eventKind: 'THIRD_PARTY_EVENT' },
      { name: 'Beta Production', eventKind: 'OWN_PRODUCTION' },
      { name: 'Gamma Rental', eventKind: 'THIRD_PARTY_EVENT' },
    ]) {
      expect(
        (
          await administratorAgent
            .post(`/api/v1/organizations/${organizationId}/event-formats`)
            .send(input)
        ).status,
      ).toBe(201);
    }

    const search = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?q=alpha&status=ALL`,
    );
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { name: string }) => item.name)).toEqual(['Alpha Rental']);

    const kindFilter = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?eventKind=THIRD_PARTY_EVENT&status=ALL`,
    );
    expect(kindFilter.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Alpha Rental',
      'Gamma Rental',
    ]);

    const firstPage = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?status=ALL&limit=2&offset=0`,
    );
    const secondPage = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?status=ALL&limit=2&offset=2`,
    );
    expect(firstPage.body).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(secondPage.body).toMatchObject({ total: 4, limit: 2, offset: 2 });
    expect(
      [...firstPage.body.items, ...secondPage.body.items].map(
        (item: { name: string }) => item.name,
      ),
    ).toEqual(['Alpha Rental', 'Beta Production', 'Gamma Rental', 'Mix Show']);
  });

  it('edits with optimistic concurrency and keeps normalized names unique', async () => {
    const nameConflict = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`)
      .send({ version: 1, name: ' Alpha Rental ' });
    expect(nameConflict.status).toBe(409);
    expect(nameConflict.body.code).toBe('EVENT_FORMAT_NAME_CONFLICT');

    const updated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`)
      .send({
        version: 1,
        description: 'Updated safe description',
        recordingDefault: 'DISABLED',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      description: 'Updated safe description',
      recordingDefault: 'DISABLED',
      version: 2,
    });
    eventFormatVersion = 2;

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`)
      .send({ version: 1, description: 'stale' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
  });

  it('enforces read, write and archive permissions centrally', async () => {
    expect(
      (await bookingAgent.get(`/api/v1/organizations/${organizationId}/event-formats`)).status,
    ).toBe(200);
    expect(
      (
        await bookingAgent
          .post(`/api/v1/organizations/${organizationId}/event-formats`)
          .send({ name: 'Forbidden Booking Format', eventKind: 'OWN_PRODUCTION' })
      ).status,
    ).toBe(403);
    expect(
      (
        await readOnlyAgent
          .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`)
          .send({ version: eventFormatVersion, description: 'forbidden' })
      ).status,
    ).toBe(403);

    const productionCreated = await productionAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'Production Format', eventKind: 'OWN_PRODUCTION' });
    expect(productionCreated.status).toBe(201);
    expect(
      (
        await productionAgent
          .patch(
            `/api/v1/organizations/${organizationId}/event-formats/${productionCreated.body.id as string}/status`,
          )
          .send({ version: 1, status: 'ARCHIVED' })
      ).status,
    ).toBe(403);

    const managementCreated = await managementAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'Management Format', eventKind: 'THIRD_PARTY_EVENT' });
    expect(managementCreated.status).toBe(201);
    expect(
      (
        await managementAgent
          .patch(
            `/api/v1/organizations/${organizationId}/event-formats/${managementCreated.body.id as string}/status`,
          )
          .send({ version: 1, status: 'ARCHIVED' })
      ).status,
    ).toBe(200);
  });

  it('allows the same normalized name in another tenant and hides foreign IDs', async () => {
    const secondAdmin = await auth.auth.api.createUser({
      body: { name: 'Second Admin', email: 'phase4-second@example.test', password },
    });
    let secondOrganizationId = '';
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: secondAdmin.user.id },
        data: { emailVerified: true },
      });
      const organization = await transaction.organization.create({ data: { name: 'Tenant Two' } });
      secondOrganizationId = organization.id;
      await transaction.location.create({
        data: { organizationId: organization.id, name: 'Second Hall', timezone: 'Europe/Berlin' },
      });
      const roleId = await setup.createStandardRoles(transaction, organization.id);
      const membership = await transaction.membership.create({
        data: { organizationId: organization.id, userId: secondAdmin.user.id },
      });
      await transaction.membershipRole.create({
        data: { organizationId: organization.id, membershipId: membership.id, roleId },
      });
    });
    const secondAgent = request.agent(application.getHttpServer());
    expect((await signInAs(secondAgent, 'phase4-second@example.test')).status).toBe(200);
    const secondFormat = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/event-formats`)
      .send({ name: ' mix show ', eventKind: 'OWN_PRODUCTION' });
    expect(secondFormat.status).toBe(201);

    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/event-formats/${secondFormat.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${secondOrganizationId}/event-formats/${secondFormat.body.id as string}`,
        )
      ).status,
    ).toBe(404);
  });

  it('archives, opens, filters and reactivates without releasing the name', async () => {
    const archived = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/status`)
      .send({ version: eventFormatVersion, status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', version: 3 });

    const activeList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?status=ACTIVE`,
    );
    expect(activeList.body.items.map((item: { id: string }) => item.id)).not.toContain(
      eventFormatId,
    );
    const archivedList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/event-formats?status=ARCHIVED`,
    );
    expect(archivedList.body.items.map((item: { id: string }) => item.id)).toContain(eventFormatId);
    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}`,
        )
      ).status,
    ).toBe(200);

    const duplicate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/event-formats`)
      .send({ name: 'MIX SHOW', eventKind: 'OWN_PRODUCTION' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('EVENT_FORMAT_NAME_CONFLICT');

    const staleStatus = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/status`)
      .send({ version: eventFormatVersion, status: 'ACTIVE' });
    expect(staleStatus.status).toBe(409);
    expect(staleStatus.body.code).toBe('VERSION_CONFLICT');

    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/event-formats/${eventFormatId}/status`)
      .send({ version: 3, status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body).toMatchObject({ status: 'ACTIVE', version: 4 });
  });

  it('writes creation, change and lifecycle audits without raw format content', async () => {
    const entries = await prisma.database.auditLog.findMany({
      where: { organizationId, targetType: 'event_format' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'event_format.created',
        'event_format.updated',
        'event_format.archived',
        'event_format.reactivated',
      ]),
    );
    const metadata = JSON.stringify(entries.map((entry) => entry.metadata));
    expect(metadata).not.toContain('Mix Show');
    expect(metadata).not.toContain(sensitiveDescription);
    expect(metadata).not.toContain('Updated safe description');
    expect(metadata).toContain('changedFields');
    expect(metadata).toContain('previousVersion');
    expect(metadata).toContain('newVersion');
  });

  async function createRoleAgent(roleKey: string, email: string) {
    const created = await auth.auth.api.createUser({
      body: { name: `Phase Four ${roleKey}`, email, password },
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
        data: { organizationId, userId: created.user.id },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: role.id },
      });
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
