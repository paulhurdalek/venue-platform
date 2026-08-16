import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, TransactionClient } from '@venue/database';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { AccessService } from '../security/access.service.js';
import type { AccessContext } from '../security/access.types.js';
import {
  generateOpaqueToken,
  hashToken,
  invitationState,
  isIanaTimezone,
  normalizeEmail,
} from '../security/security.functions.js';
import type {
  AcceptInvitationDto,
  AcceptInvitationResultDto,
  AssignLocationScopeDto,
  AssignRolesDto,
  AuditEntryDto,
  CreateInvitationDto,
  CreatedInvitationDto,
  InvitationDto,
  InvitationValidationDto,
  LocationDto,
  MembershipDto,
  OrganizationDto,
  RoleDto,
  SessionContextDto,
  UpdateLocationDto,
  UpdateMembershipStatusDto,
  UpdateOrganizationDto,
} from './platform.dto.js';

const roleInclude = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;

const membershipInclude = {
  user: true,
  organization: true,
  roles: { include: { role: { include: roleInclude } } },
  locations: true,
} satisfies Prisma.MembershipInclude;

const invitationInclude = {
  roles: { include: { role: { include: roleInclude } } },
  locations: true,
  organization: true,
} satisfies Prisma.InvitationInclude;

type RoleRecord = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;
type MembershipRecord = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;
type InvitationRecord = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

