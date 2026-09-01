import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const statuses = [
  'SHORTLISTED',
  'REQUESTED',
  'OPTION',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
] as const;
const roles = ['ARTIST', 'MODERATOR', 'OTHER'] as const;
const hotelArrangements = ['NONE', 'REQUIRED', 'BUYOUT'] as const;
const programItemKinds = ['PERFORMANCE', 'BREAK'] as const;
const currencyPattern = /^[A-Za-z]{3}$/;
const minorPattern = /^\d+$/;
const nullableText = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);

export class BookingListQueryDto {
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  includeHistorical = false;
}

export class CreateBookingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  artistId!: string;

  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: (typeof roles)[number];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customRoleLabel?: string | null;

  @ApiPropertyOptional({ enum: statuses, default: 'SHORTLISTED' })
  @IsOptional()
  @IsIn(statuses)
  status?: (typeof statuses)[number];

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 2879,
    deprecated: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2879)
  performanceStartMinutes?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 1440,
    deprecated: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  performanceDurationMinutes?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNote?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  agreedFeeMinor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @Matches(currencyPattern)
  agreedFeeCurrency?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  travelArrangement?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  travelCostMinor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @Matches(currencyPattern)
  travelCostCurrency?: string | null;

  @ApiPropertyOptional({ type: Boolean, deprecated: true })
  @IsOptional()
  @IsBoolean()
  hotelRequired?: boolean;

  @ApiPropertyOptional({ enum: hotelArrangements })
  @IsOptional()
  @IsIn(hotelArrangements)
  hotelArrangement?: (typeof hotelArrangements)[number];

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  hotelBuyoutMinor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @Matches(currencyPattern)
  hotelBuyoutCurrency?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hotelNote?: string | null;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  confirmDuplicateArtist?: boolean;
}

export class UpdateBookingDto extends PartialType(
  OmitType(CreateBookingDto, ['artistId', 'status', 'confirmDuplicateArtist'] as const),
) {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: statuses })
  @IsIn(statuses)
  status!: (typeof statuses)[number];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  confirmReactivation?: boolean;
}

export class LineupOrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  bookingId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateLineupOrderDto {
  @ApiProperty({ type: [LineupOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineupOrderItemDto)
  items!: LineupOrderItemDto[];
}

export class CreateEventProgramItemDto {
  @ApiProperty({ enum: programItemKinds })
  @IsIn(programItemKinds)
  kind!: (typeof programItemKinds)[number];

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  bookingId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number | null;
}

export class UpdateEventProgramItemDto extends PartialType(
  OmitType(CreateEventProgramItemDto, ['kind', 'bookingId'] as const),
) {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class EventProgramOrderItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  itemId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateEventProgramOrderDto {
  @ApiProperty({ type: [EventProgramOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventProgramOrderItemDto)
  items!: EventProgramOrderItemDto[];
}

export class LineupRequirementInputDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ enum: roles })
  @IsIn(roles)
  role!: (typeof roles)[number];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customRoleLabel?: string | null;

  @ApiProperty({ type: Number, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  requiredCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  defaultFeeMinor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @Matches(currencyPattern)
  defaultFeeCurrency?: string | null;
}

export class ReplaceLineupRequirementsDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: [LineupRequirementInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineupRequirementInputDto)
  items!: LineupRequirementInputDto[];
}

export class BookingStatusHistoryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: statuses }) previousStatus!: (typeof statuses)[number];
  @ApiProperty({ enum: statuses }) newStatus!: (typeof statuses)[number];
  @ApiProperty({ type: String, format: 'date-time' }) changedAt!: string;
  @ApiProperty({ type: String, format: 'uuid' }) actorUserId!: string;
  @ApiProperty({ type: String }) actorName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
}

export class BookingContactDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) functionLabel!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ type: [String] }) roleNames!: string[];
  @ApiProperty({ type: Boolean }) isPrimary!: boolean;
}

