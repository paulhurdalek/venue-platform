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

import {
  CALCULATION_STATUSES,
  COST_STATUSES,
  SERVICE_UNITS,
} from '../domain/service-calculation.rules.js';

const statuses = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;
const entityStatuses = ['ACTIVE', 'ARCHIVED'] as const;
const minorPattern = /^\d+$/;
const quantityPattern = /^\d+(?:[.,]\d{1,4})?$/;
const nullableText = (value: unknown) => (typeof value === 'string' ? value.trim() || null : value);
const optionalText = (value: unknown) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ServiceListBaseQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @Transform(({ value }) => optionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ enum: statuses, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(statuses)
  status: (typeof statuses)[number] = 'ACTIVE';

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

export class ServiceListQueryDto extends ServiceListBaseQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
}

export class CreateServiceCategoryDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
}

export class UpdateServiceCategoryDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
}

export class UpdateEntityStatusDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: entityStatuses })
  @IsIn(entityStatuses)
  status!: (typeof entityStatuses)[number];
}

export class CreateServiceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID('4') categoryId!: string;
  @ApiProperty({ type: String, maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
  @ApiProperty({ enum: SERVICE_UNITS }) @IsIn(SERVICE_UNITS) unit!: (typeof SERVICE_UNITS)[number];
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  defaultSalesPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNote?: string | null;
}

export class UpdateServiceDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ enum: SERVICE_UNITS })
  @IsOptional()
  @IsIn(SERVICE_UNITS)
  unit?: (typeof SERVICE_UNITS)[number];
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  defaultSalesPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNote?: string | null;
}

export class CreateProviderPriceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID('4') businessPartnerId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  purchasePriceMinor?: string | null;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  preferred?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNote?: string | null;
}

export class UpdateProviderPriceDto extends CreateProviderPriceDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  declare businessPartnerId: string;
}

export class CreateFormatServiceDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID('4') serviceId!: string;
  @ApiProperty({ type: String, pattern: '^\\d+(?:[.,]\\d{1,4})?$' })
  @Matches(quantityPattern)
  quantity!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  providerBusinessPartnerId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  purchasePriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  salesPriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}

export class UpdateFormatServiceDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  serviceId?: string;
  @ApiPropertyOptional({ type: String, pattern: '^\\d+(?:[.,]\\d{1,4})?$' })
  @IsOptional()
  @Matches(quantityPattern)
  quantity?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  providerBusinessPartnerId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  purchasePriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  salesPriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}

export class CreateEventPositionDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  sourceServiceId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  categoryName?: string;
  @ApiPropertyOptional({ enum: SERVICE_UNITS })
  @IsOptional()
  @IsIn(SERVICE_UNITS)
  unit?: (typeof SERVICE_UNITS)[number];
  @ApiProperty({ type: String, pattern: '^\\d+(?:[.,]\\d{1,4})?$' })
  @Matches(quantityPattern)
  quantity!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  providerBusinessPartnerId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  purchaseUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  salesUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ enum: COST_STATUSES, default: 'PLANNED' })
  @IsOptional()
  @IsIn(COST_STATUSES)
  costStatus?: (typeof COST_STATUSES)[number];
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;
}

export class UpdateEventPositionDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  sourceServiceId?: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  categoryName?: string;
  @ApiPropertyOptional({ enum: SERVICE_UNITS })
  @IsOptional()
  @IsIn(SERVICE_UNITS)
  unit?: (typeof SERVICE_UNITS)[number];
  @ApiPropertyOptional({ type: String, pattern: '^\\d+(?:[.,]\\d{1,4})?$' })
  @IsOptional()
  @Matches(quantityPattern)
  quantity?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  providerBusinessPartnerId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  purchaseUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(minorPattern)
  salesUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ enum: COST_STATUSES })
  @IsOptional()
  @IsIn(COST_STATUSES)
  costStatus?: (typeof COST_STATUSES)[number];
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;
}

export class ApplyEventPositionCatalogPricesDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class UpdateCalculationStatusDto {
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: CALCULATION_STATUSES })
  @IsIn(CALCULATION_STATUSES)
  status!: (typeof CALCULATION_STATUSES)[number];
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(({ value }) => nullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class ServiceCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) normalizedName!: string;
  @ApiProperty({ enum: entityStatuses }) status!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class ServiceCategoryPageDto {
  @ApiProperty({ type: [ServiceCategoryDto] }) items!: ServiceCategoryDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}

export class ServiceProviderPriceDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) serviceId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) businessPartnerId!: string;
  @ApiProperty({ type: String }) businessPartnerName!: string;
  @ApiProperty({ enum: entityStatuses }) businessPartnerStatus!: (typeof entityStatuses)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) purchasePriceMinor?: string | null;
  @ApiPropertyOptional({ enum: ['EUR'] }) currency?: 'EUR';
  @ApiProperty({ type: Boolean }) preferred!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) internalNote?: string | null;
  @ApiProperty({ enum: entityStatuses }) status!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class ServiceDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) categoryId!: string;
  @ApiProperty({ type: String }) categoryName!: string;
  @ApiProperty({ enum: entityStatuses }) categoryStatus!: (typeof entityStatuses)[number];
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) normalizedName!: string;
  @ApiProperty({ enum: SERVICE_UNITS }) unit!: (typeof SERVICE_UNITS)[number];
  @ApiPropertyOptional({ type: String, nullable: true }) defaultSalesPriceMinor?: string | null;
  @ApiPropertyOptional({ enum: ['EUR'] }) currency?: 'EUR';
  @ApiPropertyOptional({ type: String, nullable: true }) internalNote?: string | null;
  @ApiPropertyOptional({ type: () => ServiceProviderPriceDto, nullable: true })
  preferredProvider?: ServiceProviderPriceDto | null;
  @ApiPropertyOptional({ type: [ServiceProviderPriceDto] })
  providerPrices?: ServiceProviderPriceDto[];
  @ApiProperty({ enum: entityStatuses }) status!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class ServicePageDto {
  @ApiProperty({ type: [ServiceDto] }) items!: ServiceDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}

