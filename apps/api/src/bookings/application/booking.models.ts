import type {
  BookingStatus,
  HotelArrangement,
  LineupRole,
  ProgramItemKind,
} from '../domain/booking.rules.js';

export interface BookingHistoryRecord {
  id: string;
  previousStatus: BookingStatus;
  newStatus: BookingStatus;
  changedAt: string;
  actorUserId: string;
  actorName: string;
  note: string | null;
}

export interface BookingContactRecord {
  id: string;
  name: string;
  functionLabel: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  email: string | null;
  phone: string | null;
  mobile: string | null;
  roleNames: string[];
  isPrimary: boolean;
}

export interface BookingRecord {
  id: string;
  organizationId: string;
  eventId: string;
  artistId: string;
  artistName: string;
  artistStatus: 'ACTIVE' | 'ARCHIVED';
  artistEmail?: string | null;
  artistPhone?: string | null;
  hasActiveRepresentation: boolean;
  role: LineupRole;
  customRoleLabel: string | null;
  status: BookingStatus;
  lineupOrder: number;
  performanceStartMinutes: number | null;
  performanceDurationMinutes: number | null;
  internalNote: string | null;
  businessPartnerId?: string | null;
  businessPartnerName?: string | null;
  businessPartnerStatus?: 'ACTIVE' | 'ARCHIVED' | null;
  businessPartnerRoleNames?: string[];
  contactId?: string | null;
  contactName?: string | null;
  contactFunctionLabel?: string | null;
  contactStatus?: 'ACTIVE' | 'ARCHIVED' | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactMobile?: string | null;
  contactRoleNames?: string[];
  contactIsPrimary?: boolean;
  additionalContacts?: BookingContactRecord[];
  agreedFeeMinor?: string | null;
  agreedFeeCurrency?: string | null;
  travelArrangement: string | null;
  travelCostMinor?: string | null;
  travelCostCurrency?: string | null;
  hotelRequired: boolean;
  hotelArrangement: HotelArrangement;
  hotelBuyoutMinor?: string | null;
  hotelBuyoutCurrency?: string | null;
  hotelNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  statusHistory: BookingHistoryRecord[];
}

export interface BookingValues {
  artistId: string;
  role: LineupRole;
  customRoleLabel: string | null;
  normalizedCustomRoleLabel: string | null;
  performanceStartMinutes: number | null;
  performanceDurationMinutes: number | null;
  internalNote: string | null;
  businessPartnerId: string | null;
  contactId: string | null;
  agreedFeeMinor: bigint | null;
  agreedFeeCurrency: string | null;
  travelArrangement: string | null;
  travelCostMinor: bigint | null;
  travelCostCurrency: string | null;
  hotelRequired: boolean;
  hotelArrangement: HotelArrangement;
  hotelBuyoutMinor: bigint | null;
  hotelBuyoutCurrency: string | null;
  hotelNote: string | null;
}

export interface EventProgramItemRecord {
  id: string;
  organizationId: string;
  eventId: string;
  bookingId: string | null;
  kind: ProgramItemKind;
  sortOrder: number;
  label: string | null;
  durationMinutes: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  artistName: string | null;
  bookingRole: LineupRole | null;
  bookingCustomRoleLabel: string | null;
  bookingStatus: BookingStatus | null;
}

export interface EventProgramItemValues {
  bookingId: string | null;
  kind: ProgramItemKind;
  label: string | null;
  durationMinutes: number | null;
}

export interface LineupRequirementRecord {
  id: string;
  organizationId: string;
  role: LineupRole;
  customRoleLabel: string | null;
  requiredCount: number;
  defaultFeeMinor?: string | null;
  defaultFeeCurrency?: string | null;
  sortOrder: number;
  version: number;
  sourceEventFormatRequirementId?: string | null;
  sourceEventFormatRequirementVersion?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LineupRequirementValues {
  id?: string;
  version?: number;
  role: LineupRole;
  customRoleLabel: string | null;
  normalizedCustomRoleLabel: string | null;
  requiredCount: number;
  defaultFeeMinor: bigint | null;
  defaultFeeCurrency: string | null;
  sortOrder: number;
}

export interface BookingProgressRole {
  role: LineupRole;
  customRoleLabel: string | null;
  label: string;
  requiredCount: number;
  shortlistedCount: number;
  requestedCount: number;
  optionCount: number;
  confirmedCount: number;
  missingCount: number;
}

export interface BookingProgress {
  eventId: string;
  roles: BookingProgressRole[];
  totalOpenRequests: number;
  totalOptions: number;
  complete: boolean;
  moderatorRequired: boolean;
  moderatorConfirmed: boolean;
}

export type BookingProgressFilter =
  'INCOMPLETE' | 'MODERATOR_MISSING' | 'OPEN_REQUESTS' | 'HAS_OPTIONS' | 'FULLY_CONFIRMED';
