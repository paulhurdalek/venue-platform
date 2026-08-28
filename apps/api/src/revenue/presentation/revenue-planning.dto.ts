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

const minorPattern = /^\d+$/;

export class TicketTierInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  expectedQuantity!: number;

  @ApiPropertyOptional({ enum: ['NET', 'GROSS'], nullable: true })
  @IsOptional()
  @IsIn(['NET', 'GROSS'])
  baseInputType?: 'NET' | 'GROSS' | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  baseInputMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  baseTaxRateBasisPoints?: number | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  baseTaxRateTemplateId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  sourceTicketProviderTemplateId?: string | null;

  @ApiPropertyOptional({ type: () => [TicketComponentInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketComponentInputDto)
  components?: TicketComponentInputDto[];

  @ApiPropertyOptional({ type: Number, minimum: 0, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateTicketTierDto extends TicketTierInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class RevenueAllocationInputDto {
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
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalRecipientName?: string | null;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] })
  @IsIn(['FIXED', 'PERCENTAGE'])
  allocationType!: 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentageBasisPoints?: number | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  fixedAmountMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class TicketComponentInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] })
  @IsIn(['FIXED', 'PERCENTAGE'])
  amountType!: 'FIXED' | 'PERCENTAGE';

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  percentageRateBasisPoints?: number | null;

  @ApiProperty({ enum: ['NET', 'GROSS'] })
  @IsIn(['NET', 'GROSS'])
  inputType!: 'NET' | 'GROSS';

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  inputAmountMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100000, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  taxRateBasisPoints?: number;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  taxRateTemplateId!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  guestPays!: boolean;

  @ApiPropertyOptional({ type: Number, minimum: 0, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ type: [RevenueAllocationInputDto], maxItems: 100 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevenueAllocationInputDto)
  allocations!: RevenueAllocationInputDto[];
}

export class UpdateTicketComponentDto extends TicketComponentInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class AdditionalRevenueInputDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
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
  @Matches(minorPattern)
  inputAmountMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  percentageRateBasisPoints?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100000, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  taxRateBasisPoints?: number;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  taxRateTemplateId!: string;

  @ApiProperty({ enum: ['PLANNED', 'CONFIRMED'] })
  @IsIn(['PLANNED', 'CONFIRMED'])
  confirmationStatus!: 'PLANNED' | 'CONFIRMED';

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAdditionalRevenueDto extends AdditionalRevenueInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class SetRevenueEntityStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class MoveRevenueEntityDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['UP', 'DOWN'] })
  @IsIn(['UP', 'DOWN'])
  direction!: 'UP' | 'DOWN';
}

export class TemplateRecipientResolutionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  allocationId!: string;

  @ApiProperty({ enum: ['REMOVE', 'REPLACE'] })
  @IsIn(['REMOVE', 'REPLACE'])
  action!: 'REMOVE' | 'REPLACE';

  @ApiPropertyOptional({ enum: ['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'] })
  @IsOptional()
  @IsIn(['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'])
  recipientType?: 'ORGANIZATION' | 'ARTIST' | 'BUSINESS_PARTNER' | 'EXTERNAL';

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  artistId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 160, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalRecipientName?: string | null;
}

export class PreviewCalculationTemplateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  calculationTemplateId!: string;
}

export class ApplyCalculationTemplateDto extends PreviewCalculationTemplateDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  calculationVersion!: number;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  confirmReplacement!: boolean;

  @ApiPropertyOptional({ type: [TemplateRecipientResolutionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateRecipientResolutionDto)
  recipientResolutions?: TemplateRecipientResolutionDto[];
}

export class CalculationTemplatePreviewDto {
  @ApiProperty({ type: String, format: 'uuid' }) templateId!: string;
  @ApiProperty({ type: String }) templateName!: string;
  @ApiProperty({ type: Number }) templateVersion!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) expectedGuestCount!: number | null;
  @ApiProperty({ type: Number }) tierCount!: number;
  @ApiProperty({ type: Number }) componentCount!: number;
  @ApiProperty({ type: Number }) additionalRevenueCount!: number;
  @ApiProperty({ type: Number }) existingTierCount!: number;
  @ApiProperty({ type: Number }) existingAdditionalRevenueCount!: number;
  @ApiProperty({ type: Boolean }) replacementRequired!: boolean;
  @ApiProperty({ type: [Object] }) invalidRecipients!: object[];
}

export class SetExpectedGuestsDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  eventVersion!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedGuestCount!: number | null;
}

export class RevenueAllocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['ORGANIZATION', 'ARTIST', 'BUSINESS_PARTNER', 'EXTERNAL'] })
  recipientType!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) recipientId!:
    string | null;
  @ApiProperty({ type: String }) recipientName!: string;
  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] }) allocationType!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) percentageBasisPoints!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) fixedAmountMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedNetUnitMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedGrossUnitMinor!: string | null;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
}

