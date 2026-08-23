import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient, Prisma, TransactionClient } from '@venue/database';

import { AuditWriter } from '../../audit/audit-writer.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AccessContext } from '../../security/access.types.js';
import type {
  EventFormatListQuery,
  EventFormatPage,
  EventFormatRecord,
} from '../application/event-format.models.js';
import type {
  EventFormatRepository,
  EventFormatTransaction,
  SafeAuditMetadata,
} from '../application/event-format.repository.js';
import { EventFormatNameConflictError, formatLocalTime } from '../domain/event-format.rules.js';

type Database = DatabaseClient | TransactionClient;
type EventFormatRow = Prisma.EventFormatGetPayload<Record<string, never>>;

@Injectable()
export class PrismaEventFormatRepository implements EventFormatRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuditWriter)
    private readonly auditWriter: AuditWriter,
  ) {}

  async list(organizationId: string, query: EventFormatListQuery): Promise<EventFormatPage> {
    const where: Prisma.EventFormatWhereInput = {
      organizationId,
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.eventKind ? { eventKind: query.eventKind } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.database.eventFormat.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.database.eventFormat.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.map(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async find(
    organizationId: string,
    eventFormatId: string,
  ): Promise<EventFormatRecord | undefined> {
    return this.findWith(this.prisma.database, organizationId, eventFormatId);
  }

  transaction<T>(operation: (transaction: EventFormatTransaction) => Promise<T>): Promise<T> {
    return this.prisma.transaction((database) => operation(this.transactionAdapter(database)));
  }

  private transactionAdapter(database: TransactionClient): EventFormatTransaction {
    return {
      create: async (organizationId, values) => {
        try {
          const row = await database.eventFormat.create({ data: { organizationId, ...values } });
          return this.map(row);
        } catch (error) {
          return this.rethrowUniqueConflict(error);
        }
      },
      update: async (organizationId, eventFormatId, version, values) => {
        try {
          const result = await database.eventFormat.updateMany({
            where: { id: eventFormatId, organizationId, version },
            data: { ...values, version: { increment: 1 } },
          });
          if (result.count !== 1) return undefined;
          return this.findWith(database, organizationId, eventFormatId);
        } catch (error) {
          return this.rethrowUniqueConflict(error);
        }
      },
      setStatus: async (organizationId, eventFormatId, version, status) => {
        const result = await database.eventFormat.updateMany({
          where: { id: eventFormatId, organizationId, version },
          data: {
            status,
            archivedAt: status === 'ARCHIVED' ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) return undefined;
        return this.findWith(database, organizationId, eventFormatId);
      },
      audit: (access, action, eventFormatId, metadata) =>
        this.appendAudit(database, access, action, eventFormatId, metadata),
    };
  }

  private async appendAudit(
    database: TransactionClient,
    access: AccessContext,
    action: string,
    eventFormatId: string,
    metadata: SafeAuditMetadata,
  ): Promise<void> {
    await this.auditWriter.append(
      database,
      access,
      action,
      'event_format',
      eventFormatId,
      metadata as Prisma.InputJsonObject,
    );
  }

  private async findWith(
    database: Database,
    organizationId: string,
    eventFormatId: string,
  ): Promise<EventFormatRecord | undefined> {
    const row = await database.eventFormat.findFirst({
      where: { id: eventFormatId, organizationId },
    });
    return row ? this.map(row) : undefined;
  }

  private map(row: EventFormatRow): EventFormatRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      normalizedName: row.normalizedName,
      description: row.description,
      eventKind: row.eventKind,
      defaultTechnicalGetInTime: formatLocalTime(row.technicalGetInMinutes),
      defaultArtistGetInTime: formatLocalTime(row.artistGetInMinutes),
      defaultDoorsTime: formatLocalTime(row.doorsMinutes),
      defaultStartTime: formatLocalTime(row.startMinutes),
      defaultEndTime: formatLocalTime(row.endMinutes),
      defaultEndNextDay: row.endMinutes !== null && row.endMinutes >= 1440,
      recordingDefault: row.recordingDefault,
      status: row.status,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowUniqueConflict(error: unknown): never {
    if (isPrismaError(error, 'P2002')) throw new EventFormatNameConflictError();
    throw error;
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
