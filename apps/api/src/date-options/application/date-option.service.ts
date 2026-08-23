import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { EventStoredValues } from '../../events/application/event.models.js';
import {
  createEventSnapshot,
  createFreeEventValues,
  eventEndMinutes,
  EventValidationError,
  formatLocalTime,
  isIanaTimezone,
  parseLocalDate,
  parseLocalTime,
} from '../../events/domain/event.rules.js';
import { LocationOccupancyConflictError } from '../../occupancy/infrastructure/database-occupancy.js';
import type { AccessContext } from '../../security/access.types.js';
import { hasLocationAccess } from '../../security/security.functions.js';
import {
  availabilityDates,
  dateOptionInterval,
  dateOptionValues,
} from '../domain/date-option.rules.js';
import type {
  AvailabilityQuery,
  AvailabilityResult,
  ConvertDateOptionInput,
  CreateDateOptionBatchInput,
  CreateDateOptionInput,
  DateOptionBatchResult,
  DateOptionListQuery,
  DateOptionRecord,
  DateOptionValues,
  UpdateDateOptionInput,
} from './date-option.models.js';
import {
  DATE_OPTION_REPOSITORY,
  type DateOptionPage,
  type DateOptionRepository,
  type DateOptionTransaction,
} from './date-option.repository.js';

@Injectable()
export class DateOptionService {
  constructor(@Inject(DATE_OPTION_REPOSITORY) private readonly repository: DateOptionRepository) {}

