import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { DealService } from './application/deal.service.js';
import {
  DealController,
  DealTemplateController,
  EventDealController,
} from './presentation/deal.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [EventDealController, DealController, DealTemplateController],
  providers: [DealService],
  exports: [DealService],
})
export class DealsModule {}
