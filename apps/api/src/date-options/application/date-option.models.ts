import type { EventKind, RecordingSetting } from '../../events/domain/event.rules.js';

export type DateOptionRank = 'FIRST' | 'SECOND';
export type DateOptionStatus = 'ACTIVE' | 'CONVERTED' | 'RELEASED' | 'EXPIRED' | 'UNAVAILABLE';

export interface DateOptionRecord {
  id: string;
  organizationId: string;
  locationId: string;
  locationName: string;
  optionDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay: boolean;
  rank: DateOptionRank;
  label: string;
  businessPartnerId: string | null;
  businessPartnerName: string | null;
  contactId: string | null;
  contactName: string | null;
  note: string | null;
  validUntil: string;
  status: DateOptionStatus;
  version: number;
  canPromote: boolean;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DateOptionValues {
  locationId: string;
  optionDate: string;
  occupancyStartMinutes: number;
  occupancyEndMinutes: number;
  label: string;
  businessPartnerId: string | null;
  contactId: string | null;
  note: string | null;
  validUntil: Date;
}

export interface CreateDateOptionInput {
  locationId: string;
  optionDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay?: boolean;
  label: string;
  businessPartnerId?: string | null;
  contactId?: string | null;
  note?: string | null;
  validUntil: string;
}

export interface CreateDateOptionBatchItemInput {
  locationId: string;
  optionDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay?: boolean;
  rank: DateOptionRank;
}

export interface CreateDateOptionBatchInput {
  label: string;
  businessPartnerId?: string | null;
  contactId?: string | null;
  note?: string | null;
  validUntil: string;
  options: CreateDateOptionBatchItemInput[];
}

export interface DateOptionBatchResult {
  count: number;
  items: DateOptionRecord[];
}

export type UpdateDateOptionInput = Partial<CreateDateOptionInput>;

export interface DateOptionListQuery {
  fromDate?: string;
  toDate?: string;
  locationId?: string;
  status?: DateOptionStatus;
  limit: number;
  offset: number;
}

export type AvailabilityState =
  | 'FREE'
  | 'SECOND_OPTION_AVAILABLE'
  | 'FIRST_OPTION_AVAILABLE'
  | 'FULLY_OPTIONED'
  | 'EVENT_OCCUPIED'
  | 'MANUAL_REVIEW';

export interface AvailabilityQuery {
  locationId: string;
  fromDate: string;
  toDate: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay?: boolean;
  weekdays?: number[];
  resultFilter: 'FREE_ONLY' | 'FREE_AND_SECOND_OPTION';
}

export interface AvailabilityResult {
  date: string;
  occupancyStartTime: string;
  occupancyEndTime: string;
  occupancyEndNextDay: boolean;
  state: AvailabilityState;
  selectable: boolean;
}

export interface ConvertDateOptionInput {
  sourceEventFormatId?: string;
  eventKind?: EventKind;
  locationId?: string;
  eventDate?: string;
  name?: string;
  description?: string | null;
  technicalGetInTime?: string | null;
  artistGetInTime?: string | null;
  doorsTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
  recordingSetting?: RecordingSetting;
}
