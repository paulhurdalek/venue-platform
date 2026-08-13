import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { PermissionKey } from './security.constants.js';
import {
  evaluatePermissions,
  hasLocationAccess,
  isActiveMembership,
} from './security.functions.js';
import type { AccessContext, AuthenticatedUser } from './access.types.js';

@Injectable()
export class AccessService {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async optionalSession(request: Request) {
    return this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
  }

  async requireSession(request: Request): Promise<AuthenticatedUser> {
    const session = await this.optionalSession(request);
    if (!session?.user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Anmeldung erforderlich',
      });
    }

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
  }

  async authorize(
    request: Request,
    organizationId: string,
    permission: PermissionKey,
    locationId?: string,
  ): Promise<AccessContext> {
    const user = await this.requireSession(request);
    const membership = await this.prisma.database.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        locations: true,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Ressource nicht gefunden',
      });
    }

    if (!isActiveMembership(membership.status)) {
      throw new ForbiddenException({
        code: 'MEMBERSHIP_SUSPENDED',
        message: 'Die Organisationsmitgliedschaft ist gesperrt',
      });
    }

    const permissions = [
      ...new Set(
        membership.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission: assigned }) => assigned.key),
        ),
      ),
    ] as PermissionKey[];

    if (!evaluatePermissions(permissions, permission)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Für diese Aktion fehlt die Berechtigung',
      });
    }

    const locationIds = membership.locations.map((entry) => entry.locationId);
    if (locationId) {
      const location = await this.prisma.database.location.findFirst({
        where: { id: locationId, organizationId },
        select: { id: true },
      });
      if (!location || !hasLocationAccess(membership.locationScope, locationIds, locationId)) {
        throw new NotFoundException({
          code: 'RESOURCE_NOT_FOUND',
          message: 'Ressource nicht gefunden',
        });
      }
    }

    return {
      user,
      membershipId: membership.id,
      organizationId,
      membershipVersion: membership.version,
      permissions,
      locationScope: membership.locationScope,
      locationIds,
    };
  }
}
