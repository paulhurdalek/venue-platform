import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvironmentSchema, parseEnvironment } from '@venue/configuration';

import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { SecurityModule } from './security/security.module.js';
import { SetupModule } from './setup/setup.module.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '../../.env'],
      isGlobal: true,
      validate: (environment) => parseEnvironment(apiEnvironmentSchema, environment),
    }),
    DatabaseModule,
    AuthModule,
    SecurityModule,
    SetupModule,
    PlatformModule,
    HealthModule,
  ],
})
export class AppModule {}
