import type { EventKind, EventStatus, RecordingSetting } from '../domain/event.rules.js';

export type EventSnapshotSource = 'EVENT_FORMAT' | null;

export type EventBookingFilter =
  'INCOMPLETE' | 'MODERATOR_MISSING' | 'OPEN_REQUESTS' | 'HAS_OPTIONS' | 'FULLY_CONFIRMED';

export interface EventBookingSummary {
  artistRequiredCount: number;
  artistConfirmedCount: number;
  moderatorRequired: boolean;
  moderatorConfirmed: boolean;
  openRequestCount: number;
  optionCount: number;
  incomplete: boolean;
  fullyConfirmed: boolean;
}

export interface EventRecord {
  id: string;
  organizationId: string;
  locationId: string;
  locationName: string;
  name: string;
  eventDate: string;
  status: EventStatus;
  version: number;
  cancelledAt: string | null;
  completedAt: string | null;
  snapshotSource: EventSnapshotSource;
  sourceEventFormatId: string | null;
  sourceEventFormatVersion: number | null;
  formatNameSnapshot: string | null;
  formatDescriptionSnapshot: string | null;
  eventKind: EventKind;
  description: string | null;
  technicalGetInTime: string | null;
  artistGetInTime: string | null;
  doorsTime: string | null;
  startTime: string | null;
  endTime: string | null;
  endNextDay: boolean;
  recordingSetting: RecordingSetting;
  timezone: string;
  occupancyComplete: boolean;
  expectedGuestCount: number | null;
  sourceCalculationTemplateId: string | null;
  sourceCalculationTemplateVersion: number | null;
  calculationTemplateNameSnapshot: string | null;
  bookingSummary: EventBookingSummary;
  createdAt: string;
  updatedAt: string;
}

export interface EventStoredValues {
  locationId: string;
  name: string;
  eventDate: string;
  snapshotSource: EventSnapshotSource;
  sourceEventFormatId: string | null;
  sourceEventFormatVersion: number | null;
  formatNameSnapshot: string | null;
  formatDescriptionSnapshot: string | null;
  eventKind: EventKind;
  description: string | null;
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  recordingSetting: RecordingSetting;
  timezone: string;
  expectedGuestCount: number | null;
  sourceCalculationTemplateId: string | null;
}

export interface CreateEventInput {
  sourceEventFormatId?: string;
  sourceCalculationTemplateId?: string;
  eventKind?: EventKind;
  locationId: string;
  eventDate: string;
  name?: string;
  description?: string | null;
  technicalGetInTime?: string | null;
  artistGetInTime?: string | null;
  doorsTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
  recordingSetting?: RecordingSetting;
  expectedGuestCount?: number | null;
}

export interface UpdateEventInput {
  locationId?: string;
  name?: string;
  eventDate?: string;
  description?: string | null;
  technicalGetInTime?: string | null;
  artistGetInTime?: string | null;
  doorsTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
  recordingSetting?: RecordingSetting;
  expectedGuestCount?: number | null;
}

export interface EventListQuery {
  q?: string;
  fromDate?: string;
  toDate?: string;
  status?: EventStatus;
  eventFormatId?: string;
  eventKind?: EventKind;
  locationId?: string;
  booking?: EventBookingFilter;
  limit: number;
  offset: number;
}

export interface EventPage {
  items: EventRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface EventLocationSource {
  id: string;
  name: string;
  timezone: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface EventOrganizationSource {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface EventFormatSource {
  id: string;
  name: string;
  description: string | null;
  eventKind: EventKind;
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  recordingDefault: RecordingSetting;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}
