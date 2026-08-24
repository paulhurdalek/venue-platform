import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import type { AccessContext } from '../../security/access.types.js';
import type { BookingCalculationProjectionPort } from '../application/booking-calculation-projection.port.js';

@Injectable()
export class PrismaBookingCalculationProjection implements BookingCalculationProjectionPort {
  constructor(
    @Inject(AuditWriter)
    private readonly audit: AuditWriter,
  ) {}

  async sourceChanged(
    transaction: object,
    access: AccessContext,
    eventId: string,
    bookingId: string,
    reason: string,
  ): Promise<void> {
    const database = transaction as TransactionClient;
    const rows = await database.$queryRaw<
      Array<{ id: string; status: 'DRAFT' | 'REVIEW' | 'APPROVED'; version: number }>
    >(Prisma.sql`
      SELECT "id", "status", "version"
      FROM "event_calculation"
      WHERE "organization_id" = ${access.organizationId}::uuid
        AND "event_id" = ${eventId}::uuid
      FOR UPDATE
    `);
    const calculation = rows[0];
    if (!calculation) return;
    if (calculation.status === 'APPROVED') {
      await database.eventCalculationStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          calculationId: calculation.id,
          previousStatus: 'APPROVED',
          newStatus: 'DRAFT',
          actorUserId: access.user.id,
          actorMembershipId: access.membershipId,
          reason,
          changedSourceType: 'booking',
          changedSourceId: bookingId,
        },
      });
    }
    await database.eventCalculation.update({
      where: { id: calculation.id },
      data: {
        status: calculation.status === 'APPROVED' ? 'DRAFT' : calculation.status,
        ...(calculation.status === 'APPROVED'
          ? {
              approvedAt: null,
              approvedByUserId: null,
              approvedByMembershipId: null,
            }
          : {}),
        version: { increment: 1 },
      },
    });
    await this.audit.append(
      database,
      access,
      'event_calculation.booking_source_changed',
      'event_calculation',
      calculation.id,
      {
        eventId,
        bookingId,
        reason,
        resetFromApproved: calculation.status === 'APPROVED',
        previousVersion: calculation.version,
        newVersion: calculation.version + 1,
      },
    );
  }
}