export class EventFormatServiceDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventFormatId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) serviceId!: string;
  @ApiProperty({ type: String }) serviceName!: string;
  @ApiProperty({ enum: entityStatuses }) serviceStatus!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) serviceVersion!: number;
  @ApiProperty({ type: String }) categoryName!: string;
  @ApiProperty({ enum: SERVICE_UNITS }) unit!: (typeof SERVICE_UNITS)[number];
  @ApiProperty({ type: String }) quantity!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  providerBusinessPartnerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerName!: string | null;
  @ApiPropertyOptional({ enum: entityStatuses, nullable: true }) providerStatus!:
    (typeof entityStatuses)[number] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) purchasePriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) salesPriceOverrideMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedPurchasePriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) resolvedSalesPriceMinor?: string | null;
  @ApiPropertyOptional({ enum: ['EUR'] }) currency?: 'EUR';
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ enum: entityStatuses }) status!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class EventServicePositionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) calculationId!: string;
  @ApiProperty({ enum: ['EVENT_FORMAT', 'SERVICE_CATALOG', 'CUSTOM'] }) source!:
    'EVENT_FORMAT' | 'SERVICE_CATALOG' | 'CUSTOM';
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) sourceServiceId!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceServiceVersion!: number | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  sourceEventFormatServiceId!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) sourceEventFormatServiceVersion!:
    number | null;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) categoryName!: string;
  @ApiProperty({ enum: SERVICE_UNITS }) unit!: (typeof SERVICE_UNITS)[number];
  @ApiProperty({ type: String }) quantity!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  providerBusinessPartnerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) purchaseUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) purchaseTotalMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) salesUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) salesTotalMinor?: string | null;
  @ApiPropertyOptional({ enum: ['EUR'] }) currency?: 'EUR';
  @ApiProperty({ enum: COST_STATUSES }) costStatus!: (typeof COST_STATUSES)[number];
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ enum: entityStatuses }) status!: (typeof entityStatuses)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class EventPositionCatalogPricePreviewDto {
  @ApiProperty({ type: String, format: 'uuid' }) positionId!: string;
  @ApiProperty({ type: Number }) positionVersion!: number;
  @ApiProperty({ enum: ['EVENT_FORMAT', 'SERVICE_CATALOG'] }) source!:
    'EVENT_FORMAT' | 'SERVICE_CATALOG';
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  providerBusinessPartnerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) providerName!: string | null;
  @ApiProperty({ type: Boolean }) providerWillBeApplied!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) purchaseUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: Boolean }) purchaseWillBeApplied?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) salesUnitPriceMinor?: string | null;
  @ApiPropertyOptional({ type: Boolean }) salesWillBeApplied?: boolean;
}

export class BookingCostDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) bookingId!: string;
  @ApiProperty({ enum: ['FEE', 'TRAVEL', 'HOTEL_BUYOUT'] }) kind!:
    'FEE' | 'TRAVEL' | 'HOTEL_BUYOUT';
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: String }) artistName!: string;
  @ApiProperty({ type: String }) bookingStatus!: string;
  @ApiProperty({ enum: COST_STATUSES }) costStatus!: (typeof COST_STATUSES)[number];
  @ApiPropertyOptional({ type: String }) amountMinor?: string;
  @ApiPropertyOptional({ enum: ['EUR'] }) currency?: 'EUR';
}

export class CalculationTotalsDto {
  @ApiPropertyOptional({ type: String }) estimatedCostMinor?: string;
  @ApiPropertyOptional({ type: String }) committedCostMinor?: string;
  @ApiPropertyOptional({ type: String }) plannedCostMinor?: string;
  @ApiPropertyOptional({ type: String }) servicePurchaseValueMinor?: string;
  @ApiPropertyOptional({ type: String }) serviceSalesValueMinor?: string;
  @ApiPropertyOptional({ type: String }) serviceMarginMinor?: string;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
  @ApiProperty({ type: [String] }) missingPurchasePricePositionIds!: string[];
  @ApiProperty({ type: [String] }) missingSalesPricePositionIds!: string[];
}

export class CalculationStatusHistoryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CALCULATION_STATUSES })
  previousStatus!: (typeof CALCULATION_STATUSES)[number];
  @ApiProperty({ enum: CALCULATION_STATUSES }) newStatus!: (typeof CALCULATION_STATUSES)[number];
  @ApiProperty({ type: String }) actorName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) changedSourceType!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) changedSourceId!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) changedAt!: string;
}

export class EventCalculationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String }) eventName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) locationId!: string;
  @ApiProperty({ enum: CALCULATION_STATUSES }) status!: (typeof CALCULATION_STATUSES)[number];
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) approvedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) approvedByName!: string | null;
  @ApiProperty({ type: [EventServicePositionDto] }) positions!: EventServicePositionDto[];
  @ApiProperty({ type: [BookingCostDto] }) bookingCosts!: BookingCostDto[];
  @ApiProperty({ type: () => CalculationTotalsDto }) totals!: CalculationTotalsDto;
  @ApiProperty({ type: [CalculationStatusHistoryDto] }) history!: CalculationStatusHistoryDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
