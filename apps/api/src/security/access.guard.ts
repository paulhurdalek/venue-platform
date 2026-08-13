import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PERMISSION_REQUIREMENT } from './access.decorator.js';
import { AccessService } from './access.service.js';
import type { AccessContext, PermissionRequirement } from './access.types.js';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AccessService)
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSION_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { accessContext?: AccessContext }>();
    const organizationParameter = request.params.organizationId;
    const organizationId = Array.isArray(organizationParameter)
      ? organizationParameter[0]
      : organizationParameter;
    if (!organizationId) throw new Error('Protected organization route has no organizationId');
    const locationParameter = requirement.locationParameter
      ? request.params[requirement.locationParameter]
      : undefined;
    const locationId = Array.isArray(locationParameter) ? locationParameter[0] : locationParameter;
    request.accessContext = await this.accessService.authorize(
      request,
      organizationId,
      requirement.permission,
      locationId,
    );
    return true;
  }
}
