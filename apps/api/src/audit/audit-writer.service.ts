import { Injectable } from '@nestjs/common';
import type { Prisma, TransactionClient } from '@venue/database';

import type { AccessContext } from '../security/access.types.js';

@Injectable()
export class AuditWriter {
  async append(
    transaction: TransactionClient,
    access: AccessContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        organizationId: access.organizationId,
        actorUserId: access.user.id,
        actorMembershipId: access.membershipId,
        action,
        targetType,
        targetId,
        metadata,
      },
    });
  }
}
