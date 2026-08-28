import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = (value: unknown) => (typeof value === 'string' ? value.trim() : value);
const nullableTrim = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);

export class TemplateStatusQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';
}

export class TaxRateTemplateInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ type: Number, minimum: 0, description: 'Hundertstel Prozent' })
  @IsInt()
  @Min(0)
  rateBasisPoints!: number;
}

export class UpdateTaxRateTemplateDto extends TaxRateTemplateInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateRevenueTemplateStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class RevenueTemplateAllocationInputDto {
  @ApiProperty({ enum: ['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'] })
  @IsIn(['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'])
  recipientType!: 'ORGANIZATION' | 'ARTIST' | 'BUSINESS_PARTNER' | 'EXTERNAL';

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  artistId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 160, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalRecipientName?: string | null;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] })
  @IsIn(['FIXED', 'PERCENTAGE'])
  allocationType!: 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  percentageBasisPoints?: number | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @IsString()
  fixedAmountMinor?: string | null;
}

export class RevenueTemplateComponentInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] })
  @IsIn(['FIXED', 'PERCENTAGE'])
  amountType!: 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  percentageRateBasisPoints?: number | null;

  @ApiProperty({ enum: ['NET', 'GROSS'] })
  @IsIn(['NET', 'GROSS'])
  inputType!: 'NET' | 'GROSS';

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @IsString()
  inputAmountMinor?: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  taxRateTemplateId!: string;

  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  guestPays?: boolean;

  @ApiPropertyOptional({ type: [RevenueTemplateAllocationInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevenueTemplateAllocationInputDto)
  allocations?: RevenueTemplateAllocationInputDto[];
}

export class TicketProviderTemplateInputDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({ type: [RevenueTemplateComponentInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevenueTemplateComponentInputDto)
  components!: RevenueTemplateComponentInputDto[];
}

export class UpdateTicketProviderTemplateDto extends TicketProviderTemplateInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class DuplicateRevenueTemplateDto {
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
}

export class CalculationTemplateTierInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedQuantity?: number;

  @ApiPropertyOptional({ enum: ['NET', 'GROSS'], nullable: true })
  @IsOptional()
  @IsIn(['NET', 'GROSS'])
  baseInputType?: 'NET' | 'GROSS' | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @IsString()
  baseInputMinor?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  baseTaxRateTemplateId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  sourceTicketProviderTemplateId?: string | null;

  @ApiPropertyOptional({ type: [RevenueTemplateComponentInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevenueTemplateComponentInputDto)
  components?: RevenueTemplateComponentInputDto[];
}

export class CalculationTemplateAdditionalRevenueInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiProperty({
    enum: ['FIXED', 'PER_EXPECTED_GUEST', 'PER_PAYING_TICKET', 'PERCENT_TICKET_BASE_NET'],
  })
  @IsIn(['FIXED', 'PER_EXPECTED_GUEST', 'PER_PAYING_TICKET', 'PERCENT_TICKET_BASE_NET'])
  calculationType!:
    'FIXED' | 'PER_EXPECTED_GUEST' | 'PER_PAYING_TICKET' | 'PERCENT_TICKET_BASE_NET';

  @ApiProperty({ enum: ['NET', 'GROSS'] })
  @IsIn(['NET', 'GROSS'])
  inputType!: 'NET' | 'GROSS';

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @IsString()
  inputAmountMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  percentageRateBasisPoints?: number | null;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  taxRateTemplateId!: string;

  @ApiPropertyOptional({ enum: ['PLANNED', 'CONFIRMED'], default: 'PLANNED' })
  @IsOptional()
  @IsIn(['PLANNED', 'CONFIRMED'])
  confirmationStatus?: 'PLANNED' | 'CONFIRMED';

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;
}

export class CalculationTemplateInputDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedGuestCount?: number | null;

  @ApiProperty({ type: [CalculationTemplateTierInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculationTemplateTierInputDto)
  tiers!: CalculationTemplateTierInputDto[];

  @ApiProperty({ type: [CalculationTemplateAdditionalRevenueInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculationTemplateAdditionalRevenueInputDto)
  additionalRevenues!: CalculationTemplateAdditionalRevenueInputDto[];
}

export class UpdateCalculationTemplateDto extends CalculationTemplateInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class SaveEventCalculationTemplateDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}

export class TaxRateTemplateDto extends TaxRateTemplateInputDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class TicketProviderTemplateDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: [Object] }) components!: object[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class CalculationTemplateDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) expectedGuestCount!: number | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: [Object] }) tiers!: object[];
  @ApiProperty({ type: [Object] }) additionalRevenues!: object[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
