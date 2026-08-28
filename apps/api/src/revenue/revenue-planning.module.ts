import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RevenuePlanningService } from './application/revenue-planning.service.js';
import { REVENUE_PLANNING_REPOSITORY } from './application/revenue-planning.repository.js';
import { PrismaRevenuePlanningRepository } from './infrastructure/prisma-revenue-planning.repository.js';
import {
  EventRevenuePlanningController,
  RevenuePlanningResourcesController,
} from './presentation/revenue-planning.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [EventRevenuePlanningController, RevenuePlanningResourcesController],
  providers: [
    RevenuePlanningService,
    PrismaRevenuePlanningRepository,
    { provide: REVENUE_PLANNING_REPOSITORY, useExisting: PrismaRevenuePlanningRepository },
  ],
  exports: [RevenuePlanningService],
})
export class RevenuePlanningModule {}
