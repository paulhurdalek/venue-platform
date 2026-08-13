import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ type: String, example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ type: String, example: 'Request validation failed' })
  message!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiProperty({ type: String, example: '01HZX3Q4Y7R4Y6RDXP7T6W4KM2' })
  requestId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;
}
