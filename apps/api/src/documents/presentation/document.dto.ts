import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
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
  DOCUMENT_POSITION_SOURCES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
} from '../domain/document.rules.js';

const minorPattern = /^\d+$/;
const quantityPattern = /^\d+(?:[.,]\d{1,3})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const discountTypes = ['FIXED', 'PERCENTAGE'] as const;
const documentManualStatuses = DOCUMENT_STATUSES.filter((status) => status !== 'ARCHIVIERT');

export class DocumentBlockInputDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MaxLength(200)
  heading!: string;

  @ApiProperty({ type: String, maxLength: 20000 })
  @IsString()
  @MaxLength(20_000)
  body!: string;
}

export class DocumentTemplateInputDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  type!: (typeof DOCUMENT_TYPES)[number];

  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  introduction?: string | null;

  @ApiProperty({ type: [DocumentBlockInputDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DocumentBlockInputDto)
  blocks!: DocumentBlockInputDto[];

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  standardTerms?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  closing?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  footer?: string | null;
}

export class UpdateDocumentTemplateDto extends DocumentTemplateInputDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class SetDocumentTemplateStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';
}

export class CreateDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  type!: (typeof DOCUMENT_TYPES)[number];

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4')
  templateId!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  dealId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
}

export class OfferPositionInputDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  id?: string | null;

  @ApiProperty({ enum: DOCUMENT_POSITION_SOURCES })
  @IsIn(DOCUMENT_POSITION_SOURCES)
  source!: (typeof DOCUMENT_POSITION_SOURCES)[number];

  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MaxLength(300)
  description!: string;

  @ApiProperty({ type: String, pattern: '^\\d+(?:[.,]\\d{1,3})?$' })
  @Matches(quantityPattern)
  quantity!: string;

  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @Matches(minorPattern)
  unitPriceNetMinor!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  taxRateBasisPoints!: number;

  @ApiPropertyOptional({ enum: discountTypes, nullable: true })
  @IsOptional()
  @IsIn(discountTypes)
  discountType?: (typeof discountTypes)[number] | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  discountFixedMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  discountPercentageBasisPoints?: number | null;
}

export class UpdateDocumentDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  introduction?: string | null;

  @ApiProperty({ type: [DocumentBlockInputDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DocumentBlockInputDto)
  blocks!: DocumentBlockInputDto[];

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  standardTerms?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  closing?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  footer?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientContactName?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 320, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  recipientEmail?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  recipientAddress?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  @IsOptional()
  @Matches(datePattern)
  validUntil?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  internalNote?: string | null;

  @ApiPropertyOptional({ enum: discountTypes, nullable: true })
  @IsOptional()
  @IsIn(discountTypes)
  totalDiscountType?: (typeof discountTypes)[number] | null;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+$', nullable: true })
  @IsOptional()
  @Matches(minorPattern)
  totalDiscountFixedMinor?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  totalDiscountPercentageBasisPoints?: number | null;

  @ApiProperty({ type: [OfferPositionInputDto], maxItems: 300 })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => OfferPositionInputDto)
  positions!: OfferPositionInputDto[];
}

export class SetDocumentStatusDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ enum: documentManualStatuses })
  @IsIn(documentManualStatuses)
  status!: Exclude<(typeof DOCUMENT_STATUSES)[number], 'ARCHIVIERT'>;
}

export class PublishDocumentDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;
}

export class DocumentRevisionDto {
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ enum: DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: (typeof DOCUMENT_TYPES)[number];

  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  status?: (typeof DOCUMENT_STATUSES)[number];

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(datePattern)
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Matches(datePattern)
  to?: string;
}

export class ListDocumentTemplatesQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';

  @ApiPropertyOptional({ enum: DOCUMENT_TYPES })
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: (typeof DOCUMENT_TYPES)[number];
}

