import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvironmentSchema, parseEnvironment } from '@venue/configuration';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '../../.env'],
      isGlobal: true,
      validate: (environment) => parseEnvironment(apiEnvironmentSchema, environment),
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
