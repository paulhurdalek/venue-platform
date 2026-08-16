import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { AuthService } from '../src/auth/auth.service.js';
import { createApiApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SetupService } from '../src/setup/setup.service.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
const describeWithDatabase = hasDatabase ? describe.sequential : describe.skip;
const origin = 'http://localhost:3100';
const administratorEmail = 'phase3-admin@example.test';
const administratorPassword = 'Local-Test-Admin-43!';
const sensitiveValues = [
  'artist-secret-note',
  'mara.private@example.test',
  '+49 30 5551234',
  'private-contact-note',
  'Confidential Avenue 7',
  'partner-secret-note',
];

describeWithDatabase('Phase 3 master-data integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let artistId = '';
  let contactId = '';
  let partnerId = '';
  let contactVersion = 1;
  let contactRoleIds: string[] = [];
  let partnerRoleIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    setup = application.get(SetupService);
    auth = application.get(AuthService);
    await cleanDatabase(prisma);

    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase Three Administrator',
        email: administratorEmail,
        password: administratorPassword,
        passwordConfirmation: administratorPassword,
        organizationName: 'Phase Three Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    administratorAgent = request.agent(application.getHttpServer());
    expect(
      (await signInAs(administratorAgent, administratorEmail, administratorPassword)).status,
    ).toBe(200);
  });

  afterAll(async () => {
    if (prisma) await cleanDatabase(prisma);
    await application?.close();
  });

  it('installs the exact standard-role matrix and fixed role dictionaries', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    const keysByRole = Object.fromEntries(
      roles.map((role) => [
        role.key,
        role.permissions.map(({ permission }) => permission.key).sort(),
      ]),
    );

    expect(keysByRole.administrator).toHaveLength(21);
    expect(keysByRole.management_finance).toEqual(
      [
        'artists.read',
        'business_partners.archive',
        'business_partners.read',
        'business_partners.write',
        'contacts.archive',
        'contacts.read',
        'contacts.write',
        'location.read',
        'organization.read',
      ].sort(),
    );
    expect(keysByRole.booking).toEqual(
      [
        'artists.archive',
        'artists.read',
        'artists.write',
        'business_partners.read',
        'contacts.archive',
        'contacts.read',
        'contacts.write',
        'location.read',
        'organization.read',
      ].sort(),
    );
    expect(keysByRole.production).toEqual(
      [
        'artists.read',
        'business_partners.read',
        'contacts.read',
        'location.read',
        'organization.read',
      ].sort(),
    );
    expect(keysByRole.read_only).toEqual(keysByRole.production);

    const contactRoles = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/contact-roles`,
    );
    const partnerRoles = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/business-partner-roles`,
    );
    expect(contactRoles.status).toBe(200);
    expect(contactRoles.body.map((role: { key: string }) => role.key)).toEqual(
      expect.arrayContaining(['management', 'booking', 'agency', 'technical', 'personal', 'other']),
    );
    expect(partnerRoles.status).toBe(200);
    expect(partnerRoles.body.map((role: { key: string }) => role.key)).toEqual(
      expect.arrayContaining([
        'customer',
        'organizer',
        'partner',
        'agency',
        'technical_service',
        'security',
        'catering',
        'other_service',
      ]),
    );
    contactRoleIds = contactRoles.body.slice(0, 3).map((role: { id: string }) => role.id);
    partnerRoleIds = partnerRoles.body.slice(0, 3).map((role: { id: string }) => role.id);
  });

  it('creates searchable artists and reusable contacts with derived completeness', async () => {
    const invalidArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists`)
      .send({ stageName: ' ', firstName: null, lastName: null });
    expect(invalidArtist.status).toBe(422);

    const createdArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists`)
      .send({ stageName: 'Echo Unit', notes: sensitiveValues[0] });
    expect(createdArtist.status).toBe(201);
    expect(createdArtist.body).toMatchObject({
      organizationId,
      stageName: 'Echo Unit',
      incomplete: true,
      status: 'ACTIVE',
      version: 1,
    });
    artistId = createdArtist.body.id as string;

    const createdContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/contacts`)
      .send({ firstName: 'Mara', lastName: 'Muster', notes: sensitiveValues[3] });
    expect(createdContact.status).toBe(201);
    expect(createdContact.body).toMatchObject({ incomplete: true, version: 1 });
    contactId = createdContact.body.id as string;

    const archivedArtist = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/artists/${artistId}/status`)
      .send({ version: 1, status: 'ARCHIVED' });
    expect(archivedArtist.status).toBe(200);
    expect(archivedArtist.body).toMatchObject({ status: 'ARCHIVED', version: 2 });

    const artistRelationshipWhileArchived = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/contacts`)
      .send({ contactId, roleIds: [contactRoleIds[0]] });
    expect(artistRelationshipWhileArchived.status).toBe(409);
    expect(artistRelationshipWhileArchived.body.code).toBe('ARCHIVED_RELATION_TARGET');

    const reactivatedArtist = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/artists/${artistId}/status`)
      .send({ version: 2, status: 'ACTIVE' });
    expect(reactivatedArtist.status).toBe(200);
    expect(reactivatedArtist.body).toMatchObject({ status: 'ACTIVE', version: 3 });

    const linked = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/contacts`)
      .send({ contactId, roleIds: contactRoleIds.slice(0, 2) });
    expect(linked.status).toBe(201);
    expect(linked.body.contacts).toHaveLength(1);
    expect(linked.body.contacts[0].roles).toHaveLength(2);
    expect(linked.body.incomplete).toBe(true);

    const updatedContact = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/contacts/${contactId}`)
      .send({
        version: 1,
        email: sensitiveValues[1],
        phone: sensitiveValues[2],
      });
    expect(updatedContact.status).toBe(200);
    expect(updatedContact.body).toMatchObject({ incomplete: false, version: 2 });
    contactVersion = updatedContact.body.version as number;

    const refreshedArtist = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/artists/${artistId}`,
    );
    expect(refreshedArtist.body.incomplete).toBe(false);

    const association = refreshedArtist.body.contacts[0] as { id: string; version: number };
    const changedRoles = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/artists/${artistId}/contacts/${association.id}/roles`,
      )
      .send({ version: association.version, roleIds: [contactRoleIds[2]] });
    expect(changedRoles.status).toBe(200);
    expect(changedRoles.body.contacts[0]).toMatchObject({ version: 2 });
    expect(changedRoles.body.contacts[0].roles.map((role: { id: string }) => role.id)).toEqual([
      contactRoleIds[2],
    ]);

    const secondArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists`)
      .send({ stageName: 'Parallel Project' });
    expect(secondArtist.status).toBe(201);
    const secondLink = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/artists/${secondArtist.body.id as string}/contacts`,
      )
      .send({ contactId, roleIds: [contactRoleIds[0]] });
    expect(secondLink.status).toBe(201);
    expect(secondLink.body.contacts[0].contact.id).toBe(contactId);

    const artistSearch = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/artists?q=echo&status=ACTIVE&limit=1&offset=0`,
    );
    expect(artistSearch.status).toBe(200);
    expect(artistSearch.body).toMatchObject({ total: 1, limit: 1, offset: 0 });
    expect(artistSearch.body.items[0].id).toBe(artistId);

    const contact = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/contacts/${contactId}`,
    );
    expect(contact.body.artistLinks).toHaveLength(2);
    expect(contact.body.artistLinks.map((link: { entityId: string }) => link.entityId)).toEqual(
      expect.arrayContaining([artistId, secondArtist.body.id]),
    );
  });

  it('manages multi-role business partners, links and optimistic lifecycle changes', async () => {
    const created = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners`)
      .send({
        companyName: 'Northwind Kultur GmbH',
        addressLine1: sensitiveValues[4],
        countryCode: 'de',
        billingCountryCode: 'at',
        notes: sensitiveValues[5],
        roleIds: partnerRoleIds.slice(0, 2),
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      countryCode: 'DE',
      billingCountryCode: 'AT',
      status: 'ACTIVE',
      version: 1,
    });
    expect(created.body.roles).toHaveLength(2);
    partnerId = created.body.id as string;

    const linked = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts`)
      .send({ contactId, roleIds: contactRoleIds.slice(0, 2) });
    expect(linked.status).toBe(201);
    expect(linked.body.contacts[0].contact.id).toBe(contactId);

    const updated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}`)
      .send({ version: 1, companyName: 'Northwind Kultur & Touring GmbH' });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}`)
      .send({ version: 1, phone: '+49 30 000000' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const rolesUpdated = await administratorAgent
      .put(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/roles`)
      .send({ version: 2, roleIds: partnerRoleIds.slice(1, 3) });
    expect(rolesUpdated.status).toBe(200);
    expect(rolesUpdated.body).toMatchObject({ version: 3 });
    expect(rolesUpdated.body.roles).toHaveLength(2);

    const archived = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/status`)
      .send({ version: 3, status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', version: 4 });
    expect(archived.body.archivedAt).toBeTruthy();

    const activeList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/business-partners`,
    );
    expect(activeList.body.total).toBe(0);
    const archivedList = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/business-partners?status=ARCHIVED&roleKey=${rolesUpdated.body.roles[0].key as string}`,
    );
    expect(archivedList.body.total).toBe(1);

    const relationshipWhileArchived = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts`)
      .send({ contactId, roleIds: [contactRoleIds[0]] });
    expect(relationshipWhileArchived.status).toBe(409);
    expect(relationshipWhileArchived.body.code).toBe('ARCHIVED_RELATION_TARGET');

    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/status`)
      .send({ version: 4, status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body).toMatchObject({ status: 'ACTIVE', version: 5, archivedAt: null });

    const association = reactivated.body.contacts[0] as { id: string; version: number };
    const associationRoles = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts/${association.id}/roles`,
      )
      .send({ version: association.version, roleIds: [contactRoleIds[2]] });
    expect(associationRoles.status).toBe(200);
    expect(associationRoles.body.contacts[0].version).toBe(2);

    const unlinked = await administratorAgent.delete(
      `/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts/${association.id}?version=2`,
    );
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.contacts).toHaveLength(0);

    const relinked = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts`)
      .send({ contactId, roleIds: [contactRoleIds[0]] });
    expect(relinked.status).toBe(201);
    expect(relinked.body.contacts).toHaveLength(1);
  });

  it('preserves links while archiving contacts and recomputes artist completeness', async () => {
    const archived = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/contacts/${contactId}/status`)
      .send({ version: contactVersion, status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', version: contactVersion + 1 });
    expect(archived.body.artistLinks).toHaveLength(2);
    expect(archived.body.businessPartnerLinks).toHaveLength(1);

    const artist = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/artists/${artistId}`,
    );
    expect(artist.body.incomplete).toBe(true);
    expect(artist.body.contacts[0].contact.status).toBe('ARCHIVED');

    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/contacts/${contactId}/status`)
      .send({ version: contactVersion + 1, status: 'ACTIVE' });
    expect(reactivated.status).toBe(200);
    contactVersion = reactivated.body.version as number;
    expect(
      (await administratorAgent.get(`/api/v1/organizations/${organizationId}/artists/${artistId}`))
        .body.incomplete,
    ).toBe(false);
  });

  it('enforces read-only role permissions and tenant boundaries in API and database', async () => {
    const productionUser = await auth.auth.api.createUser({
      body: {
        name: 'Production Reader',
        email: 'phase3-production@example.test',
        password: administratorPassword,
      },
    });
    const productionRole = await prisma.database.role.findUniqueOrThrow({
      where: { organizationId_key: { organizationId, key: 'production' } },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: productionUser.user.id },
        data: { emailVerified: true },
      });
      const membership = await transaction.membership.create({
        data: { organizationId, userId: productionUser.user.id },
      });
      await transaction.membershipRole.create({
        data: { organizationId, membershipId: membership.id, roleId: productionRole.id },
      });
    });
    const productionAgent = request.agent(application.getHttpServer());
    expect(
      (await signInAs(productionAgent, 'phase3-production@example.test', administratorPassword))
        .status,
    ).toBe(200);
    expect(
      (await productionAgent.get(`/api/v1/organizations/${organizationId}/artists`)).status,
    ).toBe(200);
    expect(
      (
        await productionAgent
          .post(`/api/v1/organizations/${organizationId}/artists`)
          .send({ stageName: 'Forbidden Artist' })
      ).status,
    ).toBe(403);

    const secondAdmin = await auth.auth.api.createUser({
      body: {
        name: 'Second Tenant Administrator',
        email: 'phase3-second-admin@example.test',
        password: administratorPassword,
      },
    });
    let secondOrganizationId = '';
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: secondAdmin.user.id },
        data: { emailVerified: true },
      });
      const organization = await transaction.organization.create({
        data: { name: 'Second Phase Three Venue' },
      });
      secondOrganizationId = organization.id;
      await transaction.location.create({
        data: { organizationId: organization.id, name: 'Second Hall', timezone: 'Europe/Berlin' },
      });
      const administratorRoleId = await setup.createStandardRoles(transaction, organization.id);
      const membership = await transaction.membership.create({
        data: { organizationId: organization.id, userId: secondAdmin.user.id },
      });
      await transaction.membershipRole.create({
        data: {
          organizationId: organization.id,
          membershipId: membership.id,
          roleId: administratorRoleId,
        },
      });
    });
    const secondAgent = request.agent(application.getHttpServer());
    expect(
      (await signInAs(secondAgent, 'phase3-second-admin@example.test', administratorPassword))
        .status,
    ).toBe(200);
    const secondArtist = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/artists`)
      .send({ stageName: 'Tenant Two Artist' });
    const secondContact = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/contacts`)
      .send({ firstName: 'Tenant', lastName: 'Two' });
    expect(secondArtist.status).toBe(201);
    expect(secondContact.status).toBe(201);

    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${secondOrganizationId}/artists/${secondArtist.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/artists/${secondArtist.body.id as string}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await administratorAgent
          .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/contacts`)
          .send({ contactId: secondContact.body.id, roleIds: [contactRoleIds[0]] })
      ).status,
    ).toBe(404);

    await expect(
      prisma.database.artistContact.create({
        data: {
          organizationId,
          artistId,
          contactId: secondContact.body.id as string,
        },
      }),
    ).rejects.toThrow();
  });

  it('writes lifecycle and relationship audits without raw master-data PII', async () => {
    const entries = await prisma.database.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    const actions = entries.map(({ action }) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'artist.created',
        'artist.archived',
        'artist.reactivated',
        'artist.contact_linked',
        'artist.contact_roles_updated',
        'contact.created',
        'contact.updated',
        'contact.archived',
        'contact.reactivated',
        'business_partner.created',
        'business_partner.updated',
        'business_partner.roles_updated',
        'business_partner.archived',
        'business_partner.reactivated',
        'business_partner.contact_linked',
        'business_partner.contact_roles_updated',
        'business_partner.contact_unlinked',
      ]),
    );
    const serializedMetadata = JSON.stringify(entries.map(({ metadata }) => metadata));
    for (const sensitiveValue of sensitiveValues) {
      expect(serializedMetadata).not.toContain(sensitiveValue);
    }
  });
});

async function signInAs(agent: ReturnType<typeof request.agent>, email: string, password: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}

async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.database.$executeRawUnsafe(`
    TRUNCATE TABLE
      "business_partner_contact_role", "business_partner_contact",
      "business_partner_role_assignment", "artist_contact_role", "artist_contact",
      "business_partner", "artist", "contact", "audit_log",
      "invitation_location", "invitation_role", "invitation",
      "membership_location", "membership_role", "role_permission", "role", "permission",
      "membership", "location", "organization", "bootstrap_token", "auth_rate_limit",
      "auth_verification", "auth_session", "auth_account", "auth_user"
    RESTART IDENTITY CASCADE
  `);
}