  async list(access: AccessContext, query: DateOptionListQuery): Promise<DateOptionPage> {
    try {
      if (query.fromDate) parseLocalDate(query.fromDate);
      if (query.toDate) parseLocalDate(query.toDate);
      if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
        throw new EventValidationError(
          'INVALID_DATE_OPTION_RANGE',
          'Das Bis-Datum darf nicht vor dem Von-Datum liegen',
        );
      }
      return await this.repository.transaction(async (transaction) => {
        if (query.locationId)
          await this.requireLocation(transaction, access, query.locationId, false);
        const locationIds = query.locationId
          ? [query.locationId]
          : await transaction.locationIds(access.organizationId, this.visibleLocationIds(access));
        await transaction.prepare(access, locationIds);
        const page = await transaction.list(
          access.organizationId,
          query,
          this.visibleLocationIds(access),
        );
        await this.addPromotionState(transaction, page.items);
        return page;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async find(access: AccessContext, optionId: string): Promise<DateOptionRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        let option = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        await transaction.prepare(access, [option.locationId]);
        option = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        await this.addPromotionState(transaction, [option]);
        return option;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async create(access: AccessContext, input: CreateDateOptionInput): Promise<DateOptionRecord> {
    try {
      const parsed = dateOptionValues(input);
      const values: DateOptionValues = {
        ...parsed,
        locationId: input.locationId,
        businessPartnerId: input.businessPartnerId ?? null,
        contactId: input.contactId ?? null,
      };
      return await this.repository.transaction(async (transaction) => {
        await this.requireLocation(transaction, access, values.locationId, true);
        await this.requireReferences(transaction, access.organizationId, values);
        await transaction.prepare(access, [values.locationId]);
        const state = await transaction.occupancyState(
          access.organizationId,
          values.locationId,
          dateOptionInterval(values),
        );
        if (state.hasEvent) this.occupancyConflict(state.conflicts);
        const rank = !state.hasFirstOption
          ? 'FIRST'
          : !state.hasSecondOption
            ? 'SECOND'
            : this.occupancyConflict(state.conflicts);
        const created = await transaction.create(access, values, rank);
        await transaction.audit(access, 'date_option.created', created.id, {
          rank,
          newVersion: created.version,
          locationId: created.locationId,
        });
        return created;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async createBatch(
    access: AccessContext,
    input: CreateDateOptionBatchInput,
  ): Promise<DateOptionBatchResult> {
    try {
      const values = input.options.map((option) => ({
        ...dateOptionValues({
          optionDate: option.optionDate,
          occupancyStartTime: option.occupancyStartTime,
          occupancyEndTime: option.occupancyEndTime,
          occupancyEndNextDay: option.occupancyEndNextDay ?? false,
          label: input.label,
          note: input.note ?? null,
          validUntil: input.validUntil,
        }),
        locationId: option.locationId,
        businessPartnerId: input.businessPartnerId ?? null,
        contactId: input.contactId ?? null,
        rank: option.rank,
      }));
      this.assertUniqueBatchEntries(values);

      return await this.repository.transaction(async (transaction) => {
        const locationIds = [...new Set(values.map(({ locationId }) => locationId))];
        for (const locationId of locationIds) {
          await this.requireLocation(transaction, access, locationId, true);
        }
        await this.requireReferences(transaction, access.organizationId, values[0]!);
        await transaction.prepare(access, locationIds);

        const created: DateOptionRecord[] = [];
        for (const [index, entry] of values.entries()) {
          const state = await transaction.occupancyState(
            access.organizationId,
            entry.locationId,
            dateOptionInterval(entry),
          );
          if (
            state.hasEvent ||
            (entry.rank === 'FIRST' ? state.hasFirstOption : state.hasSecondOption)
          ) {
            this.batchOccupancyConflict(index, entry, state.conflicts);
          }
          try {
            const option = await transaction.create(access, entry, entry.rank);
            await transaction.audit(access, 'date_option.created', option.id, {
              rank: entry.rank,
              newVersion: option.version,
              locationId: option.locationId,
              batch: true,
              batchIndex: index,
              batchSize: values.length,
            });
            created.push(option);
          } catch (error) {
            if (error instanceof LocationOccupancyConflictError) {
              this.batchOccupancyConflict(index, entry, error.conflicts);
            }
            throw error;
          }
        }
        return { count: created.length, items: created };
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async update(
    access: AccessContext,
    optionId: string,
    version: number,
    input: UpdateDateOptionInput,
  ): Promise<DateOptionRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        const current = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        this.assertActive(current);
        this.assertVersion(current.version, version);
        const parsed = dateOptionValues({
          optionDate: input.optionDate ?? current.optionDate,
          occupancyStartTime: input.occupancyStartTime ?? current.occupancyStartTime,
          occupancyEndTime: input.occupancyEndTime ?? current.occupancyEndTime,
          occupancyEndNextDay: input.occupancyEndNextDay ?? current.occupancyEndNextDay,
          label: input.label ?? current.label,
          note: input.note === undefined ? current.note : input.note,
          validUntil: input.validUntil ?? current.validUntil,
        });
        const values: DateOptionValues = {
          ...parsed,
          locationId: input.locationId ?? current.locationId,
          businessPartnerId:
            input.businessPartnerId === undefined
              ? current.businessPartnerId
              : input.businessPartnerId,
          contactId: input.contactId === undefined ? current.contactId : input.contactId,
        };
        await this.requireLocation(transaction, access, values.locationId, true);
        await this.requireReferences(transaction, access.organizationId, values);
        await transaction.prepare(access, [current.locationId, values.locationId]);
        const updated = await transaction.update(access, optionId, version, values);
        if (!updated) this.versionConflict();
        await transaction.audit(access, 'date_option.updated', optionId, {
          previousVersion: version,
          newVersion: updated!.version,
          changedFields: Object.keys(input),
        });
        return updated!;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async release(
    access: AccessContext,
    optionId: string,
    version: number,
  ): Promise<DateOptionRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        const current = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        this.assertActive(current);
        this.assertVersion(current.version, version);
        await transaction.prepare(access, [current.locationId]);
        const released = await transaction.setStatus(access, optionId, version, 'RELEASED');
        if (!released) this.versionConflict();
        await transaction.audit(access, 'date_option.released', optionId, {
          previousVersion: version,
          newVersion: released!.version,
        });
        return released!;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async promote(
    access: AccessContext,
    optionId: string,
    version: number,
  ): Promise<DateOptionRecord> {
    try {
      return await this.repository.transaction(async (transaction) => {
        const current = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        this.assertActive(current);
        this.assertVersion(current.version, version);
        if (current.rank !== 'SECOND') {
          throw new UnprocessableEntityException({
            code: 'DATE_OPTION_NOT_SECOND',
            message: 'Nur eine 2. Option kann hochgestuft werden',
          });
        }
        await transaction.prepare(access, [current.locationId]);
        const promoted = await transaction.promote(access, optionId, version);
        if (!promoted) this.versionConflict();
        await transaction.audit(access, 'date_option.promoted', optionId, {
          previousRank: 'SECOND',
          newRank: 'FIRST',
          previousVersion: version,
          newVersion: promoted!.version,
        });
        return promoted!;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async availability(
    access: AccessContext,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResult[]> {
    try {
      const dates = availabilityDates(query.fromDate, query.toDate, query.weekdays);
      const startMinutes = parseLocalTime(query.occupancyStartTime);
      const endMinutes = eventEndMinutes(
        query.occupancyEndTime,
        query.occupancyEndNextDay ?? false,
      );
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        throw new EventValidationError(
          'INVALID_AVAILABILITY_SCHEDULE',
          'Das Ende der gesuchten Belegung muss nach ihrem Beginn liegen',
        );
      }
      return await this.repository.transaction(async (transaction) => {
        await this.requireLocation(transaction, access, query.locationId, false);
        await transaction.prepare(access, [query.locationId]);
        const results: AvailabilityResult[] = [];
        for (const date of dates) {
          const interval = { date, startMinutes, endMinutes };
          const manual = await transaction.hasIncompleteEvent(
            access.organizationId,
            query.locationId,
            date,
          );
          const state = await transaction.occupancyState(
            access.organizationId,
            query.locationId,
            interval,
          );
          const resultState = manual
            ? 'MANUAL_REVIEW'
            : state.hasEvent
              ? 'EVENT_OCCUPIED'
              : state.hasFirstOption && state.hasSecondOption
                ? 'FULLY_OPTIONED'
                : state.hasFirstOption
                  ? 'SECOND_OPTION_AVAILABLE'
                  : state.hasSecondOption
                    ? 'FIRST_OPTION_AVAILABLE'
                    : 'FREE';
          results.push({
            date,
            occupancyStartTime: formatLocalTime(startMinutes)!,
            occupancyEndTime: formatLocalTime(endMinutes)!,
            occupancyEndNextDay: endMinutes >= 1440,
            state: resultState,
            selectable:
              !manual &&
              (resultState === 'FREE' ||
                resultState === 'FIRST_OPTION_AVAILABLE' ||
                (query.resultFilter === 'FREE_AND_SECOND_OPTION' &&
                  resultState === 'SECOND_OPTION_AVAILABLE')),
          });
        }
        return results;
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  async convert(
    access: AccessContext,
    optionId: string,
    version: number,
    input: ConvertDateOptionInput,
  ) {
    try {
      return await this.repository.transaction(async (transaction) => {
        const option = this.requireOption(
          await transaction.find(access.organizationId, optionId, this.visibleLocationIds(access)),
        );
        this.assertActive(option);
        this.assertVersion(option.version, version);
        const locationId = input.locationId ?? option.locationId;
        const location = await this.requireLocation(transaction, access, locationId, true);
        if (!isIanaTimezone(location.timezone)) {
          throw new EventValidationError(
            'INVALID_EVENT_TIMEZONE',
            'Die Location-Zeitzone ist ungültig',
          );
        }
        const eventDate = parseLocalDate(input.eventDate ?? option.optionDate);
        const defaults = {
          ...input,
          name: input.name ?? option.label,
          technicalGetInTime: input.technicalGetInTime ?? option.occupancyStartTime,
          endTime: input.endTime ?? option.occupancyEndTime,
          endNextDay: input.endNextDay ?? option.occupancyEndNextDay,
        };
        let snapshot;
        if (input.sourceEventFormatId) {
          const format = await transaction.findEventFormat(
            access.organizationId,
            input.sourceEventFormatId,
          );
          if (!format) this.eventFormatNotFound();
          if (format!.status !== 'ACTIVE') {
            throw new UnprocessableEntityException({
              code: 'EVENT_FORMAT_ARCHIVED',
              message: 'Archivierte Formate können nicht verwendet werden',
            });
          }
          snapshot = createEventSnapshot(format!, defaults);
        } else {
          if (!input.eventKind) {
            throw new EventValidationError(
              'EVENT_KIND_REQUIRED',
              'Die Veranstaltungsart ist ohne Vorlage erforderlich',
            );
          }
          snapshot = createFreeEventValues(input.eventKind, defaults);
        }
        const values: EventStoredValues = {
          locationId,
          eventDate,
          timezone: location.timezone,
          ...snapshot,
        };
        await transaction.prepare(access, [option.locationId, locationId]);
        return transaction.convert(access, option, values);
      });
    } catch (error) {
      return this.rethrowKnown(error);
    }
  }

  private async addPromotionState(
    transaction: DateOptionTransaction,
    options: DateOptionRecord[],
  ): Promise<void> {
    for (const option of options) {
      if (option.status !== 'ACTIVE' || option.rank !== 'SECOND') continue;
      const state = await transaction.occupancyState(
        option.organizationId,
        option.locationId,
        dateOptionInterval({
          optionDate: option.optionDate,
          occupancyStartMinutes: parseLocalTime(option.occupancyStartTime)!,
          occupancyEndMinutes:
            parseLocalTime(option.occupancyEndTime)! + (option.occupancyEndNextDay ? 1440 : 0),
        }),
      );
      option.canPromote = !state.hasFirstOption;
    }
  }

  private async requireLocation(
    transaction: DateOptionTransaction,
    access: AccessContext,
    locationId: string,
    active: boolean,
  ) {
    const location = await transaction.findLocation(access.organizationId, locationId);
    if (
      !location ||
      (active && location.status !== 'ACTIVE') ||
      !hasLocationAccess(access.locationScope, access.locationIds, locationId)
    ) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location nicht gefunden',
      });
    }
    return location;
  }

  private async requireReferences(
    transaction: DateOptionTransaction,
    organizationId: string,
    values: Pick<DateOptionValues, 'businessPartnerId' | 'contactId'>,
  ) {
    if (
      !(await transaction.validateReferences(
        organizationId,
        values.businessPartnerId,
        values.contactId,
      ))
    ) {
      throw new NotFoundException({
        code: 'DATE_OPTION_REFERENCE_NOT_FOUND',
        message: 'Geschäftspartner oder Ansprechpartner wurde nicht gefunden',
      });
    }
  }

  private assertUniqueBatchEntries(
    values: Array<
      DateOptionValues & {
        rank: 'FIRST' | 'SECOND';
      }
    >,
  ): void {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      const key = [
        value.locationId,
        value.optionDate,
        value.occupancyStartMinutes,
        value.occupancyEndMinutes,
      ].join(':');
      if (seen.has(key)) {
        throw new UnprocessableEntityException({
          code: 'DUPLICATE_DATE_OPTION_BATCH_ENTRY',
          message: 'Ein Termin darf innerhalb eines Vorgangs nur einmal enthalten sein',
          details: {
            batchIndex: index,
            optionDate: value.optionDate,
            locationId: value.locationId,
          },
        });
      }
      seen.add(key);
    }
  }

  private batchOccupancyConflict(
    batchIndex: number,
    value: DateOptionValues & { rank: 'FIRST' | 'SECOND' },
    conflicts: unknown[],
  ): never {
    throw new ConflictException({
      code: 'LOCATION_OCCUPANCY_CONFLICT',
      message: `Termin ${batchIndex + 1} kann wegen einer bestehenden Belegung nicht angelegt werden`,
      details: {
        conflicts,
        batchEntries: [
          {
            batchIndex,
            optionDate: value.optionDate,
            locationId: value.locationId,
            rank: value.rank,
          },
        ],
      },
    });
  }

  private requireOption(option?: DateOptionRecord): DateOptionRecord {
    if (!option) {
      throw new NotFoundException({
        code: 'DATE_OPTION_NOT_FOUND',
        message: 'Terminoption nicht gefunden',
      });
    }
    return option;
  }

  private assertActive(option: DateOptionRecord) {
    if (option.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code: 'DATE_OPTION_NOT_ACTIVE',
        message: 'Nur aktive Terminoptionen können geändert werden',
      });
    }
  }

  private assertVersion(current: number, supplied: number) {
    if (current !== supplied) this.versionConflict();
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.',
    });
  }

  private eventFormatNotFound(): never {
    throw new NotFoundException({
      code: 'EVENT_FORMAT_NOT_FOUND',
      message: 'Veranstaltungsformat nicht gefunden',
    });
  }

  private occupancyConflict(conflicts: unknown[]): never {
    throw new ConflictException({
      code: 'LOCATION_OCCUPANCY_CONFLICT',
      message: 'Die Location ist im gewählten Zeitraum bereits belegt',
      details: { conflicts },
    });
  }

  private visibleLocationIds(access: AccessContext): string[] | undefined {
    return access.locationScope === 'SELECTED' ? access.locationIds : undefined;
  }

  private rethrowKnown(error: unknown): never {
    if (error instanceof EventValidationError) {
      throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
    if (error instanceof LocationOccupancyConflictError) {
      this.occupancyConflict(error.conflicts);
    }
    throw error;
  }
}
