import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { WorkerDatabaseService } from './infrastructure/worker-database.service.js';

@Injectable()
export class WorkerLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerLifecycleService.name);

  constructor(@Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.database.connect();
    this.logger.log({ event: 'worker.ready', ready: true });
    process.send?.('ready');
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.log({ event: 'worker.stopped', signal: signal ?? 'application-close' });
  }
}
