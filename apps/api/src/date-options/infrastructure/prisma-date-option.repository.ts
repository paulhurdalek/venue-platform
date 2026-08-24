import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient, Prisma, TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  EventFormatSource,
  EventLocationSource,
  EventRecord,
} from '../../events/application/event.models.js';
import { formatLocalTime } from '../../events/domain/event.rules.js';
import {
  eventOccupancyInterval,
  type LocalOccupancyInterval,
} from '../../occupancy/domain/occupancy.rules.js';
import {
  expireActiveDateOptions,
  findOccupancyConflicts,
  LocationOccupancyConflictError,
  lockLocations,
  replaceDateOptionOccupancy,
  replaceEventOccupancy,
} from '../../occupancy/infrastructure/database-occupancy.js';
import type { AccessContext } from '../../security/access.types.js';
import { createEventServiceSnapshot } from '../../services/infrastructure/event-service-snapshot.js';
import type { DateOptionRecord, DateOptionValues } from '../application/date-option.models.js';
import type {
  DateOptionRepository,
  DateOptionTransaction,
} from '../application/date-option.repository.js';
import { dateOptionInterval } from '../domain/date-option.rules.js';

type Database = DatabaseClient | TransactionClient;
const optionInclude = {
  location: { select: { name: true } },
  businessPartner: { select: { companyName: true } },
  contact: { select: { firstName: true, lastName: true, label: true } },
} as const;
const eventInclude = { location: { select: { name: true } } } as const;
type OptionRow = Prisma.VenueDateOptionGetPayload<{ include: typeof optionInclude }>;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

