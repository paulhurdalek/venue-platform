import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvironmentSchema, parseEnvironment } from '@venue/configuration';

import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { EventFormatsModule } from './event-formats/event-formats.module.js';
import { EventsModule } from './events/events.module.js';
import { DateOptionsModule } from './date-options/date-options.module.js';
import { DealsModule } from './deals/deals.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { SecurityModule } from './security/security.module.js';
import { SetupModule } from './setup/setup.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { ServicesModule } from './services/services.module.js';
import { RevenuePlanningModule } from './revenue/revenue-planning.module.js';
import { RevenueTemplatesModule } from './revenue-templates/revenue-templates.module.js';

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
    AuditModule,
    SecurityModule,
    SetupModule,
    PlatformModule,
    MasterDataModule,
    EventFormatsModule,
    EventsModule,
    DateOptionsModule,
    DealsModule,
    DocumentsModule,
    BookingsModule,
    ServicesModule,
    RevenuePlanningModule,
    RevenueTemplatesModule,
    HealthModule,
  ],
})
export class AppModule {}