export class DocumentTemplateDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: DOCUMENT_TYPES }) type!: (typeof DOCUMENT_TYPES)[number];
  @ApiProperty({ type: String }) title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) introduction!: string | null;
  @ApiProperty({ type: [DocumentBlockInputDto] }) blocks!: DocumentBlockInputDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) standardTerms!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) closing!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) footer!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: 'ACTIVE' | 'ARCHIVED';
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class DocumentOfferPositionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DOCUMENT_POSITION_SOURCES })
  source!: (typeof DOCUMENT_POSITION_SOURCES)[number];
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) sourceId!: string | null;
  @ApiProperty({ type: String }) description!: string;
  @ApiProperty({ type: String }) quantity!: string;
  @ApiProperty({ type: String }) unitPriceNetMinor!: string;
  @ApiProperty({ type: Number }) taxRateBasisPoints!: number;
  @ApiPropertyOptional({ enum: discountTypes, nullable: true }) discountType!:
    (typeof discountTypes)[number] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) discountFixedMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) discountPercentageBasisPoints!:
    number | null;
  @ApiProperty({ type: Number }) sortOrder!: number;
  @ApiProperty({ type: Boolean }) differsFromSource!: boolean;
  @ApiProperty({ type: String }) subtotalNetMinor!: string;
  @ApiProperty({ type: String }) discountNetMinor!: string;
  @ApiProperty({ type: String }) totalNetMinor!: string;
  @ApiProperty({ type: String }) taxMinor!: string;
  @ApiProperty({ type: String }) totalGrossMinor!: string;
}

export class DocumentTotalsDto {
  @ApiProperty({ type: String }) subtotalNetMinor!: string;
  @ApiProperty({ type: String }) positionDiscountNetMinor!: string;
  @ApiProperty({ type: String }) totalDiscountNetMinor!: string;
  @ApiProperty({ type: String }) totalNetMinor!: string;
  @ApiProperty({ type: String }) taxMinor!: string;
  @ApiProperty({ type: String }) totalGrossMinor!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  taxGroups!: Array<Record<string, unknown>>;
}

export class DocumentVersionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: Number }) documentVersion!: number;
  @ApiProperty({ type: String }) documentNumber!: string;
  @ApiProperty({ enum: DOCUMENT_STATUSES }) status!: (typeof DOCUMENT_STATUSES)[number];
  @ApiProperty({ type: 'object', additionalProperties: true }) snapshot!: Record<string, unknown>;
  @ApiProperty({ type: String }) pdfSha256!: string;
  @ApiProperty({ type: Number }) pdfSize!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String }) downloadPath!: string;
}

export class DocumentDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) locationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String }) eventName!: string;
  @ApiProperty({ type: String }) eventDate!: string;
  @ApiProperty({ type: String }) locationName!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) dealId!: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) sourceTemplateId!: string;
  @ApiProperty({ type: Number }) sourceTemplateVersion!: number;
  @ApiProperty({ type: String }) sourceTemplateName!: string;
  @ApiProperty({ enum: DOCUMENT_TYPES }) type!: (typeof DOCUMENT_TYPES)[number];
  @ApiProperty({ enum: DOCUMENT_STATUSES }) status!: (typeof DOCUMENT_STATUSES)[number];
  @ApiProperty({ enum: DOCUMENT_STATUSES }) effectiveStatus!: (typeof DOCUMENT_STATUSES)[number];
  @ApiProperty({ type: Boolean }) expired!: boolean;
  @ApiProperty({ type: String, nullable: true }) documentNumber!: string | null;
  @ApiProperty({ type: Number }) publishedVersion!: number;
  @ApiProperty({ type: Number }) revision!: number;
  @ApiProperty({ type: String }) title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) introduction!: string | null;
  @ApiProperty({ type: [DocumentBlockInputDto] }) blocks!: DocumentBlockInputDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) standardTerms!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) closing!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) footer!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recipientName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recipientContactName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recipientEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) recipientAddress!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) validUntil!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) internalNote!: string | null;
  @ApiPropertyOptional({ enum: discountTypes, nullable: true }) totalDiscountType!:
    (typeof discountTypes)[number] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) totalDiscountFixedMinor!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) totalDiscountPercentageBasisPoints!:
    number | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) contextSnapshot!: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: [DocumentOfferPositionDto] }) positions!: DocumentOfferPositionDto[];
  @ApiPropertyOptional({ type: DocumentTotalsDto, nullable: true })
  totals!: DocumentTotalsDto | null;
  @ApiProperty({ type: [DocumentVersionDto] }) versions!: DocumentVersionDto[];
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastPublishedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
