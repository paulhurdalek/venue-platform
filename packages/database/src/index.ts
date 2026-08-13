import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, type Prisma } from './generated/prisma/client.js';

export { Prisma, PrismaClient } from './generated/prisma/client.js';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type TransactionClient = Prisma.TransactionClient;

export async function withTransaction<T>(
  client: DatabaseClient,
  operation: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(operation);
}
