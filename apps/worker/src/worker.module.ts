import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment, workerEnvironmentSchema } from '@venue/configuration';

import { WorkerDatabaseService } from './infrastructure/worker-database.service.js';
import { WorkerLifecycleService } from './worker-lifecycle.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '../../.env'],
      isGlobal: true,
      validate: (environment) => parseEnvironment(workerEnvironmentSchema, environment),
    }),
  ],
  providers: [WorkerDatabaseService, WorkerLifecycleService],
})
export class WorkerModule {}
