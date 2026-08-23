import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EventOverridesDto } from '../../events/presentation/event.dto.js';

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const nullableText = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);

export class DateOptionFieldsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ type: String, format: 'date' })
  @Matches(localDatePattern)
  optionDate!: string;

  @ApiProperty({ type: String, example: '16:00' })
  @Matches(timePattern)
  occupancyStartTime!: string;

  @ApiProperty({ type: String, example: '23:00' })
  @Matches(timePattern)
  occupancyEndTime!: string;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  occupancyEndNextDay?: boolean;

  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601()
  validUntil!: string;
}

export class CreateDateOptionDto extends DateOptionFieldsDto {}

export class CreateDateOptionBatchItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ type: String, format: 'date' })
  @Matches(localDatePattern)
  optionDate!: string;

  @ApiProperty({ type: String, example: '16:00' })
  @Matches(timePattern)
  occupancyStartTime!: string;

  @ApiProperty({ type: String, example: '23:00' })
  @Matches(timePattern)
  occupancyEndTime!: string;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  occupancyEndNextDay?: boolean;

  @ApiProperty({ enum: ['FIRST', 'SECOND'] })
  @IsIn(['FIRST', 'SECOND'])
  rank!: 'FIRST' | 'SECOND';
}

export class CreateDateOptionBatchDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601()
  validUntil!: string;

  @ApiProperty({ type: [CreateDateOptionBatchItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateDateOptionBatchItemDto)
  options!: CreateDateOptionBatchItemDto[];
}

export class UpdateDateOptionDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(localDatePattern)
  optionDate?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(timePattern)
  occupancyStartTime?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Matches(timePattern)
  occupancyEndTime?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() occupancyEndNextDay?: boolean;
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}

export class VersionDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class ConvertDateOptionDto extends EventOverridesDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sourceEventFormatId?: string;
  @ApiPropertyOptional({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  @IsOptional()
  @IsIn(['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'])
  eventKind?: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(localDatePattern)
  eventDate?: string;
}

export class DateOptionListQueryDto {
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(localDatePattern)
  fromDate?: string;
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(localDatePattern)
  toDate?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED', 'UNAVAILABLE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED', 'UNAVAILABLE'])
  status?: 'ACTIVE' | 'CONVERTED' | 'RELEASED' | 'EXPIRED' | 'UNAVAILABLE';
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}

export class AvailabilityQueryDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID('4') locationId!: string;
  @ApiProperty({ type: String, format: 'date' }) @Matches(localDatePattern) fromDate!: string;
  @ApiProperty({ type: String, format: 'date' }) @Matches(localDatePattern) toDate!: string;
  @ApiProperty({ type: String }) @Matches(timePattern) occupancyStartTime!: string;
  @ApiProperty({ type: String }) @Matches(timePattern) occupancyEndTime!: string;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  occupancyEndNextDay?: boolean;
  @ApiPropertyOptional({ type: String, example: '1,4,5' })
  @Transform(({ value }) =>
    typeof value === 'string' && value ? value.split(',').map(Number) : undefined,
  )
  @IsOptional()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];
  @ApiPropertyOptional({ enum: ['FREE_ONLY', 'FREE_AND_SECOND_OPTION'], default: 'FREE_ONLY' })
  @IsOptional()
  @IsIn(['FREE_ONLY', 'FREE_AND_SECOND_OPTION'])
  resultFilter: 'FREE_ONLY' | 'FREE_AND_SECOND_OPTION' = 'FREE_ONLY';
}

export class DateOptionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) locationId!: string;
  @ApiProperty({ type: String }) locationName!: string;
  @ApiProperty({ type: String, format: 'date' }) optionDate!: string;
  @ApiProperty({ type: String }) occupancyStartTime!: string;
  @ApiProperty({ type: String }) occupancyEndTime!: string;
  @ApiProperty({ type: Boolean }) occupancyEndNextDay!: boolean;
  @ApiProperty({ enum: ['FIRST', 'SECOND'] }) rank!: 'FIRST' | 'SECOND';
  @ApiProperty({ type: String }) label!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) businessPartnerId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessPartnerName!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) contactId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) validUntil!: string;
  @ApiProperty({ enum: ['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED', 'UNAVAILABLE'] }) status!:
    'ACTIVE' | 'CONVERTED' | 'RELEASED' | 'EXPIRED' | 'UNAVAILABLE';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: Boolean }) canPromote!: boolean;
  @ApiProperty({ type: String, format: 'uuid' }) createdByMembershipId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class DateOptionPageDto {
  @ApiProperty({ type: [DateOptionDto] }) items!: DateOptionDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}

export class DateOptionBatchResultDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 50 }) count!: number;
  @ApiProperty({ type: [DateOptionDto] }) items!: DateOptionDto[];
}

export class AvailabilityResultDto {
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty({ type: String }) occupancyStartTime!: string;
  @ApiProperty({ type: String }) occupancyEndTime!: string;
  @ApiProperty({ type: Boolean }) occupancyEndNextDay!: boolean;
  @ApiProperty({
    enum: [
      'FREE',
      'SECOND_OPTION_AVAILABLE',
      'FIRST_OPTION_AVAILABLE',
      'FULLY_OPTIONED',
      'EVENT_OCCUPIED',
      'MANUAL_REVIEW',
    ],
  })
  state!:
    | 'FREE'
    | 'SECOND_OPTION_AVAILABLE'
    | 'FIRST_OPTION_AVAILABLE'
    | 'FULLY_OPTIONED'
    | 'EVENT_OCCUPIED'
    | 'MANUAL_REVIEW';
  @ApiProperty({ type: Boolean }) selectable!: boolean;
}
