import type { INestApplication } from '@nestjs/common';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { AuthService } from '../src/auth/auth.service.js';
import { createApiApplication } from '../src/bootstrap.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { hashToken } from '../src/security/security.functions.js';
import { SetupService } from '../src/setup/setup.service.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
const describeWithDatabase = hasDatabase ? describe.sequential : describe.skip;
const origin = 'http://localhost:3100';
const administratorEmail = 'phase1-admin@example.test';
const administratorPassword = 'Local-Test-Admin-42!';
const invitedEmail = 'phase1-member@example.test';
const invitedPassword = 'Local-Test-Member-42!';

describeWithDatabase('Phase 1 PostgreSQL and API integration', () => {
  let application: INestApplication;
  let prisma: PrismaService;
  let setup: SetupService;
  let auth: AuthService;
  let administratorAgent: ReturnType<typeof request.agent>;
  let memberAgent: ReturnType<typeof request.agent>;
  let secondAdministratorAgent: ReturnType<typeof request.agent>;
  let organizationId = '';
  let locationId = '';
  let secondLocationId = '';
  let secondOrganizationId = '';
  let secondOrganizationLocationId = '';
  let memberMembershipId = '';
  let memberMembershipVersion = 1;
  let readOnlyRoleId = '';
  let secondOrganizationReadOnlyRoleId = '';
  let firstInvitationToken = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    application = await createApiApplication();
    await application.init();
    prisma = application.get(PrismaService);
    setup = application.get(SetupService);
    auth = application.get(AuthService);
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    if (prisma) await cleanDatabase(prisma);
    await application?.close();
  });

  it('rejects protected resources without a database session', async () => {
    const response = await request(application.getHttpServer()).get('/api/v1/session');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('completes the bootstrap exactly once without persisting its raw token', async () => {
    const bootstrap = await setup.createBootstrapLink();
    const token = new URL(bootstrap.link).searchParams.get('token');
    expect(token).toBeTruthy();
    const storedToken = await prisma.database.bootstrapToken.findFirstOrThrow();
    expect(storedToken.tokenHash).toBe(hashToken(token!));
    expect(storedToken.tokenHash).not.toContain(token!);

    const response = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Phase One Administrator',
        email: administratorEmail,
        password: administratorPassword,
        passwordConfirmation: administratorPassword,
        organizationName: 'Phase One Venue',
        locationName: 'Main Hall',
        timezone: 'Europe/Berlin',
      });
    expect(response.status).toBe(200);
    organizationId = response.body.organizationId as string;
    locationId = response.body.locationId as string;

    const repeated = await request(application.getHttpServer())
      .post('/api/v1/setup/bootstrap')
      .send({
        token,
        administratorName: 'Another Administrator',
        email: 'second-bootstrap@example.test',
        password: administratorPassword,
        passwordConfirmation: administratorPassword,
        organizationName: 'Second Bootstrap',
        locationName: 'Should Not Exist',
        timezone: 'Europe/Berlin',
      });
    expect(repeated.status).toBe(409);
    await expect(setup.createBootstrapLink()).rejects.toMatchObject({ status: 409 });
    expect(await prisma.database.organization.count()).toBe(1);
  });

  it('creates the five organization-local roles with the specified permission baseline', async () => {
    const roles = await prisma.database.role.findMany({
      where: { organizationId },
      include: { permissions: true },
      orderBy: { key: 'asc' },
    });
    expect(roles).toHaveLength(5);
    expect(roles.map((role) => role.name).sort()).toEqual(
      ['Administrator', 'Booking', 'Lesend', 'Management & Finanzen', 'Produktion'].sort(),
    );
    expect(roles.find((role) => role.key === 'administrator')?.permissions).toHaveLength(21);
    expect(roles.find((role) => role.key === 'management_finance')?.permissions).toHaveLength(9);
    expect(roles.find((role) => role.key === 'booking')?.permissions).toHaveLength(9);
    expect(roles.find((role) => role.key === 'production')?.permissions).toHaveLength(5);
    expect(roles.find((role) => role.key === 'read_only')?.permissions).toHaveLength(5);
    readOnlyRoleId = roles.find((role) => role.key === 'read_only')!.id;
  });

  it('blocks public sign-up server-side and provides database-backed sign-in/session cookies', async () => {
    const signUp = await request(application.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', origin)
      .send({ name: 'Public User', email: 'public@example.test', password: invitedPassword });
    expect(signUp.status).toBeGreaterThanOrEqual(400);
    expect(
      await prisma.database.user.findUnique({ where: { email: 'public@example.test' } }),
    ).toBeNull();

    const invalidSignIn = await request(application.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', origin)
      .send({ email: administratorEmail, password: 'wrong-password' });
    expect(invalidSignIn.status).toBeGreaterThanOrEqual(400);

    administratorAgent = request.agent(application.getHttpServer());
    const signIn = await signInAs(administratorAgent, administratorEmail, administratorPassword);
    expect(signIn.status).toBe(200);
    const setCookies = readSetCookieHeaders(signIn.headers['set-cookie']);
    expect(setCookies.some((cookie) => /HttpOnly/i.test(cookie))).toBe(true);
    expect(setCookies.some((cookie) => /SameSite=Lax/i.test(cookie))).toBe(true);
    expect(await prisma.database.session.count()).toBe(1);

    const session = await administratorAgent.get('/api/v1/session');
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ email: administratorEmail });
    expect(session.body.memberships).toHaveLength(1);
  });

  it('updates organization data and rejects stale versions', async () => {
    const organization = await administratorAgent.get(`/api/v1/organizations/${organizationId}`);
    expect(organization.status).toBe(200);
    const initialVersion = organization.body.version as number;
    const updated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}`)
      .send({ version: initialVersion, legalName: 'Phase One Venue GmbH' });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(initialVersion + 1);

    const stale = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}`)
      .send({ version: initialVersion, phone: '+49 30 123456' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    secondLocationId = (
      await prisma.database.location.create({
        data: { organizationId, name: 'Restricted Annex', timezone: 'Europe/Berlin' },
      })
    ).id;
  });

  it('normalizes a lowercase Location country code before persistence', async () => {
    const location = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/locations/${locationId}`,
    );
    const response = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/locations/${locationId}`)
      .send({ version: location.body.version, capacity: 450, countryCode: 'de' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ capacity: 450, countryCode: 'DE' });
    await expect(
      prisma.database.location.findUniqueOrThrow({ where: { id: locationId } }),
    ).resolves.toMatchObject({ countryCode: 'DE' });
  });

  it('rejects a numeric Location country code without changing the Location', async () => {
    const before = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/locations/${locationId}`,
    );
    const response = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/locations/${locationId}`)
      .send({ version: before.body.version, countryCode: '49' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: expect.arrayContaining(['countryCode']) },
    });

    const after = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/locations/${locationId}`,
    );
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({
      version: before.body.version,
      capacity: before.body.capacity,
      countryCode: before.body.countryCode,
    });
  });

  it('enforces concrete permissions and selected location scope for an invited user', async () => {
    const invitation = await administratorAgent
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .send({
        email: invitedEmail,
        roleIds: [readOnlyRoleId],
        locationScope: 'SELECTED',
        locationIds: [locationId],
      });
    expect(invitation.status).toBe(201);
    firstInvitationToken = new URL(invitation.body.invitationLink as string).searchParams.get(
      'token',
    )!;
    expect(firstInvitationToken).toBeTruthy();

    const accepted = await request(application.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({
        token: firstInvitationToken,
        name: 'Read Only Member',
        password: invitedPassword,
        passwordConfirmation: invitedPassword,
      });
    expect(accepted.status).toBe(200);
    expect(accepted.body.createdUser).toBe(true);
    const acceptedAgain = await request(application.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: firstInvitationToken });
    expect(acceptedAgain.status).toBe(409);

    memberAgent = request.agent(application.getHttpServer());
    expect((await signInAs(memberAgent, invitedEmail, invitedPassword)).status).toBe(200);
    expect((await memberAgent.get(`/api/v1/organizations/${organizationId}`)).status).toBe(200);
    expect(
      (await memberAgent.get(`/api/v1/organizations/${organizationId}/locations/${locationId}`))
        .status,
    ).toBe(200);
    expect(
      (
        await memberAgent.get(
          `/api/v1/organizations/${organizationId}/locations/${secondLocationId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await memberAgent
          .patch(`/api/v1/organizations/${organizationId}`)
          .send({ version: 2, phone: '+49 30 000000' })
      ).status,
    ).toBe(403);

    const membership = await prisma.database.membership.findFirstOrThrow({
      where: { organizationId, user: { email: invitedEmail } },
    });
    memberMembershipId = membership.id;
    memberMembershipVersion = membership.version;
  });

  it('removes organization access immediately when a membership is suspended', async () => {
    const suspended = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/members/${memberMembershipId}/status`)
      .send({ status: 'SUSPENDED', version: memberMembershipVersion });
    expect(suspended.status).toBe(200);
    expect((await memberAgent.get(`/api/v1/organizations/${organizationId}`)).status).toBe(403);

    const reactivated = await administratorAgent
      .patch(`/api/v1/organizations/${organizationId}/members/${memberMembershipId}/status`)
      .send({ status: 'ACTIVE', version: suspended.body.version });
    expect(reactivated.status).toBe(200);
    memberMembershipVersion = reactivated.body.version as number;
  });

  it('isolates a second organization and lets an existing user join it by invitation', async () => {
    const secondAdmin = await auth.auth.api.createUser({
      body: {
        name: 'Second Organization Admin',
        email: 'second-admin@example.test',
        password: administratorPassword,
      },
    });
    await prisma.transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: secondAdmin.user.id },
        data: { emailVerified: true },
      });
      const organization = await transaction.organization.create({
        data: { name: 'Isolated Organization' },
      });
      secondOrganizationId = organization.id;
      secondOrganizationLocationId = (
        await transaction.location.create({
          data: {
            organizationId: organization.id,
            name: 'Isolated Location',
            timezone: 'Europe/Berlin',
          },
        })
      ).id;
      const administratorRoleId = await setup.createStandardRoles(transaction, organization.id);
      secondOrganizationReadOnlyRoleId = (
        await transaction.role.findUniqueOrThrow({
          where: { organizationId_key: { organizationId: organization.id, key: 'read_only' } },
        })
      ).id;
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

    const firstAdministratorMembership = await prisma.database.membership.findFirstOrThrow({
      where: { organizationId, user: { email: administratorEmail } },
    });
    await expect(
      prisma.database.membershipRole.create({
        data: {
          organizationId: secondOrganizationId,
          membershipId: firstAdministratorMembership.id,
          roleId: secondOrganizationReadOnlyRoleId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.database.auditLog.create({
        data: {
          organizationId: secondOrganizationId,
          actorMembershipId: firstAdministratorMembership.id,
          action: 'tenant.crossing_attempt',
          targetType: 'test',
          metadata: {},
        },
      }),
    ).rejects.toThrow();

    expect(
      (await administratorAgent.get(`/api/v1/organizations/${secondOrganizationId}`)).status,
    ).toBe(404);
    expect(
      (
        await administratorAgent.get(
          `/api/v1/organizations/${organizationId}/locations/${secondOrganizationLocationId}`,
        )
      ).status,
    ).toBe(404);

    secondAdministratorAgent = request.agent(application.getHttpServer());
    expect(
      (await signInAs(secondAdministratorAgent, 'second-admin@example.test', administratorPassword))
        .status,
    ).toBe(200);
    const invitation = await secondAdministratorAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/invitations`)
      .send({
        email: invitedEmail,
        roleIds: [secondOrganizationReadOnlyRoleId],
        locationScope: 'ALL',
        locationIds: [],
      });
    const token = new URL(invitation.body.invitationLink as string).searchParams.get('token')!;
    const accepted = await memberAgent.post('/api/v1/invitations/accept').send({ token });
    expect(accepted.status).toBe(200);
    expect(accepted.body.createdUser).toBe(false);
    expect(
      await prisma.database.membership.count({
        where: { user: { email: invitedEmail } },
      }),
    ).toBe(2);
    expect((await memberAgent.get(`/api/v1/organizations/${secondOrganizationId}`)).status).toBe(
      200,
    );
  });

  it('rejects revoked and expired invitations', async () => {
    const revoked = await secondAdministratorAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/invitations`)
      .send({
        email: 'revoked@example.test',
        roleIds: [secondOrganizationReadOnlyRoleId],
        locationScope: 'ALL',
        locationIds: [],
      });
    const revokedToken = new URL(revoked.body.invitationLink as string).searchParams.get('token')!;
    expect(
      (
        await secondAdministratorAgent.delete(
          `/api/v1/organizations/${secondOrganizationId}/invitations/${revoked.body.id as string}`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(application.getHttpServer())
          .post('/api/v1/invitations/accept')
          .send({ token: revokedToken })
      ).status,
    ).toBe(409);

    const expired = await secondAdministratorAgent
      .post(`/api/v1/organizations/${secondOrganizationId}/invitations`)
      .send({
        email: 'expired@example.test',
        roleIds: [secondOrganizationReadOnlyRoleId],
        locationScope: 'ALL',
        locationIds: [],
      });
    const expiredToken = new URL(expired.body.invitationLink as string).searchParams.get('token')!;
    await prisma.database.invitation.update({
      where: { tokenHash: hashToken(expiredToken) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(
      (
        await request(application.getHttpServer())
          .post('/api/v1/invitations/accept')
          .send({ token: expiredToken })
      ).status,
    ).toBe(409);
  });

  it('keeps audit data append-only and free of credentials and token material', async () => {
    const auditResponse = await administratorAgent.get(
      `/api/v1/organizations/${organizationId}/audit?limit=10`,
    );
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.length).toBeLessThanOrEqual(10);

    const auditEntries = await prisma.database.auditLog.findMany();
    const serialized = JSON.stringify(auditEntries);
    const sessionTokens = await prisma.database.session.findMany({ select: { token: true } });
    expect(auditEntries.some((entry) => entry.action === 'bootstrap.completed')).toBe(true);
    expect(auditEntries.some((entry) => entry.action === 'invitation.accepted')).toBe(true);
    expect(serialized).not.toContain(administratorPassword);
    expect(serialized).not.toContain(invitedPassword);
    expect(serialized).not.toContain(firstInvitationToken);
    expect(serialized).not.toContain(invitedEmail);
    for (const session of sessionTokens) expect(serialized).not.toContain(session.token);

    const firstAudit = auditEntries[0]!;
    await expect(
      prisma.database.auditLog.update({
        where: { id: firstAudit.id },
        data: { action: 'tampered' },
      }),
    ).rejects.toThrow();
  });

  it('revokes the current database session on sign-out', async () => {
    const user = await prisma.database.user.findUniqueOrThrow({ where: { email: invitedEmail } });
    const countBefore = await prisma.database.session.count({ where: { userId: user.id } });
    const signedOut = await memberAgent.post('/api/auth/sign-out').set('Origin', origin).send({});
    expect(signedOut.status).toBe(200);
    expect((await memberAgent.get('/api/v1/session')).status).toBe(401);
    expect(await prisma.database.session.count({ where: { userId: user.id } })).toBeLessThan(
      countBefore,
    );
  });
});

async function signInAs(agent: ReturnType<typeof request.agent>, email: string, password: string) {
  return agent
    .post('/api/auth/sign-in/email')
    .set('Origin', origin)
    .send({ email, password, rememberMe: true });
}

function readSetCookieHeaders(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.database.$executeRawUnsafe(`
    TRUNCATE TABLE
      "artist_business_partner_contact_role", "artist_business_partner_contact",
      "artist_business_partner_role", "artist_business_partner",
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
