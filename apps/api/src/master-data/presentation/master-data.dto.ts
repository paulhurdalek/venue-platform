import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const nullableString = (value: unknown) =>
  typeof value === 'string' ? value.trim() || null : value;
const countryCode = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() || null : value;

export class MasterDataListQueryDto {
  @ApiPropertyOptional({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @ApiPropertyOptional({ type: String, enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : (value as unknown),
  )
  @IsOptional()
  @IsBoolean()
  incomplete?: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleKey?: string;

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

class MutableArtistDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  stageName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{2}$' })
  @Transform(({ value }) => countryCode(value))
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  instagram?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class CreateArtistDto extends MutableArtistDto {}

export class UpdateArtistDto extends MutableArtistDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

class MutableContactDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mobile?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class CreateContactDto extends MutableContactDto {}

export class UpdateContactDto extends MutableContactDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

class MutableBusinessPartnerDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  companyName?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{2}$' })
  @Transform(({ value }) => countryCode(value))
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingAddressLine1?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  billingAddressLine2?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(30)
  billingPostalCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  billingCity?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  billingState?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^[A-Z]{2}$' })
  @Transform(({ value }) => countryCode(value))
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  billingCountryCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vatId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => nullableString(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class CreateBusinessPartnerDto extends MutableBusinessPartnerDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  declare companyName: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', default: [] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[] = [];
}

export class UpdateBusinessPartnerDto extends MutableBusinessPartnerDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class UpdateEntityStatusDto {
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status!: 'ACTIVE' | 'ARCHIVED';

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class VersionQueryDto {
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class CreateContactAssociationDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID('4') contactId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

export class AssignAssociationRolesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class AssignBusinessPartnerRolesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class MasterDataRoleDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) key!: string;
  @ApiProperty({ type: String }) name!: string;
}

export class ContactSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) firstName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) label!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) mobile!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
}

export class ContactAssociationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: () => ContactSummaryDto }) contact!: ContactSummaryDto;
  @ApiProperty({ type: [MasterDataRoleDto] }) roles!: MasterDataRoleDto[];
}

export class ArtistDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) stageName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) firstName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine1!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) postalCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) state!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) instagram!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) website!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: Boolean }) incomplete!: boolean;
  @ApiProperty({ type: [ContactAssociationDto] }) contacts!: ContactAssociationDto[];
}

export class ArtistPageDto {
  @ApiProperty({ type: [ArtistDto] }) items!: ArtistDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}

export class LinkedEntityDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) entityId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [MasterDataRoleDto] }) roles!: MasterDataRoleDto[];
}

export class ContactDto extends ContactSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [LinkedEntityDto] }) artistLinks!: LinkedEntityDto[];
  @ApiProperty({ type: [LinkedEntityDto] }) businessPartnerLinks!: LinkedEntityDto[];
}

export class ContactPageDto {
  @ApiProperty({ type: [ContactDto] }) items!: ContactDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}

export class BusinessPartnerDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) companyName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine1!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) postalCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) state!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingAddressLine1!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingAddressLine2!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingPostalCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingCity!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingState!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) billingCountryCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) vatId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) website!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [MasterDataRoleDto] }) roles!: MasterDataRoleDto[];
  @ApiProperty({ type: [ContactAssociationDto] }) contacts!: ContactAssociationDto[];
}

export class BusinessPartnerPageDto {
  @ApiProperty({ type: [BusinessPartnerDto] }) items!: BusinessPartnerDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) limit!: number;
  @ApiProperty({ type: Number }) offset!: number;
}
