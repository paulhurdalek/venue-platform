import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createDatabaseClient,
  type DatabaseClient,
  type TransactionClient,
  withTransaction,
} from '@venue/database';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: DatabaseClient;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = createDatabaseClient(config.getOrThrow<string>('DATABASE_URL'));
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async transaction<T>(operation: (transaction: TransactionClient) => Promise<T>): Promise<T> {
    return withTransaction(this.client, operation);
  }
}
