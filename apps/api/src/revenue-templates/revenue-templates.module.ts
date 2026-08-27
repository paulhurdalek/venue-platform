import { Module } from '@nestjs/common';

import { RevenueTemplateService } from './application/revenue-template.service.js';
import { RevenueTemplateController } from './presentation/revenue-template.controller.js';

@Module({
  controllers: [RevenueTemplateController],
  providers: [RevenueTemplateService],
  exports: [RevenueTemplateService],
})
export class RevenueTemplatesModule {}
