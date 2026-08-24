import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseClient, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { eventOccupancyInterval } from '../../occupancy/domain/occupancy.rules.js';
import {
  expireActiveDateOptions,
  lockLocations,
  replaceEventOccupancy,
} from '../../occupancy/infrastructure/database-occupancy.js';
import type { AccessContext } from '../../security/access.types.js';
import type {
  EventFormatSource,
  EventListQuery,
  EventLocationSource,
  EventOrganizationSource,
  EventPage,
  EventRecord,
} from '../application/event.models.js';
import type {
  EventRepository,
  EventTransaction,
  SafeEventAuditMetadata,
} from '../application/event.repository.js';
import { formatLocalTime } from '../domain/event.rules.js';

type Database = DatabaseClient | TransactionClient;
const eventInclude = {
  location: { select: { id: true, name: true } },
  lineupRequirements: {
    where: { status: 'ACTIVE' },
    select: {
      role: true,
      normalizedCustomRoleLabel: true,
      requiredCount: true,
    },
  },
  bookings: {
    where: { status: { in: ['SHORTLISTED', 'REQUESTED', 'OPTION', 'CONFIRMED'] } },
    select: { role: true, normalizedCustomRoleLabel: true, status: true },
  },
} satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

@Injectable()
export class PrismaEventRepository implements EventRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly auditWriter: AuditWriter,
  ) {}

  async list(
    organizationId: string,
    query: EventListQuery,
    locationIds?: string[],
  ): Promise<EventPage> {
    const progressIds =
      query.booking === 'INCOMPLETE' ||
      query.booking === 'MODERATOR_MISSING' ||
      query.booking === 'FULLY_CONFIRMED'
        ? await this.bookingFilterIds(organizationId, query.booking)
        : undefined;
    const where: Prisma.EventWhereInput = {
      organizationId,
      ...(progressIds ? { id: { in: progressIds } } : {}),
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventFormatId ? { sourceEventFormatId: query.eventFormatId } : {}),
      ...(query.eventKind ? { eventKind: query.eventKind } : {}),
      ...(query.booking === 'OPEN_REQUESTS' ? { bookings: { some: { status: 'REQUESTED' } } } : {}),
      ...(query.booking === 'HAS_OPTIONS' ? { bookings: { some: { status: 'OPTION' } } } : {}),
      ...(query.fromDate || query.toDate
        ? {
            eventDate: {
              ...(query.fromDate ? { gte: databaseDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: databaseDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { formatNameSnapshot: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.event.findMany({
        where,
        include: eventInclude,
        orderBy: [
          { eventDate: 'asc' },
          { startMinutes: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.event.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.map(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  find(
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<EventRecord | undefined> {
    return this.findWith(this.prisma.database, organizationId, eventId, locationIds);
  }

  transaction<T>(operation: (transaction: EventTransaction) => Promise<T>): Promise<T> {
    return this.prisma.transaction((database) => operation(this.transactionAdapter(database)));
  }

  private transactionAdapter(database: TransactionClient): EventTransaction {
    return {
      findOrganization: async (organizationId) => {
        const locked = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "organization"
          WHERE "id" = ${organizationId}::uuid
          FOR SHARE
        `);
        if (locked.length === 0) return undefined;
        const organization = await database.organization.findUnique({
          where: { id: organizationId },
          select: { id: true, status: true },
        });
        return (organization as EventOrganizationSource | null) ?? undefined;
      },
      findLocation: async (organizationId, locationId) => {
        const locked = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "location"
          WHERE "id" = ${locationId}::uuid AND "organization_id" = ${organizationId}::uuid
          FOR SHARE
        `);
        if (locked.length === 0) return undefined;
        const location = await database.location.findFirst({
          where: { id: locationId, organizationId },
          select: { id: true, name: true, timezone: true, status: true },
        });
        return (location as EventLocationSource | null) ?? undefined;
      },
      findEventFormat: async (organizationId, eventFormatId) => {
        const locked = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "event_format"
          WHERE "id" = ${eventFormatId}::uuid AND "organization_id" = ${organizationId}::uuid
          FOR SHARE
        `);
        if (locked.length === 0) return undefined;
        const eventFormat = await database.eventFormat.findFirst({
          where: { id: eventFormatId, organizationId },
          select: {
            id: true,
            name: true,
            description: true,
            eventKind: true,
            technicalGetInMinutes: true,
            artistGetInMinutes: true,
            doorsMinutes: true,
            startMinutes: true,
            endMinutes: true,
            recordingDefault: true,
            status: true,
            version: true,
          },
        });
        return (eventFormat as EventFormatSource | null) ?? undefined;
      },
      find: (organizationId, eventId, locationIds) =>
        this.findWith(database, organizationId, eventId, locationIds),
      create: async (access, values) => {
        const organizationId = access.organizationId;
        await lockLocations(database, organizationId, [values.locationId]);
        await expireActiveDateOptions(database, access, this.auditWriter, [values.locationId]);
        const { eventDate, ...data } = values;
        const row = await database.event.create({
          data: { organizationId, ...data, eventDate: databaseDate(eventDate) },
          include: eventInclude,
        });
        if (values.sourceEventFormatId) {
          const requirements = await database.eventFormatLineupRequirement.findMany({
            where: {
              organizationId,
              eventFormatId: values.sourceEventFormatId,
              status: 'ACTIVE',
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          });
          if (requirements.length > 0) {
            await database.eventLineupRequirement.createMany({
              data: requirements.map((requirement) => ({
                organizationId,
                eventId: row.id,
                sourceEventFormatRequirementId: requirement.id,
                sourceEventFormatRequirementVersion: requirement.version,
                role: requirement.role,
                customRoleLabel: requirement.customRoleLabel,
                normalizedCustomRoleLabel: requirement.normalizedCustomRoleLabel,
                requiredCount: requirement.requiredCount,
                defaultFeeMinor: requirement.defaultFeeMinor,
                defaultFeeCurrency: requirement.defaultFeeCurrency,
                sortOrder: requirement.sortOrder,
              })),
            });
          }
        }
        await replaceEventOccupancy(
          database,
          organizationId,
          row.id,
          row.locationId,
          eventOccupancyInterval(eventDate, values),
          true,
        );
        return (await this.findWith(database, organizationId, row.id))!;
      },
      update: async (access, eventId, version, values) => {
        const organizationId = access.organizationId;
        const current = await database.event.findFirst({
          where: { id: eventId, organizationId },
          select: { locationId: true, status: true },
        });
        if (!current) return undefined;
        const locations = [current.locationId, values.locationId];
        await lockLocations(database, organizationId, locations);
        await expireActiveDateOptions(database, access, this.auditWriter, locations);
        const { eventDate, ...data } = values;
        const result = await database.event.updateMany({
          where: { id: eventId, organizationId, version },
          data: { ...data, eventDate: databaseDate(eventDate), version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await replaceEventOccupancy(
          database,
          organizationId,
          eventId,
          values.locationId,
          eventOccupancyInterval(eventDate, values),
          current.status !== 'CANCELLED',
        );
        return this.findWith(database, organizationId, eventId);
      },
      setStatus: async (access, eventId, version, status) => {
        const organizationId = access.organizationId;
        const current = await database.event.findFirst({
          where: { id: eventId, organizationId },
          select: {
            locationId: true,
            eventDate: true,
            technicalGetInMinutes: true,
            artistGetInMinutes: true,
            doorsMinutes: true,
            startMinutes: true,
            endMinutes: true,
          },
        });
        if (!current) return undefined;
        await lockLocations(database, organizationId, [current.locationId]);
        await expireActiveDateOptions(database, access, this.auditWriter, [current.locationId]);
        const now = new Date();
        const result = await database.event.updateMany({
          where: { id: eventId, organizationId, version },
          data: {
            status,
            cancelledAt: status === 'CANCELLED' ? now : null,
            completedAt: status === 'COMPLETED' ? now : null,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) return undefined;
        await replaceEventOccupancy(
          database,
          organizationId,
          eventId,
          current.locationId,
          eventOccupancyInterval(current.eventDate.toISOString().slice(0, 10), current),
          status !== 'CANCELLED',
        );
        return this.findWith(database, organizationId, eventId);
      },
      audit: (access, action, eventId, metadata) =>
        this.appendAudit(database, access, action, eventId, metadata),
    };
  }

  private async appendAudit(
    database: TransactionClient,
    access: AccessContext,
    action: string,
    eventId: string,
    metadata: SafeEventAuditMetadata,
  ): Promise<void> {
    await this.auditWriter.append(
      database,
      access,
      action,
      'event',
      eventId,
      metadata as Prisma.InputJsonObject,
    );
  }

  private async findWith(
    database: Database,
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<EventRecord | undefined> {
    const row = await database.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
      },
      include: eventInclude,
    });
    return row ? this.map(row) : undefined;
  }

  private map(row: EventRow): EventRecord {
    const bookingSummary = summarizeBookings(row.lineupRequirements, row.bookings);
    return {
      id: row.id,
      organizationId: row.organizationId,
      locationId: row.locationId,
      locationName: row.location.name,
      name: row.name,
      eventDate: row.eventDate.toISOString().slice(0, 10),
      status: row.status,
      version: row.version,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      snapshotSource: row.snapshotSource,
      sourceEventFormatId: row.sourceEventFormatId,
      sourceEventFormatVersion: row.sourceEventFormatVersion,
      formatNameSnapshot: row.formatNameSnapshot,
      formatDescriptionSnapshot: row.formatDescriptionSnapshot,
      eventKind: row.eventKind,
      description: row.description,
      technicalGetInTime: formatLocalTime(row.technicalGetInMinutes),
      artistGetInTime: formatLocalTime(row.artistGetInMinutes),
      doorsTime: formatLocalTime(row.doorsMinutes),
      startTime: formatLocalTime(row.startMinutes),
      endTime: formatLocalTime(row.endMinutes),
      endNextDay: row.endMinutes !== null && row.endMinutes >= 1440,
      recordingSetting: row.recordingSetting,
      timezone: row.timezone,
      occupancyComplete:
        eventOccupancyInterval(row.eventDate.toISOString().slice(0, 10), row) !== undefined,
      bookingSummary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async bookingFilterIds(
    organizationId: string,
    filter: 'INCOMPLETE' | 'MODERATOR_MISSING' | 'FULLY_CONFIRMED',
  ): Promise<string[]> {
    const incomplete = Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "event_lineup_requirement" requirement
        WHERE requirement."organization_id" = event."organization_id"
          AND requirement."event_id" = event."id"
          AND requirement."status" = 'ACTIVE'
          ${filter === 'MODERATOR_MISSING' ? Prisma.sql`AND requirement."role" = 'MODERATOR'` : Prisma.empty}
          AND (
            SELECT COUNT(*)
            FROM "booking" booking
            WHERE booking."organization_id" = event."organization_id"
              AND booking."event_id" = event."id"
              AND booking."role" = requirement."role"
              AND booking."normalized_custom_role_label" IS NOT DISTINCT FROM requirement."normalized_custom_role_label"
              AND booking."status" = 'CONFIRMED'
          ) < requirement."required_count"
      )
    `;
    const condition =
      filter === 'FULLY_CONFIRMED'
        ? Prisma.sql`
            EXISTS (
              SELECT 1 FROM "event_lineup_requirement" requirement
              WHERE requirement."organization_id" = event."organization_id"
                AND requirement."event_id" = event."id"
                AND requirement."status" = 'ACTIVE'
            )
            AND NOT (${incomplete})
          `
        : incomplete;
    const rows = await this.prisma.database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT event."id"
      FROM "event" event
      WHERE event."organization_id" = ${organizationId}::uuid
        AND ${condition}
    `);
    return rows.map((row) => row.id);
  }
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function summarizeBookings(
  requirements: Array<{
    role: 'ARTIST' | 'MODERATOR' | 'OTHER';
    normalizedCustomRoleLabel: string | null;
    requiredCount: number;
  }>,
  bookings: Array<{
    role: 'ARTIST' | 'MODERATOR' | 'OTHER';
    normalizedCustomRoleLabel: string | null;
    status: 'SHORTLISTED' | 'REQUESTED' | 'OPTION' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
  }>,
) {
  const confirmedFor = (requirement: (typeof requirements)[number]) =>
    bookings.filter(
      (booking) =>
        booking.status === 'CONFIRMED' &&
        booking.role === requirement.role &&
        booking.normalizedCustomRoleLabel === requirement.normalizedCustomRoleLabel,
    ).length;
  const artist = requirements.find((requirement) => requirement.role === 'ARTIST');
  const moderator = requirements.find((requirement) => requirement.role === 'MODERATOR');
  const incomplete = requirements.some(
    (requirement) => confirmedFor(requirement) < requirement.requiredCount,
  );
  return {
    artistRequiredCount: artist?.requiredCount ?? 0,
    artistConfirmedCount: artist ? confirmedFor(artist) : 0,
    moderatorRequired: Boolean(moderator && moderator.requiredCount > 0),
    moderatorConfirmed: Boolean(moderator && confirmedFor(moderator) >= moderator.requiredCount),
    openRequestCount: bookings.filter((booking) => booking.status === 'REQUESTED').length,
    optionCount: bookings.filter((booking) => booking.status === 'OPTION').length,
    incomplete: requirements.length > 0 && incomplete,
    fullyConfirmed: requirements.length > 0 && !incomplete,
  };
}
