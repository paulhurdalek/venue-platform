import type { AccessContext } from '../../security/access.types.js';
import type { EventStatus } from '../domain/event.rules.js';
import type {
  EventFormatSource,
  EventListQuery,
  EventLocationSource,
  EventOrganizationSource,
  EventPage,
  EventRecord,
  EventStoredValues,
} from './event.models.js';

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');

export type SafeEventAuditMetadata = Record<string, string | number | boolean | null | string[]>;

export interface EventTransaction {
  findOrganization(organizationId: string): Promise<EventOrganizationSource | undefined>;
  findLocation(
    organizationId: string,
    locationId: string,
  ): Promise<EventLocationSource | undefined>;
  findEventFormat(
    organizationId: string,
    eventFormatId: string,
  ): Promise<EventFormatSource | undefined>;
  find(
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<EventRecord | undefined>;
  create(access: AccessContext, values: EventStoredValues): Promise<EventRecord>;
  update(
    access: AccessContext,
    eventId: string,
    version: number,
    values: Pick<
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
    >,
  ): Promise<EventRecord | undefined>;
  setStatus(
    access: AccessContext,
    eventId: string,
    version: number,
    status: EventStatus,
  ): Promise<EventRecord | undefined>;
  audit(
    access: AccessContext,
    action: string,
    eventId: string,
    metadata: SafeEventAuditMetadata,
  ): Promise<void>;
}

export interface EventRepository {
  list(organizationId: string, query: EventListQuery, locationIds?: string[]): Promise<EventPage>;
  find(
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<EventRecord | undefined>;
  transaction<T>(operation: (transaction: EventTransaction) => Promise<T>): Promise<T>;
}