@Injectable()
export class PrismaDateOptionRepository implements DateOptionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditWriter) private readonly auditWriter: AuditWriter,
  ) {}

  transaction<T>(operation: (transaction: DateOptionTransaction) => Promise<T>): Promise<T> {
    return this.prisma.transaction((database) => operation(this.adapter(database)));
  }

  private adapter(database: TransactionClient): DateOptionTransaction {
    return {
      prepare: async (access, locationIds) => {
        await lockLocations(database, access.organizationId, locationIds);
        await expireActiveDateOptions(database, access, this.auditWriter, locationIds);
      },
      locationIds: async (organizationId, visibleLocationIds) => {
        const rows = await database.location.findMany({
          where: {
            organizationId,
            ...(visibleLocationIds ? { id: { in: visibleLocationIds } } : {}),
          },
          select: { id: true },
        });
        return rows.map(({ id }) => id);
      },
      findLocation: async (organizationId, locationId) => {
        const row = await database.location.findFirst({
          where: { id: locationId, organizationId },
          select: { id: true, name: true, timezone: true, status: true },
        });
        return (row as EventLocationSource | null) ?? undefined;
      },
      findEventFormat: async (organizationId, eventFormatId) => {
        const row = await database.eventFormat.findFirst({
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
        return (row as EventFormatSource | null) ?? undefined;
      },
      validateReferences: async (organizationId, businessPartnerId, contactId) => {
        if (businessPartnerId) {
          const partner = await database.businessPartner.findFirst({
            where: { id: businessPartnerId, organizationId },
            select: { id: true },
          });
          if (!partner) return false;
        }
        if (contactId) {
          const contact = await database.contact.findFirst({
            where: { id: contactId, organizationId },
            select: { id: true },
          });
          if (!contact) return false;
        }
        if (businessPartnerId && contactId) {
          return (
            (await database.businessPartnerContact.count({
              where: { organizationId, businessPartnerId, contactId },
            })) === 1
          );
        }
        return true;
      },
      find: (organizationId, optionId, locationIds) =>
        this.findWith(database, organizationId, optionId, locationIds),
      list: async (organizationId, query, locationIds) => {
        const where: Prisma.VenueDateOptionWhereInput = {
          organizationId,
          ...(locationIds ? { locationId: { in: locationIds } } : {}),
          ...(query.locationId ? { locationId: query.locationId } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.fromDate || query.toDate
            ? {
                optionDate: {
                  ...(query.fromDate ? { gte: databaseDate(query.fromDate) } : {}),
                  ...(query.toDate ? { lte: databaseDate(query.toDate) } : {}),
                },
              }
            : {}),
        };
        const [rows, total] = await Promise.all([
          database.venueDateOption.findMany({
            where,
            include: optionInclude,
            orderBy: [
              { optionDate: 'asc' },
              { occupancyStartMinutes: 'asc' },
              { rank: 'asc' },
              { id: 'asc' },
            ],
            take: query.limit,
            skip: query.offset,
          }),
          database.venueDateOption.count({ where }),
        ]);
        return {
          items: rows.map((row) => this.mapOption(row)),
          total,
          limit: query.limit,
          offset: query.offset,
        };
      },
      occupancyState: async (organizationId, locationId, interval) => {
        const conflicts = await findOccupancyConflicts(
          database,
          organizationId,
          locationId,
          interval,
        );
        return {
          hasEvent: conflicts.some(({ type }) => type === 'EVENT'),
          hasFirstOption: conflicts.some(
            ({ type, rank }) => type === 'DATE_OPTION' && rank === 'FIRST',
          ),
          hasSecondOption: conflicts.some(
            ({ type, rank }) => type === 'DATE_OPTION' && rank === 'SECOND',
          ),
          conflicts,
        };
      },
      hasIncompleteEvent: async (organizationId, locationId, date) => {
        const rows = await database.event.findMany({
          where: {
            organizationId,
            locationId,
            eventDate: databaseDate(date),
            status: { not: 'CANCELLED' },
          },
          select: {
            eventDate: true,
            technicalGetInMinutes: true,
            artistGetInMinutes: true,
            doorsMinutes: true,
            startMinutes: true,
            endMinutes: true,
          },
        });
        return rows.some((row) => !eventOccupancyInterval(date, row));
      },
      create: async (access, values, rank) => {
        const row = await database.venueDateOption.create({
          data: {
            organizationId: access.organizationId,
            ...databaseOptionValues(values),
            rank,
            createdByMembershipId: access.membershipId,
          },
          include: optionInclude,
        });
        await replaceDateOptionOccupancy(
          database,
          access.organizationId,
          row.id,
          row.locationId,
          rank,
          dateOptionInterval(values),
        );
        return this.mapOption(row);
      },
      update: async (access, optionId, version, values) => {
        const current = await database.venueDateOption.findFirst({
          where: { id: optionId, organizationId: access.organizationId },
          select: { rank: true, status: true },
        });
        if (!current || current.status !== 'ACTIVE') return undefined;
        const changed = await database.venueDateOption.updateMany({
          where: { id: optionId, organizationId: access.organizationId, version, status: 'ACTIVE' },
          data: { ...databaseOptionValues(values), version: { increment: 1 } },
        });
        if (changed.count !== 1) return undefined;
        await replaceDateOptionOccupancy(
          database,
          access.organizationId,
          optionId,
          values.locationId,
          current.rank,
          dateOptionInterval(values),
        );
        return this.findWith(database, access.organizationId, optionId);
      },
      setStatus: async (access, optionId, version, status) => {
        const changed = await database.venueDateOption.updateMany({
          where: { id: optionId, organizationId: access.organizationId, version, status: 'ACTIVE' },
          data: { status, version: { increment: 1 } },
        });
        if (changed.count !== 1) return undefined;
        await database.locationOccupancy.deleteMany({
          where: { organizationId: access.organizationId, dateOptionId: optionId },
        });
        return this.findWith(database, access.organizationId, optionId);
      },
      promote: async (access, optionId, version) => {
        const row = await database.venueDateOption.findFirst({
          where: {
            id: optionId,
            organizationId: access.organizationId,
            version,
            status: 'ACTIVE',
            rank: 'SECOND',
          },
        });
        if (!row) return undefined;
        await replaceDateOptionOccupancy(
          database,
          access.organizationId,
          optionId,
          row.locationId,
          'FIRST',
          dateOptionInterval({
            optionDate: row.optionDate.toISOString().slice(0, 10),
            occupancyStartMinutes: row.occupancyStartMinutes,
            occupancyEndMinutes: row.occupancyEndMinutes,
          }),
        );
        const changed = await database.venueDateOption.updateMany({
          where: {
            id: optionId,
            organizationId: access.organizationId,
            version,
            status: 'ACTIVE',
            rank: 'SECOND',
          },
          data: { rank: 'FIRST', version: { increment: 1 } },
        });
        if (changed.count !== 1) return undefined;
        return this.findWith(database, access.organizationId, optionId);
      },
      convert: (access, option, values) => this.convert(database, access, option, values),
      audit: (access, action, optionId, metadata) =>
        this.auditWriter.append(
          database,
          access,
          action,
          'venue_date_option',
          optionId,
          metadata as Prisma.InputJsonObject,
        ),
    };
  }

  private async convert(
    database: TransactionClient,
    access: AccessContext,
    option: DateOptionRecord,
    values: Parameters<DateOptionTransaction['convert']>[2],
  ): Promise<EventRecord> {
    const interval = dateOptionInterval({
      optionDate: option.optionDate,
      occupancyStartMinutes: timeMinutes(option.occupancyStartTime),
      occupancyEndMinutes:
        timeMinutes(option.occupancyEndTime) + (option.occupancyEndNextDay ? 1440 : 0),
    });
    const existingOptionRows = await database.locationOccupancy.findMany({
      where: {
        organizationId: access.organizationId,
        locationId: option.locationId,
        occupancyStart: { lt: localEnd(interval) },
        occupancyEnd: { gt: localStart(interval) },
        OR: [{ dateOptionId: null }, { dateOptionId: { not: option.id } }],
      },
      select: { dateOptionId: true, eventId: true, slot: true },
    });
    if (option.rank === 'SECOND' && existingOptionRows.some(({ slot }) => slot === 'FIRST')) {
      throw new LocationOccupancyConflictError([]);
    }
    const finalInterval = eventOccupancyInterval(values.eventDate, values);
    const finalRows = finalInterval
      ? await database.locationOccupancy.findMany({
          where: {
            organizationId: access.organizationId,
            locationId: values.locationId,
            occupancyStart: { lt: localEnd(finalInterval) },
            occupancyEnd: { gt: localStart(finalInterval) },
            OR: [{ dateOptionId: null }, { dateOptionId: { not: option.id } }],
          },
          select: { dateOptionId: true, eventId: true, slot: true },
        })
      : [];
    const unresolvable = finalRows.some(
      ({ eventId, slot }) => Boolean(eventId) || option.rank === 'SECOND' || slot === 'FIRST',
    );
    if (unresolvable) throw new LocationOccupancyConflictError([]);
    const unavailableIds =
      option.rank === 'FIRST'
        ? [
            ...new Set(
              finalRows
                .filter(({ slot }) => slot === 'SECOND')
                .map(({ dateOptionId }) => dateOptionId)
                .filter((id): id is string => Boolean(id)),
            ),
          ]
        : [];
    if (unavailableIds.length > 0) {
      await database.locationOccupancy.deleteMany({
        where: { dateOptionId: { in: unavailableIds } },
      });
      await database.venueDateOption.updateMany({
        where: {
          id: { in: unavailableIds },
          organizationId: access.organizationId,
          status: 'ACTIVE',
        },
        data: { status: 'UNAVAILABLE', version: { increment: 1 } },
      });
      for (const id of unavailableIds) {
        await this.auditWriter.append(
          database,
          access,
          'date_option.unavailable',
          'venue_date_option',
          id,
          { convertedOptionId: option.id },
        );
      }
    }
    await database.locationOccupancy.deleteMany({ where: { dateOptionId: option.id } });
    const { eventDate, ...data } = values;
    const event = await database.event.create({
      data: { organizationId: access.organizationId, ...data, eventDate: databaseDate(eventDate) },
      include: eventInclude,
    });
    await createEventServiceSnapshot(
      database,
      access.organizationId,
      event.id,
      values.sourceEventFormatId,
    );
    if (values.sourceEventFormatId) {
      const requirements = await database.eventFormatLineupRequirement.findMany({
        where: {
          organizationId: access.organizationId,
          eventFormatId: values.sourceEventFormatId,
          status: 'ACTIVE',
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (requirements.length > 0) {
        await database.eventLineupRequirement.createMany({
          data: requirements.map((requirement) => ({
            organizationId: access.organizationId,
            eventId: event.id,
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
      access.organizationId,
      event.id,
      event.locationId,
      eventOccupancyInterval(eventDate, values),
      true,
    );
    const converted = await database.venueDateOption.updateMany({
      where: {
        id: option.id,
        organizationId: access.organizationId,
        version: option.version,
        status: 'ACTIVE',
      },
      data: { status: 'CONVERTED', version: { increment: 1 } },
    });
    if (converted.count !== 1) throw new LocationOccupancyConflictError([]);
    await this.auditWriter.append(
      database,
      access,
      'date_option.converted',
      'venue_date_option',
      option.id,
      {
        previousVersion: option.version,
        newVersion: option.version + 1,
        eventId: event.id,
      },
    );
    await this.auditWriter.append(
      database,
      access,
      'event.created_from_date_option',
      'event',
      event.id,
      {
        dateOptionId: option.id,
        sourceEventFormatId: event.sourceEventFormatId,
        sourceEventFormatVersion: event.sourceEventFormatVersion,
      },
    );
    return mapEvent(event);
  }

  private async findWith(
    database: Database,
    organizationId: string,
    optionId: string,
    locationIds?: string[],
  ): Promise<DateOptionRecord | undefined> {
    const row = await database.venueDateOption.findFirst({
      where: {
        id: optionId,
        organizationId,
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
      },
      include: optionInclude,
    });
    return row ? this.mapOption(row) : undefined;
  }

  private mapOption(row: OptionRow): DateOptionRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      locationId: row.locationId,
      locationName: row.location.name,
      optionDate: row.optionDate.toISOString().slice(0, 10),
      occupancyStartTime: formatLocalTime(row.occupancyStartMinutes)!,
      occupancyEndTime: formatLocalTime(row.occupancyEndMinutes)!,
      occupancyEndNextDay: row.occupancyEndMinutes >= 1440,
      rank: row.rank,
      label: row.label,
      businessPartnerId: row.businessPartnerId,
      businessPartnerName: row.businessPartner?.companyName ?? null,
      contactId: row.contactId,
      contactName: row.contact ? contactName(row.contact) : null,
      note: row.note,
      validUntil: row.validUntil.toISOString(),
      status: row.status,
      version: row.version,
      canPromote: false,
      createdByMembershipId: row.createdByMembershipId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function databaseOptionValues(values: DateOptionValues) {
  const { optionDate, ...rest } = values;
  return { ...rest, optionDate: databaseDate(optionDate) };
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function contactName(contact: {
  firstName: string | null;
  lastName: string | null;
  label: string | null;
}): string {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.label || 'Kontakt'
  );
}

function timeMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

function localStart(interval: LocalOccupancyInterval): Date {
  return new Date(Date.parse(`${interval.date}T00:00:00Z`) + interval.startMinutes * 60_000);
}

function localEnd(interval: LocalOccupancyInterval): Date {
  return new Date(Date.parse(`${interval.date}T00:00:00Z`) + interval.endMinutes * 60_000);
}

function mapEvent(row: EventRow): EventRecord {
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
    bookingSummary: {
      artistRequiredCount: 0,
      artistConfirmedCount: 0,
      moderatorRequired: false,
      moderatorConfirmed: false,
      openRequestCount: 0,
      optionCount: 0,
      incomplete: false,
      fullyConfirmed: false,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