export class BookingDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) artistId!: string;
  @ApiProperty({ type: String }) artistName!: string;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) artistStatus!: 'ACTIVE' | 'ARCHIVED';
  @ApiPropertyOptional({ type: String, nullable: true }) artistEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) artistPhone?: string | null;
  @ApiProperty({ type: Boolean }) hasActiveRepresentation!: boolean;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) customRoleLabel!: string | null;
  @ApiProperty({ enum: statuses }) status!: (typeof statuses)[number];
  @ApiProperty({ type: Number }) lineupOrder!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, deprecated: true })
  performanceStartMinutes!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, deprecated: true })
  performanceDurationMinutes!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) internalNote!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) businessPartnerId?:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessPartnerName?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'], nullable: true }) businessPartnerStatus?:
    'ACTIVE' | 'ARCHIVED' | null;
  @ApiPropertyOptional({ type: [String] }) businessPartnerRoleNames?: string[];
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) contactId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactFunctionLabel?: string | null;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'], nullable: true }) contactStatus?:
    'ACTIVE' | 'ARCHIVED' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactMobile?: string | null;
  @ApiPropertyOptional({ type: [String] }) contactRoleNames?: string[];
  @ApiPropertyOptional({ type: Boolean }) contactIsPrimary?: boolean;
  @ApiPropertyOptional({ type: [BookingContactDto] }) additionalContacts?: BookingContactDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) agreedFeeMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) agreedFeeCurrency?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) travelArrangement!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) travelCostMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) travelCostCurrency?: string | null;
  @ApiProperty({ type: Boolean, deprecated: true }) hotelRequired!: boolean;
  @ApiProperty({ enum: hotelArrangements })
  hotelArrangement!: (typeof hotelArrangements)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) hotelBuyoutMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hotelBuyoutCurrency?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) hotelNote!: string | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [BookingStatusHistoryDto] }) statusHistory!: BookingStatusHistoryDto[];
}

export class EventProgramItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) bookingId!: string | null;
  @ApiProperty({ enum: programItemKinds }) kind!: (typeof programItemKinds)[number];
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) label!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) durationMinutes!: number | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) artistName!: string | null;
  @ApiPropertyOptional({ enum: roles, nullable: true }) bookingRole!: (typeof roles)[number] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bookingCustomRoleLabel!: string | null;
  @ApiPropertyOptional({ enum: statuses, nullable: true }) bookingStatus!:
    (typeof statuses)[number] | null;
}

export class LineupRequirementDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) customRoleLabel!: string | null;
  @ApiProperty({ type: Number }) requiredCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) defaultFeeMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) defaultFeeCurrency?: string | null;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceEventFormatRequirementId?: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  sourceEventFormatRequirementVersion?: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class LineupRequirementSetDto {
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: [LineupRequirementDto] }) items!: LineupRequirementDto[];
}

export class BookingProgressRoleDto {
  @ApiProperty({ enum: roles }) role!: (typeof roles)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) customRoleLabel!: string | null;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: Number }) requiredCount!: number;
  @ApiProperty({ type: Number }) shortlistedCount!: number;
  @ApiProperty({ type: Number }) requestedCount!: number;
  @ApiProperty({ type: Number }) optionCount!: number;
  @ApiProperty({ type: Number }) confirmedCount!: number;
  @ApiProperty({ type: Number }) missingCount!: number;
}

export class BookingProgressDto {
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: [BookingProgressRoleDto] }) roles!: BookingProgressRoleDto[];
  @ApiProperty({ type: Number }) totalOpenRequests!: number;
  @ApiProperty({ type: Number }) totalOptions!: number;
  @ApiProperty({ type: Boolean }) complete!: boolean;
  @ApiProperty({ type: Boolean }) moderatorRequired!: boolean;
  @ApiProperty({ type: Boolean }) moderatorConfirmed!: boolean;
}
