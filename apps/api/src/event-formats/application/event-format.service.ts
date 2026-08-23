import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AccessContext } from '../../security/access.types.js';
import {
  cleanEventFormatName,
  eventEndMinutes,
  EventFormatNameConflictError,
  EventFormatValidationError,
  normalizeEventFormatName,
  parseLocalTime,
  validateEventFormatSchedule,
} from '../domain/event-format.rules.js';
import type {
  EntityStatus,
  EventFormatInput,
  EventFormatListQuery,
  EventFormatPage,
  EventFormatRecord,
  EventFormatStoredValues,
} from './event-format.models.js';
import { EVENT_FORMAT_REPOSITORY, type EventFormatRepository } from './event-format.repository.js';

@Injectable()
export class EventFormatService {
  constructor(
    @Inject(EVENT_FORMAT_REPOSITORY)
    private readonly repository: EventFormatRepository,
  ) {}

  list(organizationId: string, query: EventFormatListQuery): Promise<EventFormatPage> {
    return this.repository.list(organizationId, query);
  }

  async find(organizationId: string, eventFormatId: string): Promise<EventFormatRecord> {
    return this.requireRecord(await this.repository.find(organizationId, eventFormatId));
  }

  async create(
    access: AccessContext,
    input: Partial<EventFormatInput>,
  ): Promise<EventFormatRecord> {
    try {
      const values = this.toStoredValues(this.completeInput(input));
      return await this.repository.transaction(async (transaction) => {
        const created = await transaction.create(access.organizationId, values);
        await transaction.audit(access, 'event_format.created', created.id, {
          newVersion: created.version,
        });
        return created;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async update(
    access: AccessContext,
    eventFormatId: string,
    version: number,
    input: Partial<EventFormatInput>,
  ): Promise<EventFormatRecord> {
    const current = await this.find(access.organizationId, eventFormatId);
    this.assertVersion(current.version, version);
    const changedFields = Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changedFields.length === 0) this.noChanges();

    try {
      const values = this.toStoredValues(this.mergeInput(current, input));
      return await this.repository.transaction(async (transaction) => {
        const updated = await transaction.update(
          access.organizationId,
          eventFormatId,
          version,
          values,
        );
        if (!updated) this.versionConflict();
        await transaction.audit(access, 'event_format.updated', eventFormatId, {
          changedFields,
          previousVersion: version,
          newVersion: updated!.version,
        });
        return updated!;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async setStatus(
    access: AccessContext,
    eventFormatId: string,
    version: number,
    status: EntityStatus,
  ): Promise<EventFormatRecord> {
    const current = await this.find(access.organizationId, eventFormatId);
    this.assertVersion(current.version, version);
    if (current.status === status) this.noChanges();
    return this.repository.transaction(async (transaction) => {
      const updated = await transaction.setStatus(
        access.organizationId,
        eventFormatId,
        version,
        status,
      );
      if (!updated) this.versionConflict();
      await transaction.audit(
        access,
        status === 'ARCHIVED' ? 'event_format.archived' : 'event_format.reactivated',
        eventFormatId,
        {
          previousStatus: current.status,
          newStatus: status,
          previousVersion: version,
          newVersion: updated!.version,
        },
      );
      return updated!;
    });
  }

  private completeInput(input: Partial<EventFormatInput>): EventFormatInput {
    return {
      name: input.name ?? '',
      description: this.cleanNullable(input.description),
      eventKind: input.eventKind ?? 'OWN_PRODUCTION',
      defaultTechnicalGetInTime: input.defaultTechnicalGetInTime ?? null,
      defaultArtistGetInTime: input.defaultArtistGetInTime ?? null,
      defaultDoorsTime: input.defaultDoorsTime ?? null,
      defaultStartTime: input.defaultStartTime ?? null,
      defaultEndTime: input.defaultEndTime ?? null,
      defaultEndNextDay: input.defaultEndNextDay ?? false,
      recordingDefault: input.recordingDefault ?? 'UNSPECIFIED',
    };
  }

  private mergeInput(
    current: EventFormatRecord,
    input: Partial<EventFormatInput>,
  ): EventFormatInput {
    const merged: EventFormatInput = {
      name: current.name,
      description: current.description,
      eventKind: current.eventKind,
      defaultTechnicalGetInTime: current.defaultTechnicalGetInTime,
      defaultArtistGetInTime: current.defaultArtistGetInTime,
      defaultDoorsTime: current.defaultDoorsTime,
      defaultStartTime: current.defaultStartTime,
      defaultEndTime: current.defaultEndTime,
      defaultEndNextDay: current.defaultEndNextDay,
      recordingDefault: current.recordingDefault,
    };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
    }
    if (input.defaultEndTime === null && input.defaultEndNextDay === undefined) {
      merged.defaultEndNextDay = false;
    }
    merged.description = this.cleanNullable(merged.description);
    return merged;
  }

  private toStoredValues(input: EventFormatInput): EventFormatStoredValues {
    const name = cleanEventFormatName(input.name);
    if (!name) {
      throw new EventFormatValidationError(
        'EVENT_FORMAT_NAME_REQUIRED',
        'Der Name des Veranstaltungsformats ist erforderlich',
      );
    }
    if (name.length > 200) {
      throw new EventFormatValidationError(
        'EVENT_FORMAT_NAME_TOO_LONG',
        'Der Name des Veranstaltungsformats darf höchstens 200 Zeichen lang sein',
      );
    }
    const schedule = {
      technicalGetInMinutes: parseLocalTime(input.defaultTechnicalGetInTime),
      artistGetInMinutes: parseLocalTime(input.defaultArtistGetInTime),
      doorsMinutes: parseLocalTime(input.defaultDoorsTime),
      startMinutes: parseLocalTime(input.defaultStartTime),
      endMinutes: eventEndMinutes(input.defaultEndTime, input.defaultEndNextDay),
    };
    validateEventFormatSchedule(schedule);
    return {
      name,
      normalizedName: normalizeEventFormatName(name),
      description: this.cleanNullable(input.description),
      eventKind: input.eventKind,
      ...schedule,
      recordingDefault: input.recordingDefault,
    };
  }

  private cleanNullable(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private assertVersion(current: number, supplied: number): void {
    if (current !== supplied) this.versionConflict();
  }

  private requireRecord(record: EventFormatRecord | undefined): EventFormatRecord {
    if (!record) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Ressource nicht gefunden',
      });
    }
    return record;
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof EventFormatNameConflictError) {
      throw new ConflictException({
        code: 'EVENT_FORMAT_NAME_CONFLICT',
        message: error.message,
      });
    }
    if (error instanceof EventFormatValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    throw error;
  }
}
