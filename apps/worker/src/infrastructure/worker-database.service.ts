import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseClient, type DatabaseClient } from '@venue/database';

@Injectable()
export class WorkerDatabaseService implements OnModuleDestroy {
  private readonly client: DatabaseClient;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = createDatabaseClient(config.getOrThrow<string>('DATABASE_URL'));
  }

  async connect(): Promise<void> {
    await this.client.$connect();
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
