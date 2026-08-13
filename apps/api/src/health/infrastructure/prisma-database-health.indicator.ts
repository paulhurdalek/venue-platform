import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { DatabaseHealthPort } from '../application/database-health.port.js';

@Injectable()
export class PrismaDatabaseHealthIndicator implements DatabaseHealthPort {
  private readonly logger = new Logger(PrismaDatabaseHealthIndicator.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.ping();
      return true;
    } catch {
      this.logger.warn('Database health check failed');
      return false;
    }
  }
}
