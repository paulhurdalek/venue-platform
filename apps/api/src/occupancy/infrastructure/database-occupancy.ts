import { Prisma, type TransactionClient } from '@venue/database';

import type { AuditWriter } from '../../audit/audit-writer.service.js';
import type { AccessContext } from '../../security/access.types.js';
import { localOccupancyTimestamp, type LocalOccupancyInterval } from '../domain/occupancy.rules.js';

export type OccupancyConflictTarget = {
  type: 'EVENT' | 'DATE_OPTION';
  id: string;
  label: string;
  rank?: 'FIRST' | 'SECOND';
};

export class LocationOccupancyConflictError extends Error {
  constructor(readonly conflicts: OccupancyConflictTarget[]) {
    super('Die Location ist im gewählten Zeitraum bereits belegt');
    this.name = 'LocationOccupancyConflictError';
  }
}

export async function lockLocations(
  database: TransactionClient,
  organizationId: string,
  locationIds: string[],
): Promise<void> {
  const keys = [...new Set(locationIds)].sort();
  for (const locationId of keys) {
    await database.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${organizationId}:${locationId}`}, 0)
      )
    `);
  }
}

export async function expireActiveDateOptions(
  database: TransactionClient,
  access: AccessContext,
  auditWriter: AuditWriter,
  locationIds?: string[],
): Promise<string[]> {
  const expired = await database.venueDateOption.findMany({
    where: {
      organizationId: access.organizationId,
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
      status: 'ACTIVE',
      validUntil: { lte: new Date() },
    },
    select: { id: true, version: true },
  });
  if (expired.length === 0) return [];
  const ids = expired.map(({ id }) => id);
  await database.locationOccupancy.deleteMany({ where: { dateOptionId: { in: ids } } });
  await database.venueDateOption.updateMany({
    where: { id: { in: ids }, organizationId: access.organizationId, status: 'ACTIVE' },
    data: { status: 'EXPIRED', version: { increment: 1 } },
  });
  for (const option of expired) {
    await auditWriter.append(
      database,
      access,
      'date_option.expired',
      'venue_date_option',
      option.id,
      {
        previousVersion: option.version,
        newVersion: option.version + 1,
      },
    );
  }
  return ids;
}

export async function replaceEventOccupancy(
  database: TransactionClient,
  organizationId: string,
  eventId: string,
  locationId: string,
  interval: LocalOccupancyInterval | undefined,
  blocking: boolean,
): Promise<void> {
  await database.locationOccupancy.deleteMany({ where: { eventId, organizationId } });
  if (!blocking || !interval) return;
  const conflicts = await findOccupancyConflicts(database, organizationId, locationId, interval);
  if (conflicts.length > 0) throw new LocationOccupancyConflictError(conflicts);
  const occupancyStart = localOccupancyTimestamp(interval.date, interval.startMinutes);
  const occupancyEnd = localOccupancyTimestamp(interval.date, interval.endMinutes);
  try {
    await database.locationOccupancy.createMany({
      data: ['FIRST', 'SECOND'].map((slot) => ({
        organizationId,
        locationId,
        eventId,
        slot: slot as 'FIRST' | 'SECOND',
        occupancyStart,
        occupancyEnd,
      })),
    });
  } catch (error) {
    if (isExclusionConflict(error)) throw new LocationOccupancyConflictError([]);
    throw error;
  }
}

export async function replaceDateOptionOccupancy(
  database: TransactionClient,
  organizationId: string,
  dateOptionId: string,
  locationId: string,
  rank: 'FIRST' | 'SECOND',
  interval: LocalOccupancyInterval,
): Promise<void> {
  await database.locationOccupancy.deleteMany({ where: { dateOptionId, organizationId } });
  const conflicts = await findOccupancyConflicts(
    database,
    organizationId,
    locationId,
    interval,
    rank,
  );
  if (conflicts.length > 0) throw new LocationOccupancyConflictError(conflicts);
  try {
    await database.locationOccupancy.create({
      data: {
        organizationId,
        locationId,
        dateOptionId,
        slot: rank,
        occupancyStart: localOccupancyTimestamp(interval.date, interval.startMinutes),
        occupancyEnd: localOccupancyTimestamp(interval.date, interval.endMinutes),
      },
    });
  } catch (error) {
    if (isExclusionConflict(error)) throw new LocationOccupancyConflictError([]);
    throw error;
  }
}

export async function findOccupancyConflicts(
  database: TransactionClient,
  organizationId: string,
  locationId: string,
  interval: LocalOccupancyInterval,
  slot?: 'FIRST' | 'SECOND',
): Promise<OccupancyConflictTarget[]> {
  const occupancyStart = localOccupancyTimestamp(interval.date, interval.startMinutes);
  const occupancyEnd = localOccupancyTimestamp(interval.date, interval.endMinutes);
  const rows = await database.locationOccupancy.findMany({
    where: {
      organizationId,
      locationId,
      ...(slot ? { slot } : {}),
      occupancyStart: { lt: occupancyEnd },
      occupancyEnd: { gt: occupancyStart },
    },
    include: {
      event: { select: { id: true, name: true } },
      dateOption: { select: { id: true, label: true, rank: true } },
    },
  });
  const targets = new Map<string, OccupancyConflictTarget>();
  for (const row of rows) {
    const target = row.event
      ? { type: 'EVENT' as const, id: row.event.id, label: row.event.name }
      : row.dateOption
        ? {
            type: 'DATE_OPTION' as const,
            id: row.dateOption.id,
            label: row.dateOption.label,
            rank: row.dateOption.rank,
          }
        : undefined;
    if (target) targets.set(`${target.type}:${target.id}`, target);
  }
  return [...targets.values()];
}

export function isExclusionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2004' || String(error.message).includes('location_occupancy_no_overlap'))
  );
}
