import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const nullableText = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);
const trimmedText = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

export class EventListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-08-01' })
  @IsOptional()
  @Matches(localDatePattern)
  fromDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-08-31' })
  @IsOptional()
  @Matches(localDatePattern)
  toDate?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  eventFormatId?: string;

  @ApiPropertyOptional({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  @IsOptional()
  @IsIn(['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'])
  eventKind?: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({
    enum: ['INCOMPLETE', 'MODERATOR_MISSING', 'OPEN_REQUESTS', 'HAS_OPTIONS', 'FULLY_CONFIRMED'],
  })
  @IsOptional()
  @IsIn(['INCOMPLETE', 'MODERATOR_MISSING', 'OPEN_REQUESTS', 'HAS_OPTIONS', 'FULLY_CONFIRMED'])
  booking?:
    'INCOMPLETE' | 'MODERATOR_MISSING' | 'OPEN_REQUESTS' | 'HAS_OPTIONS' | 'FULLY_CONFIRMED';

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

export class EventOverridesDto {
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @Transform(({ value }) => trimmedText(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '16:00' })
  @IsOptional()
  @Matches(timePattern)
  technicalGetInTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '17:30' })
  @IsOptional()
  @Matches(timePattern)
  artistGetInTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '19:00' })
  @IsOptional()
  @Matches(timePattern)
  doorsTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '20:00' })
  @IsOptional()
  @Matches(timePattern)
  startTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '01:30' })
  @IsOptional()
  @Matches(timePattern)
  endTime?: string | null;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  endNextDay?: boolean;

  @ApiPropertyOptional({ enum: ['UNSPECIFIED', 'ENABLED', 'DISABLED'] })
  @IsOptional()
  @IsIn(['UNSPECIFIED', 'ENABLED', 'DISABLED'])
  recordingSetting?: 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';
}

export class CreateEventDto extends EventOverridesDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sourceEventFormatId?: string;

  @ApiPropertyOptional({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  @IsOptional()
  @IsIn(['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'])
  eventKind?: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-08-23' })
  @Matches(localDatePattern)
  eventDate!: string;
}

export class UpdateEventDto extends EventOverridesDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-08-23' })
  @IsOptional()
  @Matches(localDatePattern)
  eventDate?: string;
}

export class UpdateEventStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] })
  @IsIn(['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
  status!: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
}

export class EventBookingSummaryDto {
  @ApiProperty({ type: Number }) artistRequiredCount!: number;
  @ApiProperty({ type: Number }) artistConfirmedCount!: number;
  @ApiProperty({ type: Boolean }) moderatorRequired!: boolean;
  @ApiProperty({ type: Boolean }) moderatorConfirmed!: boolean;
  @ApiProperty({ type: Number }) openRequestCount!: number;
  @ApiProperty({ type: Number }) optionCount!: number;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
  @ApiProperty({ type: Boolean }) fullyConfirmed!: boolean;
}

export class EventDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) locationId!: string;
  @ApiProperty({ type: String }) locationName!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'date' }) eventDate!: string;
  @ApiProperty({ enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] })
  status!: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;
  @ApiPropertyOptional({ enum: ['EVENT_FORMAT'], nullable: true })
  snapshotSource!: 'EVENT_FORMAT' | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceEventFormatId!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceEventFormatVersion!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) formatNameSnapshot!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  formatDescriptionSnapshot!: string | null;
  @ApiProperty({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  eventKind!: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) technicalGetInTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) artistGetInTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) doorsTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) startTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endTime!: string | null;
  @ApiProperty({ type: Boolean }) endNextDay!: boolean;
  @ApiProperty({ enum: ['UNSPECIFIED', 'ENABLED', 'DISABLED'] })
  recordingSetting!: 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';
  @ApiProperty({ type: String, example: 'Europe/Berlin' }) timezone!: string;
  @ApiProperty({ type: Boolean }) occupancyComplete!: boolean;
  @ApiProperty({ type: () => EventBookingSummaryDto }) bookingSummary!: EventBookingSummaryDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class EventPageDto {
  @ApiProperty({ type: [EventDto] }) items!: EventDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}
