import { describe, expect, it, vi } from 'vitest';

import type { WorkerDatabaseService } from './infrastructure/worker-database.service.js';
import { WorkerLifecycleService } from './worker-lifecycle.service.js';

describe('WorkerLifecycleService', () => {
  it('waits for the database before becoming ready', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const database = { connect } as unknown as WorkerDatabaseService;
    const lifecycle = new WorkerLifecycleService(database);

    await lifecycle.onApplicationBootstrap();

    expect(connect).toHaveBeenCalledOnce();
  });
});
