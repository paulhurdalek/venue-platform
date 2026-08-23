import type { AccessContext } from '../../security/access.types.js';
import type {
  EntityStatus,
  EventFormatListQuery,
  EventFormatPage,
  EventFormatRecord,
  EventFormatStoredValues,
} from './event-format.models.js';

export const EVENT_FORMAT_REPOSITORY = Symbol('EVENT_FORMAT_REPOSITORY');

export type SafeAuditMetadata = Record<string, string | number | string[]>;

export interface EventFormatTransaction {
  create(organizationId: string, values: EventFormatStoredValues): Promise<EventFormatRecord>;
  update(
    organizationId: string,
    eventFormatId: string,
    version: number,
    values: EventFormatStoredValues,
  ): Promise<EventFormatRecord | undefined>;
  setStatus(
    organizationId: string,
    eventFormatId: string,
    version: number,
    status: EntityStatus,
  ): Promise<EventFormatRecord | undefined>;
  audit(
    access: AccessContext,
    action: string,
    eventFormatId: string,
    metadata: SafeAuditMetadata,
  ): Promise<void>;
}

export interface EventFormatRepository {
  list(organizationId: string, query: EventFormatListQuery): Promise<EventFormatPage>;
  find(organizationId: string, eventFormatId: string): Promise<EventFormatRecord | undefined>;
  transaction<T>(operation: (transaction: EventFormatTransaction) => Promise<T>): Promise<T>;
}
