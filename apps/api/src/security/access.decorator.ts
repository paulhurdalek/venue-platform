import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

import type { PermissionKey } from './security.constants.js';
import type { AccessContext, PermissionRequirement } from './access.types.js';

export const PERMISSION_REQUIREMENT = 'venue:permission-requirement';

export function RequirePermission(
  permission: PermissionKey,
  locationParameter?: string,
): MethodDecorator {
  return SetMetadata(PERMISSION_REQUIREMENT, {
    permission,
    ...(locationParameter ? { locationParameter } : {}),
  } satisfies PermissionRequirement);
}

export const CurrentAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessContext => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { accessContext?: AccessContext }>();
    if (!request.accessContext) throw new Error('AccessContext was not initialized by AccessGuard');
    return request.accessContext;
  },
);
