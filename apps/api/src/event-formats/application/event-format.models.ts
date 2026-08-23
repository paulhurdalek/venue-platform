import type { EventKind, RecordingDefault } from '../domain/event-format.rules.js';

export type EntityStatus = 'ACTIVE' | 'ARCHIVED';

export interface EventFormatRecord {
  id: string;
  organizationId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  eventKind: EventKind;
  defaultTechnicalGetInTime: string | null;
  defaultArtistGetInTime: string | null;
  defaultDoorsTime: string | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultEndNextDay: boolean;
  recordingDefault: RecordingDefault;
  status: EntityStatus;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventFormatStoredValues {
  name: string;
  normalizedName: string;
  description: string | null;
  eventKind: EventKind;
  technicalGetInMinutes: number | null;
  artistGetInMinutes: number | null;
  doorsMinutes: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  recordingDefault: RecordingDefault;
}

export interface EventFormatInput {
  name: string;
  description: string | null;
  eventKind: EventKind;
  defaultTechnicalGetInTime: string | null;
  defaultArtistGetInTime: string | null;
  defaultDoorsTime: string | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultEndNextDay: boolean;
  recordingDefault: RecordingDefault;
}

export interface EventFormatListQuery {
  q?: string;
  status: EntityStatus | 'ALL';
  eventKind?: EventKind;
  limit: number;
  offset: number;
}

export interface EventFormatPage {
  items: EventFormatRecord[];
  total: number;
  limit: number;
  offset: number;
}
