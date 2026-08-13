import { describe, expect, it } from 'vitest';

import type { DatabaseHealthPort } from './database-health.port.js';
import { GetHealthUseCase } from './get-health.use-case.js';

describe('GetHealthUseCase', () => {
  it('reports application and database independently', async () => {
    const database: DatabaseHealthPort = { isHealthy: async () => false };
    const result = await new GetHealthUseCase(database).execute();

    expect(result.status).toBe('degraded');
    expect(result.services.application.status).toBe('up');
    expect(result.services.database.status).toBe('down');
  });
});
