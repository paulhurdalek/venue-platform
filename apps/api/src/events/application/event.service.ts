import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { hasLocationAccess } from '../../security/security.functions.js';
import type { AccessContext } from '../../security/access.types.js';
import {
  cleanEventName,
  cleanNullable,
  createFreeEventValues,
  createEventSnapshot,
  eventEndMinutes,
  EventValidationError,
  isIanaTimezone,
  parseLocalDate,
  parseLocalTime,
  validateEventSchedule,
  type EventStatus,
} from '../domain/event.rules.js';
import { LocationOccupancyConflictError } from '../../occupancy/infrastructure/database-occupancy.js';
import type {
  CreateEventInput,
  EventListQuery,
  EventPage,
  EventRecord,
  EventStoredValues,
  UpdateEventInput,
} from './event.models.js';
import { EVENT_REPOSITORY, type EventRepository } from './event.repository.js';

@Injectable()
export class EventService {
  constructor(
    @Inject(EVENT_REPOSITORY)
    private readonly repository: EventRepository,
  ) {}

  async list(access: AccessContext, query: EventListQuery): Promise<EventPage> {
    try {
      if (query.fromDate) parseLocalDate(query.fromDate);
      if (query.toDate) parseLocalDate(query.toDate);
      if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
        throw new EventValidationError(
          'INVALID_EVENT_DATE_RANGE',
          'Das Enddatum des Zeitraums darf nicht vor dem Startdatum liegen',
        );
      }
      if (query.locationId) {
        await this.repository.transaction(async (transaction) => {
          const location = await transaction.findLocation(access.organizationId, query.locationId!);
          this.requireAccessibleLocation(access, location?.id);
        });
      }
      return await this.repository.list(
        access.organizationId,
        query,
        this.visibleLocationIds(access),
      );
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async find(access: AccessContext, eventId: string): Promise<EventRecord> {
    return this.requireEvent(
      await this.repository.find(access.organizationId, eventId, this.visibleLocationIds(access)),
    );
  }

  async create(access: AccessContext, input: CreateEventInput): Promise<EventRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        const organization = await transaction.findOrganization(access.organizationId);
        if (!organization || organization.status !== 'ACTIVE') this.resourceNotFound();

        const location = await transaction.findLocation(access.organizationId, input.locationId);
        this.requireAccessibleLocation(access, location?.id);
        if (!location || location.status !== 'ACTIVE') this.locationNotFound();
        if (!isIanaTimezone(location.timezone)) {
          throw new EventValidationError(
            'INVALID_EVENT_TIMEZONE',
            'Die Zeitzone der Location ist keine gültige IANA-Zeitzone',
          );
        }

        const eventDate = parseLocalDate(input.eventDate);
        let snapshot;
        if (input.sourceEventFormatId) {
          const source = await transaction.findEventFormat(
            access.organizationId,
            input.sourceEventFormatId,
          );
          if (!source) this.eventFormatNotFound();
          if (source!.status !== 'ACTIVE') {
            throw new UnprocessableEntityException({
              code: 'EVENT_FORMAT_ARCHIVED',
              message:
                'Archivierte Veranstaltungsformate können nicht für neue Veranstaltungen verwendet werden',
            });
          }
          snapshot = createEventSnapshot(source!, input);
        } else {
          if (!input.eventKind) {
            throw new EventValidationError(
              'EVENT_KIND_REQUIRED',
              'Die Veranstaltungsart ist für Veranstaltungen ohne Vorlage erforderlich',
            );
          }
          snapshot = createFreeEventValues(input.eventKind, input);
        }
        const created = await transaction.create(access, {
          locationId: location!.id,
          eventDate,
          timezone: location!.timezone,
          ...snapshot,
        });
        await transaction.audit(access, 'event.created', created.id, {
          newVersion: created.version,
          sourceEventFormatId: created.sourceEventFormatId,
          sourceEventFormatVersion: created.sourceEventFormatVersion,
          occupancyComplete: created.occupancyComplete,
        });
        return created;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async update(
    access: AccessContext,
    eventId: string,
    version: number,
    input: UpdateEventInput,
  ): Promise<EventRecord> {
    const changedFields = Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changedFields.length === 0) this.noChanges();

    try {
      return await this.repository.transaction(async (transaction) => {
        const current = this.requireEvent(
          await transaction.find(access.organizationId, eventId, this.visibleLocationIds(access)),
        );
        this.assertVersion(current.version, version);

        let timezone = current.timezone;
        if (input.locationId !== undefined && input.locationId !== current.locationId) {
          const location = await transaction.findLocation(access.organizationId, input.locationId);
          this.requireAccessibleLocation(access, location?.id);
          if (!location || location.status !== 'ACTIVE') this.locationNotFound();
          if (!isIanaTimezone(location.timezone)) {
            throw new EventValidationError(
              'INVALID_EVENT_TIMEZONE',
              'Die Zeitzone der Location ist keine gültige IANA-Zeitzone',
            );
          }
          timezone = location.timezone;
        }

        const values = this.mutableValues(current, input, timezone);
        const updated = await transaction.update(access, eventId, version, values);
        if (!updated) this.versionConflict();
        await transaction.audit(access, 'event.updated', eventId, {
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
    eventId: string,
    version: number,
    status: EventStatus,
  ): Promise<EventRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        const current = this.requireEvent(
          await transaction.find(access.organizationId, eventId, this.visibleLocationIds(access)),
        );
        this.assertVersion(current.version, version);
        if (current.status === status) this.noChanges();
        const updated = await transaction.setStatus(access, eventId, version, status);
        if (!updated) this.versionConflict();
        await transaction.audit(access, 'event.status_changed', eventId, {
          previousStatus: current.status,
          newStatus: status,
          previousVersion: version,
          newVersion: updated!.version,
        });
        return updated!;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  private mutableValues(
    current: EventRecord,
    input: UpdateEventInput,
    timezone: string,
  ): Pick<
    EventStoredValues,
    | 'locationId'
    | 'name'
    | 'eventDate'
    | 'description'
    | 'technicalGetInMinutes'
    | 'artistGetInMinutes'
    | 'doorsMinutes'
    | 'startMinutes'
    | 'endMinutes'
    | 'recordingSetting'
    | 'timezone'
  > {
    const name = cleanEventName(input.name === undefined ? current.name : input.name);
    if (!name) {
      throw new EventValidationError(
        'EVENT_NAME_REQUIRED',
        'Der Veranstaltungsname ist erforderlich',
      );
    }
    if (name.length > 200) {
      throw new EventValidationError(
        'EVENT_NAME_TOO_LONG',
        'Der Veranstaltungsname darf höchstens 200 Zeichen lang sein',
      );
    }
    const endTime = input.endTime === undefined ? current.endTime : input.endTime;
    const endNextDay =
      input.endTime === null && input.endNextDay === undefined
        ? false
        : input.endNextDay === undefined
          ? current.endNextDay
          : input.endNextDay;
    const schedule = {
      technicalGetInMinutes:
        input.technicalGetInTime === undefined
          ? parseLocalTime(current.technicalGetInTime)
          : parseLocalTime(input.technicalGetInTime),
      artistGetInMinutes:
        input.artistGetInTime === undefined
          ? parseLocalTime(current.artistGetInTime)
          : parseLocalTime(input.artistGetInTime),
      doorsMinutes:
        input.doorsTime === undefined
          ? parseLocalTime(current.doorsTime)
          : parseLocalTime(input.doorsTime),
      startMinutes:
        input.startTime === undefined
          ? parseLocalTime(current.startTime)
          : parseLocalTime(input.startTime),
      endMinutes: eventEndMinutes(endTime, endNextDay),
    };
    validateEventSchedule(schedule);
    return {
      locationId: input.locationId ?? current.locationId,
      name,
      eventDate: parseLocalDate(input.eventDate ?? current.eventDate),
      description: cleanNullable(
        input.description === undefined ? current.description : input.description,
      ),
      ...schedule,
      recordingSetting: input.recordingSetting ?? current.recordingSetting,
      timezone,
    };
  }

  private visibleLocationIds(access: AccessContext): string[] | undefined {
    return access.locationScope === 'SELECTED' ? access.locationIds : undefined;
  }

  private requireAccessibleLocation(access: AccessContext, locationId?: string): void {
    if (!locationId || !hasLocationAccess(access.locationScope, access.locationIds, locationId)) {
      this.locationNotFound();
    }
  }

  private requireEvent(record: EventRecord | undefined): EventRecord {
    if (!record) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Veranstaltung nicht gefunden',
      });
    }
    return record;
  }

  private assertVersion(current: number, supplied: number): void {
    if (current !== supplied) this.versionConflict();
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private noChanges(): never {
    throw new UnprocessableEntityException({
      code: 'NO_CHANGES',
      message: 'Es wurden keine Änderungen übermittelt',
    });
  }

  private eventFormatNotFound(): never {
    throw new NotFoundException({
      code: 'EVENT_FORMAT_NOT_FOUND',
      message: 'Veranstaltungsformat nicht gefunden',
    });
  }

  private locationNotFound(): never {
    throw new NotFoundException({
      code: 'LOCATION_NOT_FOUND',
      message: 'Location nicht gefunden',
    });
  }

  private resourceNotFound(): never {
    throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Ressource nicht gefunden',
    });
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof EventValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error instanceof LocationOccupancyConflictError) {
      throw new ConflictException({
        code: 'LOCATION_OCCUPANCY_CONFLICT',
        message: error.message,
        details: { conflicts: error.conflicts },
      });
    }
    throw error;
  }
}
