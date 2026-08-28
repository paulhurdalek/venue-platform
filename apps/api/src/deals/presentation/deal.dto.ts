import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

import {
  DEAL_BILLING_MODES,
  DEAL_COMPONENT_TYPES,
  DEAL_DISCOUNT_TYPES,
  DEAL_STATUSES,
} from '../domain/deal.rules.js';

const minorPattern = /^\d+$/;
const quantityPattern = /^\d+(?:[.,]\d{1,3})?$/;
const serviceUnits = [
  'PIECE',
  'HOUR',
  'DAY',
  'PERSON',
  'FLAT_RATE',
  'PER_GUEST',
  'PER_TICKET',
] as const;

export class DealDiscountInputDto {
  @ApiPropertyOptional({ enum: DEAL_DISCOUNT_TYPES, nullable: true })
  @IsOptional()
  @IsIn(DEAL_DISCOUNT_TYPES)
  type?: 'FIXED' | 'PERCENTAGE' | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  fixedMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentageBasisPoints?: number | null;
}

export class DealComponentInputDto {
  @ApiProperty({ enum: DEAL_COMPONENT_TYPES })
  @IsIn(DEAL_COMPONENT_TYPES)
  type!: 'FIXED_RENT' | 'REVENUE_SHARE' | 'MINIMUM_GUARANTEE_SHARE';

  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  amountNetMinor?: string | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  minimumGuaranteeNetMinor?: string | null;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  taxRateBasisPoints!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  locationShareBasisPoints?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  counterpartyShareBasisPoints?: number | null;

  @ApiProperty({ type: Boolean, default: false })
  @IsBoolean()
  includeWkz!: boolean;
}

export class DealServicePositionInputDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  sourceServiceId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: serviceUnits })
  @IsOptional()
  @IsIn(serviceUnits)
  unit?: (typeof serviceUnits)[number];

  @ApiProperty({ type: String, pattern: '^\\d+(?:[.,]\\d{1,3})?$' })
  @Matches(quantityPattern)
  quantity!: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  salesUnitPriceNetMinor?: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  internalUnitCostNetMinor?: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  taxRateBasisPoints!: number;

  @ApiProperty({ enum: DEAL_BILLING_MODES })
  @IsIn(DEAL_BILLING_MODES)
  billingMode!: 'SEPARATELY_BILLABLE' | 'INCLUDED';

  @ApiPropertyOptional({ type: DealDiscountInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealDiscountInputDto)
  discount?: DealDiscountInputDto;
}

export class CreateDealDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  businessPartnerId!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  templateId?: string | null;

  @ApiPropertyOptional({ type: [DealComponentInputDto], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealComponentInputDto)
  components?: DealComponentInputDto[];

  @ApiPropertyOptional({ type: [DealServicePositionInputDto], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealServicePositionInputDto)
  servicePositions?: DealServicePositionInputDto[];

  @ApiPropertyOptional({ type: DealDiscountInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealDiscountInputDto)
  totalDiscount?: DealDiscountInputDto;
}

export class UpdateDealDto extends CreateDealDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateDealStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: DEAL_STATUSES })
  @IsIn(DEAL_STATUSES)
  status!: (typeof DEAL_STATUSES)[number];
}

export class DealTemplateInputDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string | null;

  @ApiProperty({ type: [DealComponentInputDto], maxItems: 100 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealComponentInputDto)
  components!: DealComponentInputDto[];

  @ApiProperty({ type: [DealServicePositionInputDto], maxItems: 200 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealServicePositionInputDto)
  servicePositions!: DealServicePositionInputDto[];

  @ApiPropertyOptional({ type: DealDiscountInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DealDiscountInputDto)
  totalDiscount?: DealDiscountInputDto;
}

export class UpdateDealTemplateDto extends DealTemplateInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class SetDealTemplateStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class DealTemplateApplicationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  templateId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  confirmReplacement!: boolean;
}

export class DealComponentDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DEAL_COMPONENT_TYPES }) type!: (typeof DEAL_COMPONENT_TYPES)[number];
  @ApiProperty({ type: String }) label!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) amountNetMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) minimumGuaranteeNetMinor!: string | null;
  @ApiProperty({ type: Number }) taxRateBasisPoints!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) locationShareBasisPoints!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) counterpartyShareBasisPoints!:
    number | null;
  @ApiProperty({ type: Boolean }) includeWkz!: boolean;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ type: Number }) version!: number;
}

