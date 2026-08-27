import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const nullableText = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);
const trimmedText = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

export class EventFormatListQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  @IsOptional()
  @IsIn(['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'])
  eventKind?: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset = 0;
}

export class CreateEventFormatDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => trimmedText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  @IsIn(['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'])
  eventKind!: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';

  @ApiPropertyOptional({ type: String, nullable: true, example: '16:00' })
  @IsOptional()
  @Matches(timePattern)
  defaultTechnicalGetInTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '17:30' })
  @IsOptional()
  @Matches(timePattern)
  defaultArtistGetInTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '19:00' })
  @IsOptional()
  @Matches(timePattern)
  defaultDoorsTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '20:00' })
  @IsOptional()
  @Matches(timePattern)
  defaultStartTime?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '01:30' })
  @IsOptional()
  @Matches(timePattern)
  defaultEndTime?: string | null;

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  defaultEndNextDay?: boolean;

  @ApiPropertyOptional({ enum: ['UNSPECIFIED', 'ENABLED', 'DISABLED'], default: 'UNSPECIFIED' })
  @IsOptional()
  @IsIn(['UNSPECIFIED', 'ENABLED', 'DISABLED'])
  recordingDefault?: 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  defaultCalculationTemplateId?: string | null;
}

export class UpdateEventFormatDto extends PartialType(CreateEventFormatDto) {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateEventFormatStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class EventFormatDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) normalizedName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'] })
  eventKind!: 'OWN_PRODUCTION' | 'THIRD_PARTY_EVENT';
  @ApiPropertyOptional({ type: String, nullable: true, example: '16:00' })
  defaultTechnicalGetInTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '17:30' })
  defaultArtistGetInTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '19:00' })
  defaultDoorsTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '20:00' })
  defaultStartTime!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '01:30' })
  defaultEndTime!: string | null;
  @ApiProperty({ type: Boolean }) defaultEndNextDay!: boolean;
  @ApiProperty({ enum: ['UNSPECIFIED', 'ENABLED', 'DISABLED'] })
  recordingDefault!: 'UNSPECIFIED' | 'ENABLED' | 'DISABLED';
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  defaultCalculationTemplateId!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: string | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class EventFormatPageDto {
  @ApiProperty({ type: [EventFormatDto] }) items!: EventFormatDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}
