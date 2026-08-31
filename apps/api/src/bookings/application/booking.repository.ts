import type { AccessContext } from '../../security/access.types.js';
import type { BookingStatus } from '../domain/booking.rules.js';
import type {
  BookingProgress,
  BookingRecord,
  BookingValues,
  EventProgramItemRecord,
  EventProgramItemValues,
  LineupRequirementRecord,
  LineupRequirementValues,
} from './booking.models.js';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

export interface ScopedEventReference {
  id: string;
  version: number;
  locationId: string;
}

export interface BookingRepository {
  event(
    organizationId: string,
    eventId: string,
    locationIds?: string[],
  ): Promise<ScopedEventReference | undefined>;
  list(
    organizationId: string,
    eventId: string,
    includeHistorical: boolean,
  ): Promise<BookingRecord[]>;
  find(organizationId: string, bookingId: string): Promise<BookingRecord | undefined>;
  progress(organizationId: string, eventId: string): Promise<BookingProgress>;
  create(
    access: AccessContext,
    eventId: string,
    status: BookingStatus,
    values: BookingValues,
    confirmDuplicateArtist: boolean,
  ): Promise<BookingRecord>;
  update(
    access: AccessContext,
    bookingId: string,
    version: number,
    values: BookingValues,
    changedFields: string[],
  ): Promise<BookingRecord | undefined>;
  setStatus(
    access: AccessContext,
    bookingId: string,
    version: number,
    previousStatus: BookingStatus,
    newStatus: BookingStatus,
    note: string | null,
  ): Promise<BookingRecord | undefined>;
  reorder(
    access: AccessContext,
    eventId: string,
    items: Array<{ bookingId: string; version: number }>,
  ): Promise<BookingRecord[]>;
  listProgramItems(organizationId: string, eventId: string): Promise<EventProgramItemRecord[]>;
  findProgramItem(
    organizationId: string,
    itemId: string,
  ): Promise<EventProgramItemRecord | undefined>;
  createProgramItem(
    access: AccessContext,
    eventId: string,
    values: EventProgramItemValues,
  ): Promise<EventProgramItemRecord>;
  updateProgramItem(
    access: AccessContext,
    itemId: string,
    version: number,
    values: Pick<EventProgramItemValues, 'label' | 'note' | 'durationMinutes'>,
  ): Promise<EventProgramItemRecord | undefined>;
  deleteProgramItem(access: AccessContext, itemId: string, version: number): Promise<boolean>;
  reorderProgramItems(
    access: AccessContext,
    eventId: string,
    items: Array<{ itemId: string; version: number }>,
  ): Promise<EventProgramItemRecord[]>;
  formatRequirements(
    organizationId: string,
    eventFormatId: string,
  ): Promise<{ version: number; items: LineupRequirementRecord[] } | undefined>;
  eventRequirements(
    organizationId: string,
    eventId: string,
  ): Promise<{ version: number; items: LineupRequirementRecord[] } | undefined>;
  replaceFormatRequirements(
    access: AccessContext,
    eventFormatId: string,
    version: number,
    values: LineupRequirementValues[],
  ): Promise<{ version: number; items: LineupRequirementRecord[] } | undefined>;
  replaceEventRequirements(
    access: AccessContext,
    eventId: string,
    version: number,
    values: LineupRequirementValues[],
  ): Promise<{ version: number; items: LineupRequirementRecord[] } | undefined>;
}

export class BookingPersistenceConflictError extends Error {
  constructor(
    readonly code:
      | 'BOOKING_ACTIVE_ARTIST_CONFLICT'
      | 'BOOKING_PERSISTENCE_CONFLICT'
      | 'LINEUP_REQUIREMENT_ROLE_CONFLICT',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BookingPersistenceConflictError';
  }
}

export class BookingReferenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BookingReferenceError';
  }
}
