import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) legalName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class UpdateOrganizationDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsEmail() email?:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;
}

export class LocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) timezone!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) capacity!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine1!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) addressLine2!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) postalCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) city!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) state!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: Number }) version!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class UpdateLocationDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsInt() @Min(1) capacity?:
    number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsEmail() contactEmail?:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPhone?: string | null;
}

export class PermissionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) key!: string;
  @ApiProperty({ type: String }) description!: string;
}

export class RoleDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) key!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: [PermissionDto] }) permissions!: PermissionDto[];
}

export class MembershipOrganizationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}

export class MembershipDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String }) organizationName!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String, enum: ['ACTIVE', 'SUSPENDED'] }) status!: string;
  @ApiProperty({ type: String, enum: ['ALL', 'SELECTED'] }) locationScope!: string;
  @ApiProperty({ type: [String], format: 'uuid' }) locationIds!: string[];
  @ApiProperty({ type: [RoleDto] }) roles!: RoleDto[];
  @ApiProperty({ type: Number }) version!: number;
}

export class SessionContextDto {
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: [MembershipDto] }) memberships!: MembershipDto[];
}

export class UpdateMembershipStatusDto {
  @ApiProperty({ type: String, enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class AssignRolesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class AssignLocationScopeDto {
  @ApiProperty({ type: String, enum: ['ALL', 'SELECTED'] })
  @IsIn(['ALL', 'SELECTED'])
  scope!: 'ALL' | 'SELECTED';

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ValidateIf((object: AssignLocationScopeDto) => object.scope === 'SELECTED')
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  locationIds!: string[];

  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}

export class CreateInvitationDto {
  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiProperty({ type: String, enum: ['ALL', 'SELECTED'] })
  @IsIn(['ALL', 'SELECTED'])
  locationScope!: 'ALL' | 'SELECTED';

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ValidateIf((object: CreateInvitationDto) => object.locationScope === 'SELECTED')
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  locationIds!: string[];
}

export class InvitationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String, enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) acceptedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) revokedAt!:
    string | null;
  @ApiProperty({ type: String, enum: ['ALL', 'SELECTED'] }) locationScope!: string;
  @ApiProperty({ type: [String], format: 'uuid' }) locationIds!: string[];
  @ApiProperty({ type: [RoleDto] }) roles!: RoleDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class CreatedInvitationDto extends InvitationDto {
  @ApiProperty({
    type: String,
    description: 'Only returned once. The token is never persisted in raw form.',
  })
  invitationLink!: string;
}

export class InvitationValidationDto {
  @ApiProperty({ type: String, enum: ['VALID', 'INVALID', 'EXPIRED', 'REVOKED', 'USED'] })
  status!: string;
  @ApiPropertyOptional({ type: String }) email!: string | undefined;
  @ApiPropertyOptional({ type: String }) organizationName!: string | undefined;
  @ApiPropertyOptional({ type: Boolean }) existingUser!: boolean | undefined;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) expiresAt!: string | undefined;
}

export class AcceptInvitationDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(20) token!: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() passwordConfirmation?: string;
}

export class AcceptInvitationResultDto {
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) membershipId!: string;
  @ApiProperty({ type: Boolean }) createdUser!: boolean;
}

export class AuditEntryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) action!: string;
  @ApiProperty({ type: String }) targetType!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) targetId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) metadata!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) actorName!: string | null;
}

export class AuditQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class TokenQueryDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(20) token!: string;
}
