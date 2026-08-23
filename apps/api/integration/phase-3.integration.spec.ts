import type { INestApplication } from '@nestjs/common';
import { cleanTestDatabase } from '@venue/database/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { AuthService } from '../src/auth/auth.service.js';
import { createApiApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { ContactValues } from '../src/master-data/application/master-data.models.js';
import {
  MASTER_DATA_REPOSITORY,
  type MasterDataRepository,
} from '../src/master-data/application/master-data.repository.js';
import type { AccessContext } from '../src/security/access.types.js';
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
  'vertretung.private@example.test',
  '+49 40 7771234',
  '+49 171 7771234',
];

describeWithDatabase('Phase 3 master-data integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let repository: MasterDataRepository;
  let administratorAccess: AccessContext;
  let administratorAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let artistId = '';
  let contactId = '';
  let secondContactId = '';
  let partnerId = '';
  let partnerContactAssociationId = '';
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
    repository = application.get(MASTER_DATA_REPOSITORY);
    await cleanTestDatabase(prisma.database);

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
    const administrator = await prisma.database.user.findUniqueOrThrow({
      where: { email: administratorEmail },
    });
    const membership = await prisma.database.membership.findFirstOrThrow({
      where: { organizationId, userId: administrator.id },
    });
    administratorAccess = {
      user: { id: administrator.id, name: administrator.name, email: administrator.email },
      membershipId: membership.id,
      organizationId,
      membershipVersion: membership.version,
      permissions: ['artists.write', 'contacts.write', 'business_partners.write'],
      locationScope: 'ALL',
      locationIds: [],
    };
  });

  afterAll(async () => {
    if (prisma) await cleanTestDatabase(prisma.database);
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

    expect(keysByRole.administrator).toHaveLength(30);
    expect(keysByRole.management_finance).toEqual(
      [
        'artists.read',
        'business_partners.archive',
        'business_partners.read',
        'business_partners.write',
        'contacts.archive',
        'contacts.read',
        'contacts.write',
        'date_options.convert',
        'date_options.read',
        'date_options.write',
        'event_formats.archive',
        'event_formats.read',
        'event_formats.write',
        'events.read',
        'events.status',
        'events.write',
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
        'date_options.convert',
        'date_options.read',
        'date_options.write',
        'event_formats.read',
        'events.read',
        'events.status',
        'events.write',
        'location.read',
        'organization.read',
      ].sort(),
    );
    expect(keysByRole.production).toEqual(
      [
        'artists.read',
        'business_partners.read',
        'contacts.read',
        'date_options.read',
        'event_formats.read',
        'event_formats.write',
        'events.read',
        'events.write',
        'location.read',
        'organization.read',
      ].sort(),
    );
    expect(keysByRole.read_only).toEqual(
      [
        'artists.read',
        'business_partners.read',
        'contacts.read',
        'date_options.read',
        'event_formats.read',
        'events.read',
        'location.read',
        'organization.read',
      ].sort(),
    );

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
    partnerContactAssociationId = relinked.body.contacts[0].id as string;
  });

  it('models explicit company representations with selected partner contacts and stable conflicts', async () => {
    const secondContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/contacts`)
      .send({
        firstName: 'Juno',
        lastName: 'Vertretung',
        email: sensitiveValues[6],
        phone: sensitiveValues[7],
        mobile: sensitiveValues[8],
      });
    expect(secondContact.status).toBe(201);
    secondContactId = secondContact.body.id as string;

    const linkedSecondContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts`)
      .send({ contactId: secondContactId, roleIds: [contactRoleIds[1]] });
    expect(linkedSecondContact.status).toBe(201);
    const secondPartnerContact = linkedSecondContact.body.contacts.find(
      (association: { contact: { id: string } }) => association.contact.id === secondContactId,
    ) as { id: string; version: number };

    const thirdContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/contacts`)
      .send({ firstName: 'Tessa', lastName: 'Agency', email: 'tessa.agency@example.test' });
    expect(thirdContact.status).toBe(201);
    const linkedThirdContact = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts`)
      .send({ contactId: thirdContact.body.id, roleIds: [contactRoleIds[0]] });
    expect(linkedThirdContact.status).toBe(201);
    const thirdPartnerContact = linkedThirdContact.body.contacts.find(
      (association: { contact: { id: string } }) => association.contact.id === thirdContact.body.id,
    ) as { id: string; version: number };

    const linkedRepresentation = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners`)
      .send({
        businessPartnerId: partnerId,
        roleIds: partnerRoleIds.slice(0, 2),
        representatives: [
          {
            businessPartnerContactId: thirdPartnerContact.id,
            roleIds: [contactRoleIds[0]],
            isPrimary: true,
          },
        ],
      });
    expect(linkedRepresentation.status).toBe(201);
    expect(linkedRepresentation.body.businessPartners).toHaveLength(1);
    const initialRepresentation = linkedRepresentation.body.businessPartners[0] as {
      id: string;
      version: number;
      businessPartner: { id: string; companyName: string };
      roles: Array<{ id: string }>;
      representatives: Array<{
        id: string;
        version: number;
        businessPartnerContactId: string;
        isPrimary: boolean;
        contact: { id: string; email: string; phone: string; mobile: string };
        roles: Array<{ id: string }>;
      }>;
    };
    expect(initialRepresentation).toMatchObject({
      version: 1,
      businessPartner: {
        id: partnerId,
        companyName: 'Northwind Kultur & Touring GmbH',
      },
    });
    expect(initialRepresentation.roles).toHaveLength(2);
    expect(initialRepresentation.representatives).toHaveLength(1);

    const addedRepresentative = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${initialRepresentation.id}/contacts`,
      )
      .send({
        businessPartnerContactId: secondPartnerContact.id,
        roleIds: [contactRoleIds[1]],
        isPrimary: false,
      });
    expect(addedRepresentative.status).toBe(201);
    const representation = addedRepresentative.body
      .businessPartners[0] as typeof initialRepresentation;
    expect(representation.representatives).toHaveLength(2);
    expect(representation.representatives.filter(({ isPrimary }) => isPrimary)).toHaveLength(1);
    expect(
      representation.representatives.find(({ contact }) => contact.id === secondContactId)?.contact,
    ).toMatchObject({
      email: sensitiveValues[6],
      phone: sensitiveValues[7],
      mobile: sensitiveValues[8],
    });

    const duplicate = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners`)
      .send({
        businessPartnerId: partnerId,
        roleIds: [partnerRoleIds[0]],
        representatives: [
          {
            businessPartnerContactId: partnerContactAssociationId,
            roleIds: [contactRoleIds[0]],
          },
        ],
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('RELATIONSHIP_EXISTS');

    const updatedCompanyRoles = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}/roles`,
      )
      .send({ version: 1, roleIds: [partnerRoleIds[2]] });
    expect(updatedCompanyRoles.status).toBe(200);
    expect(updatedCompanyRoles.body.businessPartners[0]).toMatchObject({ version: 2 });
    expect(
      updatedCompanyRoles.body.businessPartners[0].roles.map(({ id }: { id: string }) => id),
    ).toEqual([partnerRoleIds[2]]);

    const firstRepresentative = representation.representatives.find(
      ({ businessPartnerContactId }) => businessPartnerContactId === thirdPartnerContact.id,
    )!;
    const updatedFirstRepresentative = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}/contacts/${firstRepresentative.id}`,
      )
      .send({ version: 1, roleIds: [contactRoleIds[2]], isPrimary: false });
    expect(updatedFirstRepresentative.status).toBe(200);
    expect(
      updatedFirstRepresentative.body.businessPartners[0].representatives.find(
        ({ id }: { id: string }) => id === firstRepresentative.id,
      ),
    ).toMatchObject({ version: 2, isPrimary: false });

    const secondRepresentative = representation.representatives.find(
      ({ businessPartnerContactId }) => businessPartnerContactId === secondPartnerContact.id,
    )!;
    const updatedSecondRepresentative = await administratorAgent
      .put(
        `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}/contacts/${secondRepresentative.id}`,
      )
      .send({
        version: 1,
        roleIds: contactRoleIds.slice(0, 2),
        isPrimary: true,
      });
    expect(updatedSecondRepresentative.status).toBe(200);
    expect(
      updatedSecondRepresentative.body.businessPartners[0].representatives.find(
        ({ id }: { id: string }) => id === secondRepresentative.id,
      ),
    ).toMatchObject({ version: 2, isPrimary: true });

    const unlinkedRepresentative = await administratorAgent.delete(
      `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}/contacts/${firstRepresentative.id}?version=2`,
    );
    expect(unlinkedRepresentative.status).toBe(200);
    expect(unlinkedRepresentative.body.businessPartners[0].representatives).toHaveLength(1);

    const lastRepresentative = await administratorAgent.delete(
      `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}/contacts/${secondRepresentative.id}?version=2`,
    );
    expect(lastRepresentative.status).toBe(409);
    expect(lastRepresentative.body.code).toBe('LAST_REPRESENTATIVE_REQUIRED');

    const sourceAssociationInUse = await administratorAgent.delete(
      `/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts/${secondPartnerContact.id}?version=${secondPartnerContact.version}`,
    );
    expect(sourceAssociationInUse.status).toBe(409);
    expect(sourceAssociationInUse.body.code).toBe('RELATIONSHIP_IN_USE');

    const archivedRepresentativeContact = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/contacts/${secondContactId}/status`)
      .send({ version: 1, status: 'ARCHIVED' });
    expect(archivedRepresentativeContact.status).toBe(200);
    const artistWithArchivedRepresentative = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/artists/${artistId}`,
    );
    expect(
      artistWithArchivedRepresentative.body.businessPartners[0].representatives[0].contact.status,
    ).toBe('ARCHIVED');
    const reactivatedRepresentativeContact = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/contacts/${secondContactId}/status`)
      .send({ version: 2, status: 'ACTIVE' });
    expect(reactivatedRepresentativeContact.status).toBe(200);

    const unlinkedRepresentation = await administratorAgent.delete(
      `/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners/${representation.id}?version=2`,
    );
    expect(unlinkedRepresentation.status).toBe(200);
    expect(unlinkedRepresentation.body.businessPartners).toHaveLength(0);
  });

  it('creates inline contacts atomically, detects duplicates and prevents mixed artist assignments', async () => {
    const workflowArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists`)
      .send({ stageName: 'Inline Workflow Artist' });
    expect(workflowArtist.status).toBe(201);
    const workflowArtistId = workflowArtist.body.id as string;
    const emptyPartner = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners`)
      .send({ companyName: 'Empty Contact Agency', roleIds: [partnerRoleIds[0]] });
    expect(emptyPartner.status).toBe(201);
    expect(emptyPartner.body.contacts).toEqual([]);

    const inlineRepresentation = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/artists/${workflowArtistId}/business-partners/inline-contact`,
      )
      .send({
        businessPartnerId: emptyPartner.body.id,
        businessPartnerRoleIds: [partnerRoleIds[0]],
        contact: {
          firstName: 'Inline',
          lastName: 'Vertretung',
          label: 'Booking',
          email: ' INLINE.REP@EXAMPLE.TEST ',
          phone: '+49 30 123 456',
        },
        roleIds: [contactRoleIds[0]],
        isPrimary: true,
      });
    expect(inlineRepresentation.status).toBe(201);
    const inlineAssociation = inlineRepresentation.body.businessPartners.find(
      ({ businessPartner }: { businessPartner: { id: string } }) =>
        businessPartner.id === emptyPartner.body.id,
    );
    expect(inlineAssociation).toMatchObject({
      representatives: [
        {
          isPrimary: true,
          contact: { firstName: 'Inline', lastName: 'Vertretung' },
        },
      ],
    });
    const inlineContactId = inlineAssociation.representatives[0].contact.id as string;
    expect(
      await prisma.database.businessPartnerContact.count({
        where: { businessPartnerId: emptyPartner.body.id, contactId: inlineContactId },
      }),
    ).toBe(1);

    const conflictingDirectLink = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${workflowArtistId}/contacts`)
      .send({ contactId: inlineContactId, roleIds: [contactRoleIds[0]] });
    expect(conflictingDirectLink.status).toBe(409);
    expect(conflictingDirectLink.body).toMatchObject({
      code: 'ARTIST_CONTACT_ASSIGNMENT_CONFLICT',
      message: 'Dieser Kontakt ist für den Artist bereits in der anderen Zuordnungsart hinterlegt',
    });

    const otherArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists`)
      .send({ stageName: 'Different Artist' });
    const allowedForOtherArtist = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${otherArtist.body.id}/contacts`)
      .send({ contactId: inlineContactId, roleIds: [contactRoleIds[0]] });
    expect(allowedForOtherArtist.status).toBe(201);

    const inlineDirect = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${workflowArtistId}/contacts/inline`)
      .send({
        contact: {
          firstName: 'Inline',
          lastName: 'Direct',
          email: 'inline.direct@example.test',
        },
        roleIds: [contactRoleIds[1]],
      });
    expect(inlineDirect.status).toBe(201);
    expect(
      inlineDirect.body.contacts.some(
        ({ contact }: { contact: { email: string } }) =>
          contact.email === 'inline.direct@example.test',
      ),
    ).toBe(true);

    const inlinePartnerContact = await administratorAgent
      .post(
        `/api/v1/organizations/${organizationId}/business-partners/${partnerId}/contacts/inline`,
      )
      .send({
        contact: {
          firstName: 'Inline',
          lastName: 'Company',
          mobile: '+49 171 900 100',
        },
        roleIds: [contactRoleIds[2]],
      });
    expect(inlinePartnerContact.status).toBe(201);
    expect(
      inlinePartnerContact.body.contacts.some(
        ({ contact }: { contact: { mobile: string } }) => contact.mobile === '+49 171 900 100',
      ),
    ).toBe(true);

    const emailMatches = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/contacts/matches`)
      .send({ firstName: 'Someone', email: 'inline.rep@example.test' });
    expect(emailMatches.status).toBe(200);
    expect(emailMatches.body[0]).toMatchObject({ strength: 'STRONG', reasons: ['EMAIL'] });
    const phoneMatches = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/contacts/matches`)
      .send({ firstName: 'Someone', mobile: '0049 (30) 123456' });
    expect(phoneMatches.status).toBe(200);
    expect(phoneMatches.body[0]).toMatchObject({ strength: 'STRONG', reasons: ['PHONE'] });

    const weakMatch = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${workflowArtistId}/contacts/inline`)
      .send({
        contact: { firstName: 'Inline', lastName: 'Direct' },
        roleIds: [contactRoleIds[0]],
      });
    expect(weakMatch.status).toBe(409);
    expect(weakMatch.body.code).toBe('CONTACT_NAME_MATCH');
    const confirmedWeakMatch = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${workflowArtistId}/contacts/inline`)
      .send({
        contact: {
          firstName: 'Inline',
          lastName: 'Direct',
          label: 'Different person',
          allowNameDuplicate: true,
        },
        roleIds: [contactRoleIds[0]],
      });
    expect(confirmedWeakMatch.status).toBe(201);
  });

  it('rolls back each atomic repository workflow when a later relationship write fails', async () => {
    const invalidRoleId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const rollbackPartner = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/business-partners`)
      .send({ companyName: 'Rollback Agency', roleIds: [partnerRoleIds[0]] });
    expect(rollbackPartner.status).toBe(201);
    const cases: Array<{ email: string; action: (values: ContactValues) => Promise<unknown> }> = [
      {
        email: 'rollback-direct@example.test',
        action: (values) =>
          repository.createArtistContact(administratorAccess, artistId, values, [invalidRoleId]),
      },
      {
        email: 'rollback-partner@example.test',
        action: (values) =>
          repository.createBusinessPartnerContact(
            administratorAccess,
            rollbackPartner.body.id,
            values,
            [invalidRoleId],
          ),
      },
      {
        email: 'rollback-representation@example.test',
        action: (values) =>
          repository.linkArtistBusinessPartnerWithContact(
            administratorAccess,
            artistId,
            rollbackPartner.body.id,
            [partnerRoleIds[0]],
            { contact: values },
            [invalidRoleId],
            false,
          ),
      },
    ];
    for (const testCase of cases) {
      const values: ContactValues = {
        firstName: 'Rollback',
        lastName: 'Contact',
        label: null,
        email: testCase.email,
        phone: null,
        mobile: null,
        notes: null,
      };
      await expect(testCase.action(values)).rejects.toThrow();
      expect(
        await prisma.database.contact.count({
          where: { organizationId, email: testCase.email },
        }),
      ).toBe(0);
    }
    expect(
      await prisma.database.artistBusinessPartner.count({
        where: { organizationId, artistId, businessPartnerId: rollbackPartner.body.id },
      }),
    ).toBe(0);
    expect(
      await prisma.database.businessPartnerContact.count({
        where: { organizationId, businessPartnerId: rollbackPartner.body.id },
      }),
    ).toBe(0);
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
    expect(
      (
        await productionAgent
          .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners`)
          .send({
            businessPartnerId: partnerId,
            roleIds: [partnerRoleIds[0]],
            representatives: [
              {
                businessPartnerContactId: partnerContactAssociationId,
                roleIds: [contactRoleIds[0]],
              },
            ],
          })
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
    const secondPartner = await secondAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/business-partners`)
      .send({ companyName: 'Tenant Two Agency', roleIds: [partnerRoleIds[0]] });
    expect(secondArtist.status).toBe(201);
    expect(secondContact.status).toBe(201);
    expect(secondPartner.status).toBe(201);
    const secondPartnerWithContact = await secondAgent
      .post(
        `/api/v1/organizations/${secondOrganizationId}/business-partners/${secondPartner.body.id as string}/contacts`,
      )
      .send({ contactId: secondContact.body.id, roleIds: [contactRoleIds[0]] });
    expect(secondPartnerWithContact.status).toBe(201);
    const secondPartnerContactId = secondPartnerWithContact.body.contacts[0].id as string;

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
    const crossTenantRepresentation = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/artists/${artistId}/business-partners`)
      .send({
        businessPartnerId: partnerId,
        roleIds: [partnerRoleIds[0]],
        representatives: [
          {
            businessPartnerContactId: secondPartnerContactId,
            roleIds: [contactRoleIds[0]],
          },
        ],
      });
    expect(crossTenantRepresentation.status).toBe(404);

    await expect(
      prisma.database.artistContact.create({
        data: {
          organizationId,
          artistId,
          contactId: secondContact.body.id as string,
        },
      }),
    ).rejects.toThrow();

    const rawArtistPartner = await prisma.database.artistBusinessPartner.create({
      data: { organizationId, artistId, businessPartnerId: partnerId },
    });
    await expect(
      prisma.database.artistBusinessPartnerContact.create({
        data: {
          organizationId,
          artistBusinessPartnerId: rawArtistPartner.id,
          businessPartnerId: partnerId,
          businessPartnerContactId: secondPartnerContactId,
        },
      }),
    ).rejects.toThrow();
    await prisma.database.artistBusinessPartner.delete({ where: { id: rawArtistPartner.id } });
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
        'artist.business_partner_linked',
        'artist.business_partner_roles_updated',
        'artist.business_partner_unlinked',
        'artist.representative_linked',
        'artist.representative_updated',
        'artist.representative_unlinked',
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