export class DealServicePositionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) sourceServiceId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceServiceVersion!: number | null;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: serviceUnits }) unit!: (typeof serviceUnits)[number];
  @ApiProperty({ type: String }) quantity!: string;
  @ApiProperty({ type: String }) salesUnitPriceNetMinor!: string;
  @ApiProperty({ type: String }) internalUnitCostNetMinor!: string;
  @ApiProperty({ type: Number }) taxRateBasisPoints!: number;
  @ApiProperty({ enum: DEAL_BILLING_MODES }) billingMode!: (typeof DEAL_BILLING_MODES)[number];
  @ApiPropertyOptional({ enum: DEAL_DISCOUNT_TYPES, nullable: true }) discountType!:
    'FIXED' | 'PERCENTAGE' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) discountFixedMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) discountPercentageBasisPoints!:
    number | null;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ type: Number }) version!: number;
}

export class DealSummaryComponentDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ enum: DEAL_COMPONENT_TYPES }) type!: (typeof DEAL_COMPONENT_TYPES)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) splitBasisMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) calculatedLocationShareMinor!:
    string | null;
  @ApiProperty({ type: String }) effectiveLocationAmountMinor!: string;
  @ApiProperty({ type: String }) effectiveGrossMinor!: string;
  @ApiProperty({ enum: ['FIXED_RENT', 'REVENUE_SHARE', 'MINIMUM_GUARANTEE', 'CALCULATED_SHARE'] })
  appliedRule!: string;
}

export class DealSummaryDto {
  @ApiProperty({ type: String }) ticketNetRevenueMinor!: string;
  @ApiProperty({ type: String }) wkzNetRevenueMinor!: string;
  @ApiProperty({ type: String }) fixedRentNetMinor!: string;
  @ApiProperty({ type: String }) billableServiceSubtotalNetMinor!: string;
  @ApiProperty({ type: String }) positionDiscountNetMinor!: string;
  @ApiProperty({ type: String }) totalDiscountNetMinor!: string;
  @ApiProperty({ type: String }) billableServicesNetMinor!: string;
  @ApiProperty({ type: String }) customerAmountNetMinor!: string;
  @ApiProperty({ type: String }) customerAmountGrossMinor!: string;
  @ApiProperty({ type: String }) expectedLocationShareNetMinor!: string;
  @ApiProperty({ type: String }) internalCostNetMinor!: string;
  @ApiProperty({ type: String }) expectedOperatingResultNetMinor!: string;
  @ApiProperty({ type: [DealSummaryComponentDto] }) components!: DealSummaryComponentDto[];
}

export class DealDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String }) eventName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) businessPartnerId!: string;
  @ApiProperty({ type: String }) customerName!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) contactId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactName!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) sourceTemplateId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceTemplateVersion!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceTemplateName!: string | null;
  @ApiProperty({ enum: DEAL_STATUSES }) status!: (typeof DEAL_STATUSES)[number];
  @ApiPropertyOptional({ enum: DEAL_DISCOUNT_TYPES, nullable: true }) totalDiscountType!:
    'FIXED' | 'PERCENTAGE' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalDiscountFixedMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) totalDiscountPercentageBasisPoints!:
    number | null;
  @ApiProperty({ type: String, enum: ['EUR'] }) currency!: 'EUR';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: [DealComponentDto] }) components!: DealComponentDto[];
  @ApiProperty({ type: [DealServicePositionDto] }) servicePositions!: DealServicePositionDto[];
  @ApiProperty({ type: DealSummaryDto }) summary!: DealSummaryDto;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class DealTemplateDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: [DealComponentDto] }) components!: DealComponentDto[];
  @ApiProperty({ type: [DealServicePositionDto] }) servicePositions!: DealServicePositionDto[];
  @ApiPropertyOptional({ enum: DEAL_DISCOUNT_TYPES, nullable: true }) totalDiscountType!:
    'FIXED' | 'PERCENTAGE' | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalDiscountFixedMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) totalDiscountPercentageBasisPoints!:
    number | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class DealTemplatePreviewDto extends DealTemplateDto {
  @ApiProperty({ type: Boolean }) replacesExistingSnapshot!: boolean;
  @ApiProperty({ type: String }) replacementMessage!: string;
}
