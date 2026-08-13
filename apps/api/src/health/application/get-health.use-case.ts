import { Inject, Injectable } from '@nestjs/common';
import type { HealthStatus } from '@venue/shared';

import { DATABASE_HEALTH_PORT, type DatabaseHealthPort } from './database-health.port.js';

@Injectable()
export class GetHealthUseCase {
  constructor(
    @Inject(DATABASE_HEALTH_PORT)
    private readonly databaseHealth: DatabaseHealthPort,
  ) {}

  async execute(): Promise<HealthStatus> {
    const databaseIsHealthy = await this.databaseHealth.isHealthy();

    return {
      status: databaseIsHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        application: { status: 'up' },
        database: { status: databaseIsHealthy ? 'up' : 'down' },
      },
    };
  }
}
