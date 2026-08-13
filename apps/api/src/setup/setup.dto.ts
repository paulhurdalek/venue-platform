import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BootstrapTokenQueryDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(20) token!: string;
}

export class BootstrapStatusDto {
  @ApiProperty({ type: String, enum: ['VALID', 'INVALID', 'EXPIRED', 'USED', 'UNAVAILABLE'] })
  status!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) expiresAt!: string | undefined;
}

export class CompleteBootstrapDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  administratorName!: string;

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String }) @IsString() @MinLength(10) @MaxLength(128) password!: string;
  @ApiProperty({ type: String }) @IsString() passwordConfirmation!: string;
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  organizationName!: string;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() @MaxLength(160) locationName!: string;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() @MaxLength(100) timezone!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(20) token!: string;
}

export class CompleteBootstrapResultDto {
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) organizationId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) locationId!: string;
}
