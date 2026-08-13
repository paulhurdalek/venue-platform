import { ApiProperty } from '@nestjs/swagger';
import type { HealthStatus } from '@venue/shared';

class ServiceHealthDto {
  @ApiProperty({ type: String, enum: ['up', 'down'] })
  status!: 'up' | 'down';
}

class ServicesHealthDto {
  @ApiProperty({ type: () => ServiceHealthDto })
  application!: ServiceHealthDto;

  @ApiProperty({ type: () => ServiceHealthDto })
  database!: ServiceHealthDto;
}

export class HealthResponseDto implements HealthStatus {
  @ApiProperty({ type: String, enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ type: () => ServicesHealthDto })
  services!: ServicesHealthDto;
}
