import { Module } from '@nestjs/common';

import { DATABASE_HEALTH_PORT } from './application/database-health.port.js';
import { GetHealthUseCase } from './application/get-health.use-case.js';
import { PrismaDatabaseHealthIndicator } from './infrastructure/prisma-database-health.indicator.js';
import { HealthController } from './presentation/health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [
    GetHealthUseCase,
    PrismaDatabaseHealthIndicator,
    {
      provide: DATABASE_HEALTH_PORT,
      useExisting: PrismaDatabaseHealthIndicator,
    },
  ],
})
export class HealthModule {}
