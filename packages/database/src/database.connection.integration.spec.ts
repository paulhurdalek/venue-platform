import { afterAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PostgreSQL connection', () => {
  let client: DatabaseClient | undefined;

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('executes a real query against the isolated test database', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const result = await client.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;

    expect(result).toEqual([{ value: 1 }]);
  });
});
