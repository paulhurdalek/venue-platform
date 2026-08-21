import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TransactionClient } from '@venue/database';

import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { PERMISSION_CATALOG, STANDARD_ROLES } from '../security/security.constants.js';
import {
  bootstrapAllowed,
  generateOpaqueToken,
  hashToken,
  isIanaTimezone,
  normalizeEmail,
} from '../security/security.functions.js';
import type {
  BootstrapStatusDto,
  CompleteBootstrapDto,
  CompleteBootstrapResultDto,
} from './setup.dto.js';

@Injectable()
export class SetupService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async createBootstrapLink(): Promise<{ link: string; expiresAt: string }> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('BOOTSTRAP_TOKEN_TTL_SECONDS') * 1000,
    );

    await this.prisma.transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext('venue-platform-bootstrap'))::text AS lock
      `;
      await this.assertBootstrapAvailable(transaction);
      const existing = await transaction.bootstrapToken.findFirst({
        where: { consumedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'BOOTSTRAP_LINK_ALREADY_ACTIVE',
          message: 'Es existiert bereits ein gültiger Einrichtungslink',
        });
      }

      const token = await transaction.bootstrapToken.create({
        data: { tokenHash, expiresAt },
      });
      await transaction.auditLog.create({
        data: {
          action: 'bootstrap.created',
          targetType: 'bootstrap_token',
          targetId: token.id,
          metadata: { expiresAt: expiresAt.toISOString() },
        },
      });
    });

    const webUrl = new URL('/setup', this.config.getOrThrow<string>('WEB_PUBLIC_URL'));
    webUrl.searchParams.set('token', rawToken);
    return { link: webUrl.toString(), expiresAt: expiresAt.toISOString() };
  }

  async validateToken(rawToken: string): Promise<BootstrapStatusDto> {
    if (!(await this.isBootstrapAvailable()))
      return { status: 'UNAVAILABLE', expiresAt: undefined };
    const token = await this.prisma.database.bootstrapToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!token) return { status: 'INVALID', expiresAt: undefined };
    if (token.consumedAt) return { status: 'USED', expiresAt: token.expiresAt.toISOString() };
    if (token.expiresAt <= new Date()) {
      return { status: 'EXPIRED', expiresAt: token.expiresAt.toISOString() };
    }
    return { status: 'VALID', expiresAt: token.expiresAt.toISOString() };
  }

  async complete(input: CompleteBootstrapDto): Promise<CompleteBootstrapResultDto> {
    this.validateCompletionInput(input);
    const tokenHash = hashToken(input.token);

    return this.prisma.transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext('venue-platform-bootstrap'))::text AS lock
      `;
      await this.assertBootstrapAvailable(transaction);
      const token = await transaction.bootstrapToken.findUnique({ where: { tokenHash } });
      if (!token || token.consumedAt || token.expiresAt <= new Date()) {
        throw new ConflictException({
          code: 'BOOTSTRAP_TOKEN_INVALID',
          message: 'Der Einrichtungslink ist ungültig oder nicht mehr verwendbar',
        });
      }

      const transactionAuth = this.authService.createForTransaction(transaction);
      const result = await transactionAuth.api.createUser({
        body: {
          email: normalizeEmail(input.email),
          password: input.password,
          name: input.administratorName.trim(),
        },
      });
      const user = result.user;
      await transaction.user.update({ where: { id: user.id }, data: { emailVerified: true } });

      const organization = await transaction.organization.create({
        data: { name: input.organizationName.trim() },
      });
      const location = await transaction.location.create({
        data: {
          organizationId: organization.id,
          name: input.locationName.trim(),
          timezone: input.timezone,
        },
      });
      const administratorRoleId = await this.createStandardRoles(transaction, organization.id);
      const membership = await transaction.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
        },
      });
      await transaction.membershipRole.create({
        data: {
          organizationId: organization.id,
          membershipId: membership.id,
          roleId: administratorRoleId,
        },
      });

      const consumed = await transaction.bootstrapToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date(), consumedByUserId: user.id },
      });
      if (consumed.count !== 1) {
        throw new ConflictException({
          code: 'BOOTSTRAP_TOKEN_INVALID',
          message: 'Der Einrichtungslink ist nicht mehr verwendbar',
        });
      }

      await transaction.auditLog.createMany({
        data: [
          {
            organizationId: organization.id,
            actorUserId: user.id,
            actorMembershipId: membership.id,
            action: 'bootstrap.completed',
            targetType: 'organization',
            targetId: organization.id,
            metadata: {},
          },
          {
            organizationId: organization.id,
            actorUserId: user.id,
            actorMembershipId: membership.id,
            action: 'organization.created',
            targetType: 'organization',
            targetId: organization.id,
            metadata: {},
          },
          {
            organizationId: organization.id,
            actorUserId: user.id,
            actorMembershipId: membership.id,
            action: 'location.created',
            targetType: 'location',
            targetId: location.id,
            metadata: {},
          },
        ],
      });

      return { userId: user.id, organizationId: organization.id, locationId: location.id };
    });
  }

  async createStandardRoles(
    transaction: TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const permissionIds = new Map<string, string>();
    for (const definition of PERMISSION_CATALOG) {
      const permission = await transaction.permission.upsert({
        where: { key: definition.key },
        create: definition,
        update: { description: definition.description },
      });
      permissionIds.set(permission.key, permission.id);
    }

    let administratorRoleId = '';
    for (const definition of STANDARD_ROLES) {
      const role = await transaction.role.create({
        data: { organizationId, key: definition.key, name: definition.name },
      });
      if (definition.key === 'administrator') administratorRoleId = role.id;
      const assignedKeys = definition.allPermissions
        ? PERMISSION_CATALOG.map(({ key }) => key)
        : [...definition.permissionKeys];
      await transaction.rolePermission.createMany({
        data: assignedKeys.map((key) => ({
          organizationId,
          roleId: role.id,
          permissionId: permissionIds.get(key)!,
        })),
      });
    }
    return administratorRoleId;
  }

  private async assertBootstrapAvailable(transaction: TransactionClient): Promise<void> {
    const administratorCount = await transaction.membership.count({
      where: {
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
        roles: { some: { role: { key: 'administrator' } } },
      },
    });
    if (!bootstrapAllowed(administratorCount)) {
      throw new ConflictException({
        code: 'BOOTSTRAP_UNAVAILABLE',
        message: 'Die Ersteinrichtung wurde bereits abgeschlossen',
      });
    }
  }

  private async isBootstrapAvailable(): Promise<boolean> {
    const administratorCount = await this.prisma.database.membership.count({
      where: {
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
        roles: { some: { role: { key: 'administrator' } } },
      },
    });
    return bootstrapAllowed(administratorCount);
  }

  private validateCompletionInput(input: CompleteBootstrapDto): void {
    if (input.password !== input.passwordConfirmation) {
      throw new UnprocessableEntityException({
        code: 'PASSWORD_CONFIRMATION_MISMATCH',
        message: 'Die Passwörter stimmen nicht überein',
      });
    }
    if (input.password.length < this.config.getOrThrow<number>('PASSWORD_MIN_LENGTH')) {
      throw new UnprocessableEntityException({
        code: 'PASSWORD_TOO_SHORT',
        message: 'Das Passwort erfüllt die konfigurierte Mindestlänge nicht',
      });
    }
    if (!isIanaTimezone(input.timezone)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_TIMEZONE',
        message: 'Die Zeitzone ist keine gültige IANA-Zeitzone',
      });
    }
  }
}
