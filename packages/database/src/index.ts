import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

import { PrismaClient, type Prisma } from './generated/prisma/client.js';

export { Prisma, PrismaClient } from './generated/prisma/client.js';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const poolConfiguration: PoolConfig & { pipeline: boolean } = {
    connectionString: databaseUrl,
    pipeline: true,
  };
  const pool = new Pool(poolConfiguration);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({ adapter });
}

export type TransactionClient = Prisma.TransactionClient;

export async function withTransaction<T>(
  client: DatabaseClient,
  operation: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(operation);
}