export class TicketPriceComponentDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: ['FIXED', 'PERCENTAGE'] }) amountType!: string;
  @ApiPropertyOptional({ enum: ['TICKET_BASE_GROSS'], nullable: true }) percentageBasis!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) percentageRateBasisPoints!: number | null;
  @ApiProperty({ enum: ['NET', 'GROSS'] }) inputType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) inputAmountMinor!: string | null;
  @ApiProperty({ type: Number }) taxRateBasisPoints!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) taxRateTemplateId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) taxRateTemplateVersion!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxRateNameSnapshot!: string | null;
  @ApiProperty({ type: Boolean }) guestPays!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) netUnitMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) grossUnitMinor!: string | null;
  @ApiProperty({ type: Boolean }) allocationComplete!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) allocationDifferenceGrossMinor!:
    string | null;
  @ApiProperty({ type: [RevenueAllocationDto] }) allocations!: RevenueAllocationDto[];
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
}

export class TicketPriceTierDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) expectedQuantity!: number;
  @ApiPropertyOptional({ enum: ['NET', 'GROSS'], nullable: true }) baseInputType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) baseInputMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) baseNetUnitMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) baseGrossUnitMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) baseTaxRateBasisPoints!: number | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) baseTaxRateTemplateId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) baseTaxRateTemplateVersion!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) baseTaxRateNameSnapshot!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceTicketProviderTemplateId!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceTicketProviderTemplateVersion!:
    number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceTicketProviderNameSnapshot!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endCustomerUnitGrossMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalBaseNetMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalBaseGrossMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalEndCustomerGrossMinor!: string | null;
  @ApiProperty({ type: [TicketPriceComponentDto] }) components!: TicketPriceComponentDto[];
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
}

export class AdditionalRevenueDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({
    enum: ['FIXED', 'PER_EXPECTED_GUEST', 'PER_PAYING_TICKET', 'PERCENT_TICKET_BASE_NET'],
  })
  calculationType!: string;
  @ApiProperty({ enum: ['NET', 'GROSS'] }) inputType!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) inputAmountMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) percentageRateBasisPoints!: number | null;
  @ApiProperty({ type: Number }) taxRateBasisPoints!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) taxRateTemplateId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) taxRateTemplateVersion!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxRateNameSnapshot!: string | null;
  @ApiProperty({ enum: ['PLANNED', 'CONFIRMED'] }) confirmationStatus!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) resolvedQuantity!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) calculationBasisMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalNetMinor!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalGrossMinor!: string | null;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
}

export class RevenueApprovalBlockerDto {
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) message!: string;
  @ApiProperty({ enum: ['TICKET_TIER', 'TICKET_COMPONENT', 'ADDITIONAL_REVENUE', 'EVENT'] })
  targetType!: string;
  @ApiProperty({ type: String, format: 'uuid' }) targetId!: string;
}

export class RevenuePlanTotalsDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) expectedGuests!: number | null;
  @ApiProperty({ type: Number }) expectedTickets!: number;
  @ApiProperty({ type: Number }) expectedPayingTickets!: number;
  @ApiProperty({ type: String }) ticketEndCustomerGrossMinor!: string;
  @ApiProperty({ type: String }) ticketBaseNetMinor!: string;
  @ApiProperty({ type: String }) ticketBaseGrossMinor!: string;
  @ApiProperty({ type: String }) ownTicketRevenueNetMinor!: string;
  @ApiProperty({ type: String }) ownTicketRevenueGrossMinor!: string;
  @ApiProperty({ type: String }) artistPartnerShareNetMinor!: string;
  @ApiProperty({ type: String }) artistPartnerShareGrossMinor!: string;
  @ApiProperty({ type: String }) externalPassThroughNetMinor!: string;
  @ApiProperty({ type: String }) externalPassThroughGrossMinor!: string;
  @ApiProperty({ type: String }) additionalRevenueNetMinor!: string;
  @ApiProperty({ type: String }) additionalRevenueGrossMinor!: string;
  @ApiProperty({ type: String }) phase7PlannedCostNetMinor!: string;
  @ApiProperty({ type: String }) operatingResultNetMinor!: string;
  @ApiProperty({ type: String }) costBasisLabel!: string;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
  @ApiProperty({ type: [RevenueApprovalBlockerDto] })
  approvalBlockers!: RevenueApprovalBlockerDto[];
}

export class RevenuePlanDto {
  @ApiProperty({ type: String, format: 'uuid' }) calculationId!: string;
  @ApiProperty({ type: Number }) calculationVersion!: number;
  @ApiProperty({ enum: ['DRAFT', 'REVIEW', 'APPROVED'] }) calculationStatus!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: Number }) eventVersion!: number;
  @ApiProperty({ type: String }) eventName!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) expectedGuestCount!: number | null;
  @ApiProperty({ enum: ['EUR'] }) currency!: 'EUR';
  @ApiProperty({ type: [TicketPriceTierDto] }) ticketTiers!: TicketPriceTierDto[];
  @ApiProperty({ type: [AdditionalRevenueDto] }) additionalRevenues!: AdditionalRevenueDto[];
  @ApiProperty({ type: RevenuePlanTotalsDto }) totals!: RevenuePlanTotalsDto;
}
