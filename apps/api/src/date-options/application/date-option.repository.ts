import type { AccessContext } from '../../security/access.types.js';
import type {
  EventRecord,
  EventStoredValues,
  EventFormatSource,
  EventLocationSource,
} from '../../events/application/event.models.js';
import type { LocalOccupancyInterval } from '../../occupancy/domain/occupancy.rules.js';
import type { OccupancyConflictTarget } from '../../occupancy/infrastructure/database-occupancy.js';
import type {
  DateOptionListQuery,
  DateOptionRank,
  DateOptionRecord,
  DateOptionStatus,
  DateOptionValues,
} from './date-option.models.js';

export const DATE_OPTION_REPOSITORY = Symbol('DATE_OPTION_REPOSITORY');

export interface DateOptionPage {
  items: DateOptionRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface OccupancyState {
  hasEvent: boolean;
  hasFirstOption: boolean;
  hasSecondOption: boolean;
  conflicts: OccupancyConflictTarget[];
}

export interface DateOptionTransaction {
  prepare(access: AccessContext, locationIds: string[]): Promise<void>;
  locationIds(organizationId: string, visibleLocationIds?: string[]): Promise<string[]>;
  findLocation(
    organizationId: string,
    locationId: string,
  ): Promise<EventLocationSource | undefined>;
  findEventFormat(
    organizationId: string,
    eventFormatId: string,
  ): Promise<EventFormatSource | undefined>;
  validateReferences(
    organizationId: string,
    businessPartnerId: string | null,
    contactId: string | null,
  ): Promise<boolean>;
  find(
    organizationId: string,
    optionId: string,
    locationIds?: string[],
  ): Promise<DateOptionRecord | undefined>;
  list(
    organizationId: string,
    query: DateOptionListQuery,
    locationIds?: string[],
  ): Promise<DateOptionPage>;
  occupancyState(
    organizationId: string,
    locationId: string,
    interval: LocalOccupancyInterval,
  ): Promise<OccupancyState>;
  hasIncompleteEvent(organizationId: string, locationId: string, date: string): Promise<boolean>;
  create(
    access: AccessContext,
    values: DateOptionValues,
    rank: DateOptionRank,
  ): Promise<DateOptionRecord>;
  update(
    access: AccessContext,
    optionId: string,
    version: number,
    values: DateOptionValues,
  ): Promise<DateOptionRecord | undefined>;
  setStatus(
    access: AccessContext,
    optionId: string,
    version: number,
    status: DateOptionStatus,
  ): Promise<DateOptionRecord | undefined>;
  promote(
    access: AccessContext,
    optionId: string,
    version: number,
  ): Promise<DateOptionRecord | undefined>;
  convert(
    access: AccessContext,
    option: DateOptionRecord,
    values: EventStoredValues,
  ): Promise<EventRecord>;
  audit(
    access: AccessContext,
    action: string,
    optionId: string,
    metadata: Record<string, string | number | boolean | null | string[]>,
  ): Promise<void>;
}

export interface DateOptionRepository {
  transaction<T>(operation: (transaction: DateOptionTransaction) => Promise<T>): Promise<T>;
}