@Injectable()
export class PlatformService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AccessService)
    private readonly access: AccessService,
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(AuditWriter)
    private readonly auditWriter: AuditWriter,
  ) {}

  async sessionContext(request: Request): Promise<SessionContextDto> {
    const user = await this.access.requireSession(request);
    const memberships = await this.prisma.database.membership.findMany({
      where: { userId: user.id },
      include: membershipInclude,
      orderBy: { organization: { name: 'asc' } },
    });
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      memberships: memberships.map((membership) => this.mapMembership(membership)),
    };
  }

  async organizations(request: Request): Promise<OrganizationDto[]> {
    const user = await this.access.requireSession(request);
    const organizations = await this.prisma.database.organization.findMany({
      where: { memberships: { some: { userId: user.id, status: 'ACTIVE' } } },
      orderBy: { name: 'asc' },
    });
    return organizations.map((organization) => this.mapOrganization(organization));
  }

  async organization(organizationId: string): Promise<OrganizationDto> {
    const organization = await this.prisma.database.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) this.notFound();
    return this.mapOrganization(organization!);
  }

  async updateOrganization(
    access: AccessContext,
    input: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    const { version, ...values } = input;
    const changedFields = Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changedFields.length === 0) this.noChanges();

    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.organization.updateMany({
        where: { id: access.organizationId, version },
        data: {
          ...(values.name !== undefined ? { name: values.name.trim() } : {}),
          ...(values.legalName !== undefined
            ? { legalName: this.trimNullable(values.legalName) }
            : {}),
          ...(values.email !== undefined ? { email: this.trimNullable(values.email) } : {}),
          ...(values.phone !== undefined ? { phone: this.trimNullable(values.phone) } : {}),
          version: { increment: 1 },
        },
      });
      this.assertUpdated(result.count);
      const organization = await transaction.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
      });
      await this.auditWriter.append(
        transaction,
        access,
        'organization.updated',
        'organization',
        organization.id,
        {
          changedFields,
          previousVersion: version,
          newVersion: organization.version,
        },
      );
      return this.mapOrganization(organization);
    });
  }

  async locations(access: AccessContext): Promise<LocationDto[]> {
    const locations = await this.prisma.database.location.findMany({
      where: {
        organizationId: access.organizationId,
        ...(access.locationScope === 'SELECTED' ? { id: { in: access.locationIds } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return locations.map((location) => this.mapLocation(location));
  }

  async location(organizationId: string, locationId: string): Promise<LocationDto> {
    const location = await this.prisma.database.location.findFirst({
      where: { id: locationId, organizationId },
    });
    if (!location) this.notFound();
    return this.mapLocation(location!);
  }

  async updateLocation(
    access: AccessContext,
    locationId: string,
    input: UpdateLocationDto,
  ): Promise<LocationDto> {
    const { version, ...values } = input;
    if (values.timezone !== undefined && !isIanaTimezone(values.timezone)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_TIMEZONE',
        message: 'Die Zeitzone ist keine gültige IANA-Zeitzone',
      });
    }
    const changedFields = Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changedFields.length === 0) this.noChanges();

    return this.prisma.transaction(async (transaction) => {
      const result = await transaction.location.updateMany({
        where: { id: locationId, organizationId: access.organizationId, version },
        data: {
          ...(values.name !== undefined ? { name: values.name.trim() } : {}),
          ...(values.timezone !== undefined ? { timezone: values.timezone } : {}),
          ...(values.capacity !== undefined ? { capacity: values.capacity } : {}),
          ...(values.addressLine1 !== undefined
            ? { addressLine1: this.trimNullable(values.addressLine1) }
            : {}),
          ...(values.addressLine2 !== undefined
            ? { addressLine2: this.trimNullable(values.addressLine2) }
            : {}),
          ...(values.postalCode !== undefined
            ? { postalCode: this.trimNullable(values.postalCode) }
            : {}),
          ...(values.city !== undefined ? { city: this.trimNullable(values.city) } : {}),
          ...(values.state !== undefined ? { state: this.trimNullable(values.state) } : {}),
          ...(values.countryCode !== undefined
            ? { countryCode: this.trimNullable(values.countryCode) }
            : {}),
          ...(values.contactEmail !== undefined
            ? { contactEmail: this.trimNullable(values.contactEmail) }
            : {}),
          ...(values.contactPhone !== undefined
            ? { contactPhone: this.trimNullable(values.contactPhone) }
            : {}),
          version: { increment: 1 },
        },
      });
      this.assertUpdated(result.count);
      const location = await transaction.location.findUniqueOrThrow({ where: { id: locationId } });
      await this.auditWriter.append(
        transaction,
        access,
        'location.updated',
        'location',
        locationId,
        {
          changedFields,
          previousVersion: version,
          newVersion: location.version,
        },
      );
      return this.mapLocation(location);
    });
  }

  async members(organizationId: string): Promise<MembershipDto[]> {
    const memberships = await this.prisma.database.membership.findMany({
      where: { organizationId },
      include: membershipInclude,
      orderBy: { user: { name: 'asc' } },
    });
    return memberships.map((membership) => this.mapMembership(membership));
  }

  async roles(organizationId: string): Promise<RoleDto[]> {
    const roles = await this.prisma.database.role.findMany({
      where: { organizationId },
      include: roleInclude,
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => this.mapRole(role));
  }

  async updateMembershipStatus(
    access: AccessContext,
    membershipId: string,
    input: UpdateMembershipStatusDto,
  ): Promise<MembershipDto> {
    return this.prisma.transaction(async (transaction) => {
      const target = await this.findMembership(transaction, access.organizationId, membershipId);
      if (input.status === 'SUSPENDED') await this.protectLastAdministrator(transaction, target);
      const result = await transaction.membership.updateMany({
        where: { id: membershipId, organizationId: access.organizationId, version: input.version },
        data: { status: input.status, version: { increment: 1 } },
      });
      this.assertUpdated(result.count);
      await this.auditWriter.append(
        transaction,
        access,
        input.status === 'ACTIVE' ? 'membership.reactivated' : 'membership.suspended',
        'membership',
        membershipId,
        { previousVersion: input.version, newStatus: input.status },
      );
      return this.mapMembership(
        await transaction.membership.findUniqueOrThrow({
          where: { id: membershipId },
          include: membershipInclude,
        }),
      );
    });
  }

  async assignRoles(
    access: AccessContext,
    membershipId: string,
    input: AssignRolesDto,
  ): Promise<MembershipDto> {
    const roleIds = [...new Set(input.roleIds)];
    return this.prisma.transaction(async (transaction) => {
      const target = await this.findMembership(transaction, access.organizationId, membershipId);
      const roles = await transaction.role.findMany({
        where: { organizationId: access.organizationId, id: { in: roleIds } },
      });
      if (roles.length !== roleIds.length) this.notFound();
      const removesAdministrator =
        target.roles.some(({ role }) => role.key === 'administrator') &&
        !roles.some((role) => role.key === 'administrator');
      if (removesAdministrator) await this.protectLastAdministrator(transaction, target);

      const result = await transaction.membership.updateMany({
        where: { id: membershipId, organizationId: access.organizationId, version: input.version },
        data: { version: { increment: 1 } },
      });
      this.assertUpdated(result.count);
      await transaction.membershipRole.deleteMany({ where: { membershipId } });
      await transaction.membershipRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          membershipId,
          roleId,
        })),
      });
      await this.auditWriter.append(
        transaction,
        access,
        'membership.roles_updated',
        'membership',
        membershipId,
        {
          roleIds,
          previousVersion: input.version,
        },
      );
      return this.mapMembership(
        await transaction.membership.findUniqueOrThrow({
          where: { id: membershipId },
          include: membershipInclude,
        }),
      );
    });
  }

  async assignLocationScope(
    access: AccessContext,
    membershipId: string,
    input: AssignLocationScopeDto,
  ): Promise<MembershipDto> {
    this.validateLocationScope(input.scope, input.locationIds);
    const locationIds = [...new Set(input.locationIds)];
    return this.prisma.transaction(async (transaction) => {
      await this.findMembership(transaction, access.organizationId, membershipId);
      if (input.scope === 'SELECTED') {
        const count = await transaction.location.count({
          where: { organizationId: access.organizationId, id: { in: locationIds } },
        });
        if (count !== locationIds.length) this.notFound();
      }
      const result = await transaction.membership.updateMany({
        where: { id: membershipId, organizationId: access.organizationId, version: input.version },
        data: { locationScope: input.scope, version: { increment: 1 } },
      });
      this.assertUpdated(result.count);
      await transaction.membershipLocation.deleteMany({ where: { membershipId } });
      if (input.scope === 'SELECTED') {
        await transaction.membershipLocation.createMany({
          data: locationIds.map((locationId) => ({
            organizationId: access.organizationId,
            membershipId,
            locationId,
          })),
        });
      }
      await this.auditWriter.append(
        transaction,
        access,
        'membership.location_access_updated',
        'membership',
        membershipId,
        { scope: input.scope, locationIds, previousVersion: input.version },
      );
      return this.mapMembership(
        await transaction.membership.findUniqueOrThrow({
          where: { id: membershipId },
          include: membershipInclude,
        }),
      );
    });
  }

  async invitations(organizationId: string): Promise<InvitationDto[]> {
    const invitations = await this.prisma.database.invitation.findMany({
      where: { organizationId },
      include: invitationInclude,
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) => this.mapInvitation(invitation));
  }

  async createInvitation(
    access: AccessContext,
    input: CreateInvitationDto,
  ): Promise<CreatedInvitationDto> {
    this.validateLocationScope(input.locationScope, input.locationIds);
    const roleIds = [...new Set(input.roleIds)];
    const locationIds = [...new Set(input.locationIds)];
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('INVITATION_TTL_SECONDS') * 1000,
    );

    const invitation = await this.prisma.transaction(async (transaction) => {
      const roleCount = await transaction.role.count({
        where: { organizationId: access.organizationId, id: { in: roleIds } },
      });
      if (roleCount !== roleIds.length) this.notFound();
      if (input.locationScope === 'SELECTED') {
        const locationCount = await transaction.location.count({
          where: { organizationId: access.organizationId, id: { in: locationIds } },
        });
        if (locationCount !== locationIds.length) this.notFound();
      }
      const baseInvitation = await transaction.invitation.create({
        data: {
          organizationId: access.organizationId,
          inviterMembershipId: access.membershipId,
          email: normalizeEmail(input.email),
          tokenHash: hashToken(rawToken),
          expiresAt,
          locationScope: input.locationScope,
        },
      });
      await transaction.invitationRole.createMany({
        data: roleIds.map((roleId) => ({
          organizationId: access.organizationId,
          invitationId: baseInvitation.id,
          roleId,
        })),
      });
      if (input.locationScope === 'SELECTED') {
        await transaction.invitationLocation.createMany({
          data: locationIds.map((locationId) => ({
            organizationId: access.organizationId,
            invitationId: baseInvitation.id,
            locationId,
          })),
        });
      }
      const created = await transaction.invitation.findUniqueOrThrow({
        where: { id: baseInvitation.id },
        include: invitationInclude,
      });
      await this.auditWriter.append(
        transaction,
        access,
        'invitation.created',
        'invitation',
        created.id,
        {
          expiresAt: created.expiresAt.toISOString(),
          roleIds,
          locationScope: created.locationScope,
          locationIds,
        },
      );
      return created;
    });

    const invitationLink = new URL(
      '/accept-invitation',
      this.config.getOrThrow<string>('WEB_PUBLIC_URL'),
    );
    invitationLink.searchParams.set('token', rawToken);
    return { ...this.mapInvitation(invitation), invitationLink: invitationLink.toString() };
  }

  async revokeInvitation(access: AccessContext, invitationId: string): Promise<InvitationDto> {
    return this.prisma.transaction(async (transaction) => {
      const invitation = await transaction.invitation.findFirst({
        where: { id: invitationId, organizationId: access.organizationId },
        include: invitationInclude,
      });
      if (!invitation) this.notFound();
      if (invitationState(invitation!) !== 'PENDING') {
        throw new ConflictException({
          code: 'INVITATION_NOT_PENDING',
          message: 'Die Einladung kann nicht mehr widerrufen werden',
        });
      }
      await transaction.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      await this.auditWriter.append(
        transaction,
        access,
        'invitation.revoked',
        'invitation',
        invitationId,
        {},
      );
      return this.mapInvitation(
        await transaction.invitation.findUniqueOrThrow({
          where: { id: invitationId },
          include: invitationInclude,
        }),
      );
    });
  }

  async validateInvitation(rawToken: string): Promise<InvitationValidationDto> {
    const invitation = await this.prisma.database.invitation.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { organization: true },
    });
    if (!invitation)
      return {
        status: 'INVALID',
        email: undefined,
        organizationName: undefined,
        existingUser: undefined,
        expiresAt: undefined,
      };
    const state = invitationState(invitation);
    if (state !== 'PENDING') {
      return {
        status: state === 'ACCEPTED' ? 'USED' : state,
        email: undefined,
        organizationName: undefined,
        existingUser: undefined,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    }
    const existingUser = Boolean(
      await this.prisma.database.user.findUnique({ where: { email: invitation.email } }),
    );
    return {
      status: 'VALID',
      email: invitation.email,
      organizationName: invitation.organization.name,
      existingUser,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    request: Request,
    input: AcceptInvitationDto,
  ): Promise<AcceptInvitationResultDto> {
    const tokenHash = hashToken(input.token);
    return this.prisma.transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext(${tokenHash}))::text AS lock
      `;
      const invitation = await transaction.invitation.findUnique({
        where: { tokenHash },
        include: invitationInclude,
      });
      if (!invitation) this.invalidInvitation();
      if (invitationState(invitation!) !== 'PENDING') this.invalidInvitation();

      let user = await transaction.user.findUnique({ where: { email: invitation!.email } });
      let createdUser = false;
      if (user) {
        const session = await this.access.optionalSession(request);
        if (!session?.user || normalizeEmail(session.user.email) !== invitation!.email) {
          throw new UnauthorizedException({
            code: 'INVITATION_SIGN_IN_REQUIRED',
            message: 'Bitte mit der eingeladenen E-Mail-Adresse anmelden',
          });
        }
      } else {
        this.validateNewInvitedUser(input);
        const transactionAuth = this.auth.createForTransaction(transaction);
        const result = await transactionAuth.api.createUser({
          body: {
            email: invitation!.email,
            name: input.name!.trim(),
            password: input.password!,
          },
        });
        await transaction.user.update({
          where: { id: result.user.id },
          data: { emailVerified: true },
        });
        user = await transaction.user.findUniqueOrThrow({ where: { id: result.user.id } });
        createdUser = true;
      }

      let membership = await transaction.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation!.organizationId,
            userId: user.id,
          },
        },
      });
      if (!membership) {
        membership = await transaction.membership.create({
          data: {
            organizationId: invitation!.organizationId,
            userId: user.id,
            locationScope: invitation!.locationScope,
          },
        });
        await transaction.membershipRole.createMany({
          data: invitation!.roles.map(({ roleId }) => ({
            organizationId: invitation!.organizationId,
            membershipId: membership!.id,
            roleId,
          })),
        });
        if (invitation!.locationScope === 'SELECTED') {
          await transaction.membershipLocation.createMany({
            data: invitation!.locations.map(({ locationId }) => ({
              organizationId: invitation!.organizationId,
              membershipId: membership!.id,
              locationId,
            })),
          });
        }
      }

      const accepted = await transaction.invitation.updateMany({
        where: { id: invitation!.id, status: 'PENDING', acceptedAt: null, revokedAt: null },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      if (accepted.count !== 1) this.invalidInvitation();
      await transaction.auditLog.create({
        data: {
          organizationId: invitation!.organizationId,
          actorUserId: user.id,
          actorMembershipId: membership.id,
          action: 'invitation.accepted',
          targetType: 'invitation',
          targetId: invitation!.id,
          metadata: { createdUser },
        },
      });
      return {
        organizationId: invitation!.organizationId,
        membershipId: membership.id,
        createdUser,
      };
    });
  }

  async auditEntries(organizationId: string, limit: number): Promise<AuditEntryDto[]> {
    const entries = await this.prisma.database.auditLog.findMany({
      where: { organizationId },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata as Record<string, unknown>,
      createdAt: entry.createdAt.toISOString(),
      actorName: entry.actorUser?.name ?? null,
    }));
  }

  private async findMembership(
    transaction: TransactionClient,
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipRecord> {
    const membership = await transaction.membership.findFirst({
      where: { id: membershipId, organizationId },
      include: membershipInclude,
    });
    if (!membership) this.notFound();
    return membership!;
  }

  private async protectLastAdministrator(
    transaction: TransactionClient,
    target: MembershipRecord,
  ): Promise<void> {
    if (!target.roles.some(({ role }) => role.key === 'administrator')) return;
    const count = await transaction.membership.count({
      where: {
        organizationId: target.organizationId,
        status: 'ACTIVE',
        roles: { some: { role: { key: 'administrator' } } },
      },
    });
    if (count <= 1) {
      throw new ConflictException({
        code: 'LAST_ADMINISTRATOR_REQUIRED',
        message: 'Mindestens eine aktive Administratormitgliedschaft ist erforderlich',
      });
    }
  }

  private mapOrganization(organization: {
    id: string;
    name: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): OrganizationDto {
    return {
      ...organization,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  private mapLocation(location: {
    id: string;
    organizationId: string;
    name: string;
    timezone: string;
    capacity: number | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    countryCode: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): LocationDto {
    return {
      ...location,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    };
  }

  private mapMembership(membership: MembershipRecord): MembershipDto {
    return {
      id: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      status: membership.status,
      locationScope: membership.locationScope,
      locationIds: membership.locations.map(({ locationId }) => locationId),
      roles: membership.roles.map(({ role }) => this.mapRole(role)),
      version: membership.version,
    };
  }

  private mapRole(role: RoleRecord): RoleDto {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      permissions: role.permissions.map(({ permission }) => ({
        id: permission.id,
        key: permission.key,
        description: permission.description,
      })),
    };
  }

  private mapInvitation(invitation: InvitationRecord): InvitationDto {
    return {
      id: invitation.id,
      email: invitation.email,
      status: invitationState(invitation),
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      locationScope: invitation.locationScope,
      locationIds: invitation.locations.map(({ locationId }) => locationId),
      roles: invitation.roles.map(({ role }) => this.mapRole(role)),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  private validateLocationScope(scope: 'ALL' | 'SELECTED', locationIds: string[]): void {
    if (
      (scope === 'SELECTED' && locationIds.length === 0) ||
      (scope === 'ALL' && locationIds.length > 0)
    ) {
      throw new UnprocessableEntityException({
        code: 'INVALID_LOCATION_SCOPE',
        message: 'Location-Geltungsbereich und Auswahl sind widersprüchlich',
      });
    }
  }

  private validateNewInvitedUser(input: AcceptInvitationDto): void {
    if (!input.name || !input.password || input.password !== input.passwordConfirmation) {
      throw new UnprocessableEntityException({
        code: 'INVITATION_ACCOUNT_DETAILS_INVALID',
        message: 'Name, Passwort und passende Bestätigung sind erforderlich',
      });
    }
    if (input.password.length < this.config.getOrThrow<number>('PASSWORD_MIN_LENGTH')) {
      throw new UnprocessableEntityException({
        code: 'PASSWORD_TOO_SHORT',
        message: 'Das Passwort erfüllt die konfigurierte Mindestlänge nicht',
      });
    }
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
      });
    }
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Ressource nicht gefunden',
    });
  }

  private invalidInvitation(): never {
    throw new ConflictException({
      code: 'INVITATION_INVALID',
      message: 'Die Einladung ist ungültig oder nicht mehr verwendbar',
    });
  }

  private trimNullable(value: string | null): string | null {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
