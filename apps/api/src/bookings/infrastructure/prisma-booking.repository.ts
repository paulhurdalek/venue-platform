import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseClient, type TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import {
  BOOKING_CALCULATION_PROJECTION,
  type BookingCalculationProjectionPort,
} from '../application/booking-calculation-projection.port.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import type {
  BookingProgress,
  BookingRecord,
  BookingValues,
  EventProgramItemRecord,
  EventProgramItemValues,
  LineupRequirementRecord,
  LineupRequirementValues,
} from '../application/booking.models.js';
import {
  BookingPersistenceConflictError,
  BookingReferenceError,
  type BookingRepository,
} from '../application/booking.repository.js';
import {
  ACTIVE_BOOKING_STATUSES,
  type BookingStatus,
  type LineupRole,
} from '../domain/booking.rules.js';

type Database = DatabaseClient | TransactionClient;

const bookingInclude = {
  artist: {
    select: {
      stageName: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      contacts: {
        include: {
          contact: true,
          roles: { include: { role: true }, orderBy: { role: { name: 'asc' as const } } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      businessPartners: {
        include: {
          businessPartner: { select: { status: true } },
          roles: {
            include: { role: true },
            orderBy: { role: { name: 'asc' as const } },
          },
          representatives: {
            include: {
              businessPartnerContact: { include: { contact: true } },
              roles: {
                include: { role: true },
                orderBy: { role: { name: 'asc' as const } },
              },
            },
            orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
          },
        },
      },
    },
  },
  businessPartner: { select: { companyName: true, status: true } },
  contact: {
    select: {
      firstName: true,
      lastName: true,
      label: true,
      email: true,
      phone: true,
      mobile: true,
      status: true,
    },
  },
  statusHistory: {
    include: { actorUser: { select: { name: true } } },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.BookingInclude;

const programItemInclude = {
  booking: {
    include: {
      artist: { select: { stageName: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.EventProgramItemInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type ProgramItemRow = Prisma.EventProgramItemGetPayload<{ include: typeof programItemInclude }>;
type FormatRequirementRow = Prisma.EventFormatLineupRequirementGetPayload<Record<string, never>>;
type EventRequirementRow = Prisma.EventLineupRequirementGetPayload<Record<string, never>>;

@Injectable()
export class PrismaBookingRepository implements BookingRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly audit: AuditWriter,
    @Inject(BOOKING_CALCULATION_PROJECTION)
    private readonly calculationProjection: BookingCalculationProjectionPort,
  ) {}

  async event(organizationId: string, eventId: string, locationIds?: string[]) {
    const row = await this.prisma.database.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
      },
      select: { id: true, version: true, locationId: true },
    });
    return row ?? undefined;
  }

  async list(organizationId: string, eventId: string, includeHistorical: boolean) {
    const rows = await this.prisma.database.booking.findMany({
      where: {
        organizationId,
        eventId,
        ...(includeHistorical ? {} : { status: { in: [...ACTIVE_BOOKING_STATUSES] } }),
      },
      include: bookingInclude,
      orderBy: [{ lineupOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapBooking(row));
  }

  async find(organizationId: string, bookingId: string) {
    return this.findWith(this.prisma.database, organizationId, bookingId);
  }

  async progress(organizationId: string, eventId: string): Promise<BookingProgress> {
    const [requirements, bookings] = await Promise.all([
      this.prisma.database.eventLineupRequirement.findMany({
        where: { organizationId, eventId, status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.database.booking.findMany({
        where: { organizationId, eventId, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
        select: {
          role: true,
          customRoleLabel: true,
          normalizedCustomRoleLabel: true,
          status: true,
        },
      }),
    ]);

    const keys = new Map<
      string,
      {
        role: LineupRole;
        customRoleLabel: string | null;
        requiredCount: number;
        sortOrder: number;
      }
    >();
    for (const requirement of requirements) {
      keys.set(roleKey(requirement.role, requirement.normalizedCustomRoleLabel), {
        role: requirement.role,
        customRoleLabel: requirement.customRoleLabel,
        requiredCount: requirement.requiredCount,
        sortOrder: requirement.sortOrder,
      });
    }
    for (const booking of bookings) {
      const key = roleKey(booking.role, booking.normalizedCustomRoleLabel);
      if (!keys.has(key)) {
        keys.set(key, {
          role: booking.role,
          customRoleLabel: booking.customRoleLabel,
          requiredCount: 0,
          sortOrder: Number.MAX_SAFE_INTEGER,
        });
      }
    }

    const roles = [...keys.entries()]
      .map(([key, requirement]) => {
        const matching = bookings.filter(
          (booking) => roleKey(booking.role, booking.normalizedCustomRoleLabel) === key,
        );
        const shortlistedCount = matching.filter(
          (booking) => booking.status === 'SHORTLISTED',
        ).length;
        const requestedCount = matching.filter((booking) => booking.status === 'REQUESTED').length;
        const optionCount = matching.filter((booking) => booking.status === 'OPTION').length;
        const confirmedCount = matching.filter((booking) => booking.status === 'CONFIRMED').length;
        const activeCount = shortlistedCount + requestedCount + optionCount + confirmedCount;
        return {
          ...requirement,
          key,
          label: roleLabel(requirement.role, requirement.customRoleLabel),
          shortlistedCount,
          requestedCount,
          optionCount,
          confirmedCount,
          missingCount: Math.max(requirement.requiredCount - activeCount, 0),
        };
      })
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label),
      )
      .map(({ key: _key, sortOrder: _sortOrder, ...role }) => role);
    const moderator = roles.find((role) => role.role === 'MODERATOR');
    return {
      eventId,
      roles,
      totalOpenRequests: roles.reduce((sum, role) => sum + role.requestedCount, 0),
      totalOptions: roles.reduce((sum, role) => sum + role.optionCount, 0),
      complete:
        requirements.length > 0 &&
        roles
          .filter((role) => role.requiredCount > 0)
          .every((role) => role.confirmedCount >= role.requiredCount),
      moderatorRequired: Boolean(moderator && moderator.requiredCount > 0),
      moderatorConfirmed: Boolean(
        moderator &&
        moderator.requiredCount > 0 &&
        moderator.confirmedCount >= moderator.requiredCount,
      ),
    };
  }

  create(
    access: AccessContext,
    eventId: string,
    status: BookingStatus,
    values: BookingValues,
    confirmDuplicateArtist: boolean,
  ): Promise<BookingRecord> {
    return this.prisma.transaction(async (database) => {
      await this.lockEvent(database, access.organizationId, eventId);
      await this.validateReferences(database, access.organizationId, values, true);
      const existing = ACTIVE_BOOKING_STATUSES.includes(status)
        ? await database.booking.findFirst({
            where: {
              organizationId: access.organizationId,
              eventId,
              artistId: values.artistId,
              status: { in: [...ACTIVE_BOOKING_STATUSES] },
            },
            orderBy: [{ lineupOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, role: true, customRoleLabel: true, status: true },
          })
        : undefined;
      if (existing && !confirmDuplicateArtist) {
        throw new BookingPersistenceConflictError(
          'BOOKING_ACTIVE_ARTIST_CONFLICT',
          'Dieser Artist ist für diese Veranstaltung bereits gebucht.',
          {
            existingBooking: {
              id: existing.id,
              role: existing.role,
              customRoleLabel: existing.customRoleLabel,
              status: existing.status,
            },
          },
        );
      }
      const last = await database.booking.aggregate({
        where: {
          organizationId: access.organizationId,
          eventId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
        },
        _max: { lineupOrder: true },
      });
      try {
        const row = await database.booking.create({
          data: {
            organizationId: access.organizationId,
            eventId,
            status,
            lineupOrder: (last._max.lineupOrder ?? 0) + 1,
            ...values,
          },
          include: bookingInclude,
        });
        const lastProgramItem = await database.eventProgramItem.aggregate({
          where: { organizationId: access.organizationId, eventId },
          _max: { sortOrder: true },
        });
        const programItem = await database.eventProgramItem.create({
          data: {
            organizationId: access.organizationId,
            eventId,
            bookingId: row.id,
            kind: 'PERFORMANCE',
            sortOrder: (lastProgramItem._max.sortOrder ?? 0) + 1,
          },
        });
        await this.audit.append(database, access, 'booking.created', 'booking', row.id, {
          eventId,
          artistId: values.artistId,
          role: values.role,
          status,
          programItemId: programItem.id,
          newVersion: row.version,
        });
        if (
          values.agreedFeeMinor !== null ||
          values.travelCostMinor !== null ||
          values.hotelBuyoutMinor !== null
        ) {
          await this.calculationProjection.sourceChanged(
            database,
            access,
            eventId,
            row.id,
            'Bookingkosten angelegt',
          );
        }
        return this.mapBooking(row);
      } catch (error) {
        return this.rethrowUnique(error);
      }
    });
  }

  update(
    access: AccessContext,
    bookingId: string,
    version: number,
    values: BookingValues,
    changedFields: string[],
  ): Promise<BookingRecord | undefined> {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockBooking(database, access.organizationId, bookingId);
      if (!current || current.version !== version) return undefined;
      await this.validateReferences(database, access.organizationId, values, false);
      try {
        const result = await database.booking.updateMany({
          where: { id: bookingId, organizationId: access.organizationId, version },
          data: { ...values, version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await this.audit.append(database, access, 'booking.updated', 'booking', bookingId, {
          changedFields,
          previousVersion: version,
          newVersion: version + 1,
        });
        if (
          changedFields.some((field) =>
            [
              'agreedFeeMinor',
              'agreedFeeCurrency',
              'travelCostMinor',
              'travelCostCurrency',
              'hotelArrangement',
              'hotelBuyoutMinor',
              'hotelBuyoutCurrency',
            ].includes(field),
          )
        ) {
          await this.calculationProjection.sourceChanged(
            database,
            access,
            current.eventId,
            bookingId,
            'Booking-Finanzdaten geändert',
          );
        }
        return this.findWith(database, access.organizationId, bookingId);
      } catch (error) {
        return this.rethrowUnique(error);
      }
    });
  }

  setStatus(
    access: AccessContext,
    bookingId: string,
    version: number,
    previousStatus: BookingStatus,
    newStatus: BookingStatus,
    note: string | null,
  ): Promise<BookingRecord | undefined> {
    return this.prisma.transaction(async (database) => {
      const current = await this.lockBooking(database, access.organizationId, bookingId);
      if (!current || current.version !== version || current.status !== previousStatus) {
        return undefined;
      }
      await this.lockEvent(database, access.organizationId, current.eventId);
      let lineupOrder = current.lineupOrder;
      if (
        (previousStatus === 'DECLINED' || previousStatus === 'CANCELLED') &&
        ACTIVE_BOOKING_STATUSES.includes(newStatus)
      ) {
        const last = await database.booking.aggregate({
          where: {
            organizationId: access.organizationId,
            eventId: current.eventId,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
          },
          _max: { lineupOrder: true },
        });
        lineupOrder = (last._max.lineupOrder ?? 0) + 1;
      }
      try {
        const result = await database.booking.updateMany({
          where: {
            id: bookingId,
            organizationId: access.organizationId,
            version,
            status: previousStatus,
          },
          data: { status: newStatus, lineupOrder, version: { increment: 1 } },
        });
        if (result.count !== 1) return undefined;
        await database.bookingStatusHistory.create({
          data: {
            organizationId: access.organizationId,
            bookingId,
            previousStatus,
            newStatus,
            actorUserId: access.user.id,
            actorMembershipId: access.membershipId,
            note,
          },
        });
        await this.audit.append(database, access, 'booking.status_changed', 'booking', bookingId, {
          eventId: current.eventId,
          previousStatus,
          newStatus,
          notePresent: Boolean(note),
          previousVersion: version,
          newVersion: version + 1,
        });
        if (
          current.agreedFeeMinor !== null ||
          current.travelCostMinor !== null ||
          current.hotelBuyoutMinor !== null
        ) {
          await this.calculationProjection.sourceChanged(
            database,
            access,
            current.eventId,
            bookingId,
            'Bookingstatus geändert',
          );
        }
        return this.findWith(database, access.organizationId, bookingId);
      } catch (error) {
        return this.rethrowUnique(error);
      }
    });
  }

  reorder(
    access: AccessContext,
    eventId: string,
    items: Array<{ bookingId: string; version: number }>,
  ): Promise<BookingRecord[]> {
    return this.prisma.transaction(async (database) => {
      await this.lockEvent(database, access.organizationId, eventId);
      const locked = await database.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
        SELECT "id", "version" FROM "booking"
        WHERE "organization_id" = ${access.organizationId}::uuid
          AND "event_id" = ${eventId}::uuid
          AND "status" NOT IN ('DECLINED', 'CANCELLED')
        ORDER BY "lineup_order", "id"
        FOR UPDATE
      `);
      if (
        locked.length !== items.length ||
        new Set(items.map((item) => item.bookingId)).size !== items.length ||
        locked.some((booking) => !items.some((item) => item.bookingId === booking.id))
      ) {
        throw new BookingReferenceError(
          'LINEUP_ORDER_SET_INVALID',
          'Die Reihenfolge muss jedes aktive Booking genau einmal enthalten',
        );
      }
      if (
        locked.some(
          (booking) =>
            items.find((item) => item.bookingId === booking.id)?.version !== booking.version,
        )
      ) {
        return [];
      }
      const temporaryBase =
        (
          await database.booking.aggregate({
            where: { organizationId: access.organizationId, eventId },
            _max: { lineupOrder: true },
          })
        )._max.lineupOrder ?? 0;
      for (const [index, item] of items.entries()) {
        await database.booking.updateMany({
          where: { id: item.bookingId, organizationId: access.organizationId },
          data: { lineupOrder: temporaryBase + index + 1 },
        });
      }
      for (const [index, item] of items.entries()) {
        await database.booking.updateMany({
          where: {
            id: item.bookingId,
            organizationId: access.organizationId,
            version: item.version,
          },
          data: { lineupOrder: index + 1, version: { increment: 1 } },
        });
      }
      await this.audit.append(database, access, 'lineup.reordered', 'event', eventId, {
        bookingIds: items.map((item) => item.bookingId),
        bookingCount: items.length,
      });
      const rows = await database.booking.findMany({
        where: {
          organizationId: access.organizationId,
          eventId,
          status: { in: [...ACTIVE_BOOKING_STATUSES] },
        },
        include: bookingInclude,
        orderBy: [{ lineupOrder: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.mapBooking(row));
    });
  }

  async listProgramItems(organizationId: string, eventId: string) {
    const rows = await this.prisma.database.eventProgramItem.findMany({
      where: {
        organizationId,
        eventId,
        OR: [{ kind: 'BREAK' }, { booking: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } }],
      },
      include: programItemInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapProgramItem(row));
  }

  async findProgramItem(organizationId: string, itemId: string) {
    return this.findProgramItemWith(this.prisma.database, organizationId, itemId);
  }

  createProgramItem(
    access: AccessContext,
    eventId: string,
    values: EventProgramItemValues,
  ): Promise<EventProgramItemRecord> {
    return this.prisma.transaction(async (database) => {
      await this.lockEvent(database, access.organizationId, eventId);
      if (values.bookingId) {
        const booking = await database.booking.findFirst({
          where: {
            id: values.bookingId,
            organizationId: access.organizationId,
            eventId,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
          },
          select: { id: true },
        });
        if (!booking) {
          throw new BookingReferenceError(
            'PROGRAM_BOOKING_NOT_AVAILABLE',
            'Das Booking ist für diese aktive Auftrittsreihenfolge nicht verfügbar',
          );
        }
      }
      const last = await database.eventProgramItem.aggregate({
        where: { organizationId: access.organizationId, eventId },
        _max: { sortOrder: true },
      });
      const row = await database.eventProgramItem.create({
        data: {
          organizationId: access.organizationId,
          eventId,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          ...values,
        },
        include: programItemInclude,
      });
      await this.audit.append(database, access, 'event_program_item.created', 'event', eventId, {
        programItemId: row.id,
        bookingId: row.bookingId,
        kind: row.kind,
        newVersion: row.version,
      });
      return this.mapProgramItem(row);
    });
  }

  updateProgramItem(
    access: AccessContext,
    itemId: string,
    version: number,
    values: Pick<EventProgramItemValues, 'label' | 'durationMinutes'>,
  ): Promise<EventProgramItemRecord | undefined> {
    return this.prisma.transaction(async (database) => {
      const reference = await database.eventProgramItem.findFirst({
        where: { id: itemId, organizationId: access.organizationId },
        select: { eventId: true },
      });
      if (!reference) return undefined;
      await this.lockEvent(database, access.organizationId, reference.eventId);
      const current = await this.lockProgramItem(database, access.organizationId, itemId);
      if (!current || current.version !== version) return undefined;
      const updated = await database.eventProgramItem.updateMany({
        where: { id: itemId, organizationId: access.organizationId, version },
        data: { ...values, version: { increment: 1 } },
      });
      if (updated.count !== 1) return undefined;
      await this.audit.append(
        database,
        access,
        'event_program_item.updated',
        'event',
        current.eventId,
        { programItemId: itemId, previousVersion: version, newVersion: version + 1 },
      );
      return this.findProgramItemWith(database, access.organizationId, itemId);
    });
  }

  deleteProgramItem(access: AccessContext, itemId: string, version: number): Promise<boolean> {
    return this.prisma.transaction(async (database) => {
      const reference = await database.eventProgramItem.findFirst({
        where: { id: itemId, organizationId: access.organizationId },
        select: { eventId: true },
      });
      if (!reference) return false;
      await this.lockEvent(database, access.organizationId, reference.eventId);
      const current = await this.lockProgramItem(database, access.organizationId, itemId);
      if (!current || current.version !== version) return false;
      const deleted = await database.eventProgramItem.deleteMany({
        where: { id: itemId, organizationId: access.organizationId, version },
      });
      if (deleted.count !== 1) return false;
      await this.audit.append(
        database,
        access,
        'event_program_item.deleted',
        'event',
        current.eventId,
        { programItemId: itemId, bookingId: current.bookingId, previousVersion: version },
      );
      return true;
    });
  }

  reorderProgramItems(
    access: AccessContext,
    eventId: string,
    items: Array<{ itemId: string; version: number }>,
  ): Promise<EventProgramItemRecord[]> {
    return this.prisma.transaction(async (database) => {
      await this.lockEvent(database, access.organizationId, eventId);
      const current = await database.eventProgramItem.findMany({
        where: {
          organizationId: access.organizationId,
          eventId,
          OR: [{ kind: 'BREAK' }, { booking: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } }],
        },
        select: { id: true, version: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (
        current.length !== items.length ||
        new Set(items.map((item) => item.itemId)).size !== items.length ||
        current.some((item) => !items.some((candidate) => candidate.itemId === item.id))
      ) {
        throw new BookingReferenceError(
          'PROGRAM_ORDER_SET_INVALID',
          'Die Reihenfolge muss jeden aktiven Programmpunkt genau einmal enthalten',
        );
      }
      if (
        current.some(
          (item) =>
            items.find((candidate) => candidate.itemId === item.id)?.version !== item.version,
        )
      ) {
        return [];
      }
      for (const [index, item] of items.entries()) {
        await database.eventProgramItem.updateMany({
          where: { id: item.itemId, organizationId: access.organizationId, version: item.version },
          data: { sortOrder: index + 1, version: { increment: 1 } },
        });
      }
      await this.audit.append(database, access, 'event_program.reordered', 'event', eventId, {
        programItemIds: items.map((item) => item.itemId),
        itemCount: items.length,
      });
      const rows = await database.eventProgramItem.findMany({
        where: {
          organizationId: access.organizationId,
          eventId,
          OR: [{ kind: 'BREAK' }, { booking: { status: { in: [...ACTIVE_BOOKING_STATUSES] } } }],
        },
        include: programItemInclude,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => this.mapProgramItem(row));
    });
  }

  async formatRequirements(organizationId: string, eventFormatId: string) {
    const parent = await this.prisma.database.eventFormat.findFirst({
      where: { id: eventFormatId, organizationId },
      select: { version: true },
    });
    if (!parent) return undefined;
    const rows = await this.prisma.database.eventFormatLineupRequirement.findMany({
      where: { organizationId, eventFormatId, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return { version: parent.version, items: rows.map((row) => this.mapFormatRequirement(row)) };
  }

  async eventRequirements(organizationId: string, eventId: string) {
    const parent = await this.prisma.database.event.findFirst({
      where: { id: eventId, organizationId },
      select: { version: true },
    });
    if (!parent) return undefined;
    const rows = await this.prisma.database.eventLineupRequirement.findMany({
      where: { organizationId, eventId, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return { version: parent.version, items: rows.map((row) => this.mapEventRequirement(row)) };
  }

  replaceFormatRequirements(
    access: AccessContext,
    eventFormatId: string,
    version: number,
    values: LineupRequirementValues[],
  ) {
    return this.prisma.transaction(async (database) => {
      const parent = await this.lockEventFormat(database, access.organizationId, eventFormatId);
      if (!parent || parent.version !== version) return undefined;
      const rows = await database.eventFormatLineupRequirement.findMany({
        where: { organizationId: access.organizationId, eventFormatId, status: 'ACTIVE' },
      });
      if (!this.requirementVersionsMatch(rows, values)) return undefined;
      const now = new Date();
      await database.eventFormatLineupRequirement.updateMany({
        where: { organizationId: access.organizationId, eventFormatId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: now },
      });
      const retainedIds = new Set(values.flatMap((value) => (value.id ? [value.id] : [])));
      const missingIds = rows.filter((row) => !retainedIds.has(row.id)).map((row) => row.id);
      await database.eventFormatLineupRequirement.updateMany({
        where: {
          organizationId: access.organizationId,
          eventFormatId,
          id: { in: missingIds },
          status: 'ARCHIVED',
        },
        data: { version: { increment: 1 } },
      });
      try {
        for (const value of values) {
          if (value.id) {
            await database.eventFormatLineupRequirement.update({
              where: { id: value.id },
              data: {
                ...withoutIdentity(value),
                status: 'ACTIVE',
                archivedAt: null,
                version: { increment: 1 },
              },
            });
          } else {
            await database.eventFormatLineupRequirement.create({
              data: {
                organizationId: access.organizationId,
                eventFormatId,
                ...withoutIdentity(value),
              },
            });
          }
        }
      } catch (error) {
        return this.rethrowUnique(error, true);
      }
      await database.eventFormat.update({
        where: { id: eventFormatId },
        data: { version: { increment: 1 } },
      });
      await this.audit.append(
        database,
        access,
        'event_format.lineup_requirements_replaced',
        'event_format',
        eventFormatId,
        { previousVersion: version, newVersion: version + 1, requirementCount: values.length },
      );
      const current = await database.eventFormatLineupRequirement.findMany({
        where: { organizationId: access.organizationId, eventFormatId, status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      return { version: version + 1, items: current.map((row) => this.mapFormatRequirement(row)) };
    });
  }

  replaceEventRequirements(
    access: AccessContext,
    eventId: string,
    version: number,
    values: LineupRequirementValues[],
  ) {
    return this.prisma.transaction(async (database) => {
      const parent = await this.lockEvent(database, access.organizationId, eventId);
      if (!parent || parent.version !== version) return undefined;
      const rows = await database.eventLineupRequirement.findMany({
        where: { organizationId: access.organizationId, eventId, status: 'ACTIVE' },
      });
      if (!this.requirementVersionsMatch(rows, values)) return undefined;
      const now = new Date();
      await database.eventLineupRequirement.updateMany({
        where: { organizationId: access.organizationId, eventId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED', archivedAt: now },
      });
      const retainedIds = new Set(values.flatMap((value) => (value.id ? [value.id] : [])));
      const missingIds = rows.filter((row) => !retainedIds.has(row.id)).map((row) => row.id);
      await database.eventLineupRequirement.updateMany({
        where: {
          organizationId: access.organizationId,
          eventId,
          id: { in: missingIds },
          status: 'ARCHIVED',
        },
        data: { version: { increment: 1 } },
      });
      try {
        for (const value of values) {
          if (value.id) {
            await database.eventLineupRequirement.update({
              where: { id: value.id },
              data: {
                ...withoutIdentity(value),
                status: 'ACTIVE',
                archivedAt: null,
                version: { increment: 1 },
              },
            });
          } else {
            await database.eventLineupRequirement.create({
              data: {
                organizationId: access.organizationId,
                eventId,
                ...withoutIdentity(value),
              },
            });
          }
        }
      } catch (error) {
        return this.rethrowUnique(error, true);
      }
      await database.event.update({
        where: { id: eventId },
        data: { version: { increment: 1 } },
      });
      await this.audit.append(
        database,
        access,
        'event.lineup_requirements_replaced',
        'event',
        eventId,
        { previousVersion: version, newVersion: version + 1, requirementCount: values.length },
      );
      const current = await database.eventLineupRequirement.findMany({
        where: { organizationId: access.organizationId, eventId, status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      return { version: version + 1, items: current.map((row) => this.mapEventRequirement(row)) };
    });
  }

  private async validateReferences(
    database: TransactionClient,
    organizationId: string,
    values: BookingValues,
    requireActiveArtist: boolean,
  ): Promise<void> {
    const artist = await database.artist.findFirst({
      where: { id: values.artistId, organizationId },
      select: { id: true, status: true },
    });
    if (!artist || (requireActiveArtist && artist.status !== 'ACTIVE')) {
      throw new BookingReferenceError('ARTIST_NOT_AVAILABLE', 'Artist nicht verfügbar');
    }
    if (values.businessPartnerId) {
      const partnerLink = await database.artistBusinessPartner.findFirst({
        where: {
          organizationId,
          artistId: values.artistId,
          businessPartnerId: values.businessPartnerId,
          ...(requireActiveArtist ? { businessPartner: { status: 'ACTIVE' } } : {}),
        },
        select: { id: true },
      });
      if (!partnerLink) {
        throw new BookingReferenceError(
          'BOOKING_PARTNER_NOT_AVAILABLE',
          'Die gewählte Vertretung ist für diesen Artist nicht verfügbar',
        );
      }
    }
    if (values.contactId) {
      const directContact = !values.businessPartnerId
        ? await database.artistContact.findFirst({
            where: {
              organizationId,
              artistId: values.artistId,
              contactId: values.contactId,
              ...(requireActiveArtist ? { contact: { status: 'ACTIVE' } } : {}),
            },
            select: { id: true },
          })
        : undefined;
      const representative = values.businessPartnerId
        ? await database.artistBusinessPartnerContact.findFirst({
            where: {
              organizationId,
              businessPartnerId: values.businessPartnerId,
              artistBusinessPartner: { artistId: values.artistId },
              businessPartnerContact: {
                contactId: values.contactId,
                ...(requireActiveArtist ? { contact: { status: 'ACTIVE' } } : {}),
              },
            },
            select: { id: true },
          })
        : undefined;
      if (!directContact && !representative) {
        throw new BookingReferenceError(
          'BOOKING_CONTACT_NOT_AVAILABLE',
          'Der gewählte Ansprechpartner ist für diesen Artist nicht verfügbar',
        );
      }
    }
  }

  private requirementVersionsMatch(
    rows: Array<{ id: string; version: number }>,
    values: LineupRequirementValues[],
  ): boolean {
    const suppliedIds = values.flatMap((value) => (value.id ? [value.id] : []));
    if (new Set(suppliedIds).size !== suppliedIds.length) {
      throw new BookingReferenceError(
        'LINEUP_REQUIREMENT_SET_INVALID',
        'Eine Line-up-Vorgabe darf nur einmal enthalten sein',
      );
    }
    for (const value of values) {
      if (!value.id) continue;
      const row = rows.find((candidate) => candidate.id === value.id);
      if (!row) {
        throw new BookingReferenceError(
          'LINEUP_REQUIREMENT_SET_INVALID',
          'Die Line-up-Vorgabe gehört nicht zu dieser Ressource',
        );
      }
      if (row.version !== value.version) return false;
    }
    return true;
  }

  private async lockEvent(database: TransactionClient, organizationId: string, eventId: string) {
    const rows = await database.$queryRaw<
      Array<{ id: string; version: number; locationId: string }>
    >(
      Prisma.sql`
        SELECT "id", "version", "location_id" AS "locationId" FROM "event"
        WHERE "id" = ${eventId}::uuid AND "organization_id" = ${organizationId}::uuid
        FOR UPDATE
      `,
    );
    return rows[0];
  }

  private async lockEventFormat(
    database: TransactionClient,
    organizationId: string,
    eventFormatId: string,
  ) {
    const rows = await database.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT "id", "version" FROM "event_format"
      WHERE "id" = ${eventFormatId}::uuid AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `);
    return rows[0];
  }

  private async lockBooking(
    database: TransactionClient,
    organizationId: string,
    bookingId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{
        id: string;
        eventId: string;
        version: number;
        status: BookingStatus;
        lineupOrder: number;
        agreedFeeMinor: bigint | null;
        travelCostMinor: bigint | null;
        hotelBuyoutMinor: bigint | null;
      }>
    >(Prisma.sql`
      SELECT "id", "event_id" AS "eventId", "version", "status", "lineup_order" AS "lineupOrder",
        "agreed_fee_minor" AS "agreedFeeMinor",
        "travel_cost_minor" AS "travelCostMinor",
        "hotel_buyout_minor" AS "hotelBuyoutMinor"
      FROM "booking"
      WHERE "id" = ${bookingId}::uuid AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `);
    return rows[0];
  }

  private async lockProgramItem(
    database: TransactionClient,
    organizationId: string,
    itemId: string,
  ) {
    const rows = await database.$queryRaw<
      Array<{ id: string; eventId: string; bookingId: string | null; version: number }>
    >(Prisma.sql`
      SELECT "id", "event_id" AS "eventId", "booking_id" AS "bookingId", "version"
      FROM "event_program_item"
      WHERE "id" = ${itemId}::uuid AND "organization_id" = ${organizationId}::uuid
      FOR UPDATE
    `);
    return rows[0];
  }

  private async findWith(database: Database, organizationId: string, bookingId: string) {
    const row = await database.booking.findFirst({
      where: { id: bookingId, organizationId },
      include: bookingInclude,
    });
    return row ? this.mapBooking(row) : undefined;
  }

  private async findProgramItemWith(database: Database, organizationId: string, itemId: string) {
    const row = await database.eventProgramItem.findFirst({
      where: { id: itemId, organizationId },
      include: programItemInclude,
    });
    return row ? this.mapProgramItem(row) : undefined;
  }

  private mapBooking(row: BookingRow): BookingRecord {
    const partnerAssociation = row.businessPartnerId
      ? row.artist.businessPartners.find(
          (association) => association.businessPartnerId === row.businessPartnerId,
        )
      : undefined;
    const directContactAssociation = !row.businessPartnerId
      ? row.artist.contacts.find((association) => association.contactId === row.contactId)
      : undefined;
    const selectedRepresentative = partnerAssociation?.representatives.find(
      (representative) => representative.businessPartnerContact.contactId === row.contactId,
    );
    const additionalContacts = partnerAssociation
      ? partnerAssociation.representatives
          .filter(
            (representative) => representative.businessPartnerContact.contactId !== row.contactId,
          )
          .map((representative) => {
            const contact = representative.businessPartnerContact.contact;
            return {
              id: contact.id,
              name: contactName(contact),
              functionLabel: contact.label,
              status: contact.status,
              email: contact.email,
              phone: contact.phone,
              mobile: contact.mobile,
              roleNames: representative.roles.map(({ role }) => role.name),
              isPrimary: representative.isPrimary,
            };
          })
      : row.artist.contacts
          .filter((association) => association.contactId !== row.contactId)
          .map((association) => ({
            id: association.contact.id,
            name: contactName(association.contact),
            functionLabel: association.contact.label,
            status: association.contact.status,
            email: association.contact.email,
            phone: association.contact.phone,
            mobile: association.contact.mobile,
            roleNames: association.roles.map(({ role }) => role.name),
            isPrimary: false,
          }));
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      artistId: row.artistId,
      artistName: artistName(row.artist),
      artistStatus: row.artist.status,
      artistEmail: row.artist.email,
      artistPhone: row.artist.phone,
      hasActiveRepresentation: row.artist.businessPartners.some(
        (association) =>
          association.businessPartner.status === 'ACTIVE' &&
          (association.roles.some(({ role }) =>
            ['booking', 'management', 'agency'].includes(role.key),
          ) ||
            association.representatives.some(
              (representative) =>
                representative.businessPartnerContact.contact.status === 'ACTIVE' &&
                representative.roles.some(({ role }) =>
                  ['booking', 'management', 'agency'].includes(role.key),
                ),
            )),
      ),
      role: row.role,
      customRoleLabel: row.customRoleLabel,
      status: row.status,
      lineupOrder: row.lineupOrder,
      performanceStartMinutes: row.performanceStartMinutes,
      performanceDurationMinutes: row.performanceDurationMinutes,
      internalNote: row.internalNote,
      businessPartnerId: row.businessPartnerId,
      businessPartnerName: row.businessPartner?.companyName ?? null,
      businessPartnerStatus: row.businessPartner?.status ?? null,
      businessPartnerRoleNames: partnerAssociation?.roles.map(({ role }) => role.name) ?? [],
      contactId: row.contactId,
      contactName: row.contact ? contactName(row.contact) : null,
      contactFunctionLabel: row.contact?.label ?? null,
      contactStatus: row.contact?.status ?? null,
      contactEmail: row.contact?.email ?? null,
      contactPhone: row.contact?.phone ?? null,
      contactMobile: row.contact?.mobile ?? null,
      contactRoleNames:
        selectedRepresentative?.roles.map(({ role }) => role.name) ??
        directContactAssociation?.roles.map(({ role }) => role.name) ??
        [],
      contactIsPrimary: selectedRepresentative?.isPrimary ?? false,
      additionalContacts,
      agreedFeeMinor: row.agreedFeeMinor?.toString() ?? null,
      agreedFeeCurrency: row.agreedFeeCurrency,
      travelArrangement: row.travelArrangement,
      travelCostMinor: row.travelCostMinor?.toString() ?? null,
      travelCostCurrency: row.travelCostCurrency,
      hotelRequired: row.hotelRequired,
      hotelArrangement: row.hotelArrangement,
      hotelBuyoutMinor: row.hotelBuyoutMinor?.toString() ?? null,
      hotelBuyoutCurrency: row.hotelBuyoutCurrency,
      hotelNote: row.hotelNote,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      statusHistory: row.statusHistory.map((history) => ({
        id: history.id,
        previousStatus: history.previousStatus,
        newStatus: history.newStatus,
        changedAt: history.changedAt.toISOString(),
        actorUserId: history.actorUserId,
        actorName: history.actorUser.name,
        note: history.note,
      })),
    };
  }

  private mapProgramItem(row: ProgramItemRow): EventProgramItemRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      eventId: row.eventId,
      bookingId: row.bookingId,
      kind: row.kind,
      sortOrder: row.sortOrder,
      label: row.label,
      durationMinutes: row.durationMinutes,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      artistName: row.booking ? artistName(row.booking.artist) : null,
      bookingRole: row.booking?.role ?? null,
      bookingCustomRoleLabel: row.booking?.customRoleLabel ?? null,
      bookingStatus: row.booking?.status ?? null,
    };
  }

  private mapFormatRequirement(row: FormatRequirementRow): LineupRequirementRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      role: row.role,
      customRoleLabel: row.customRoleLabel,
      requiredCount: row.requiredCount,
      defaultFeeMinor: row.defaultFeeMinor?.toString() ?? null,
      defaultFeeCurrency: row.defaultFeeCurrency,
      sortOrder: row.sortOrder,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapEventRequirement(row: EventRequirementRow): LineupRequirementRecord {
    return {
      ...this.mapFormatRequirement(row as unknown as FormatRequirementRow),
      sourceEventFormatRequirementId: row.sourceEventFormatRequirementId,
      sourceEventFormatRequirementVersion: row.sourceEventFormatRequirementVersion,
    };
  }

  private rethrowUnique(error: unknown, requirement = false): never {
    if (isPrismaError(error, 'P2002')) {
      throw new BookingPersistenceConflictError(
        requirement ? 'LINEUP_REQUIREMENT_ROLE_CONFLICT' : 'BOOKING_PERSISTENCE_CONFLICT',
        requirement
          ? 'Diese aktive Line-up-Rolle ist bereits vorhanden'
          : 'Das Booking konnte wegen eines konkurrierenden Schreibzugriffs nicht gespeichert werden',
      );
    }
    throw error;
  }
}

function withoutIdentity(value: LineupRequirementValues) {
  return {
    role: value.role,
    customRoleLabel: value.customRoleLabel,
    normalizedCustomRoleLabel: value.normalizedCustomRoleLabel,
    requiredCount: value.requiredCount,
    defaultFeeMinor: value.defaultFeeMinor,
    defaultFeeCurrency: value.defaultFeeCurrency,
    sortOrder: value.sortOrder,
  };
}

function roleKey(role: LineupRole, normalizedCustomRoleLabel: string | null): string {
  return `${role}:${normalizedCustomRoleLabel ?? ''}`;
}

function roleLabel(role: LineupRole, customRoleLabel: string | null): string {
  if (role === 'ARTIST') return 'Artists';
  if (role === 'MODERATOR') return 'Moderator';
  return customRoleLabel ?? 'Sonstige Rolle';
}

function artistName(artist: {
  stageName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    artist.stageName ??
    [artist.firstName, artist.lastName].filter(Boolean).join(' ') ??
    'Unbenannter Artist'
  );
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

function isPrismaError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
