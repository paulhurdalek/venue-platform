import { Module } from '@nestjs/common';

import { DATE_OPTION_REPOSITORY } from './application/date-option.repository.js';
import { DateOptionService } from './application/date-option.service.js';
import { PrismaDateOptionRepository } from './infrastructure/prisma-date-option.repository.js';
import {
  AvailabilityController,
  DateOptionController,
} from './presentation/date-option.controller.js';

@Module({
  controllers: [DateOptionController, AvailabilityController],
  providers: [
    DateOptionService,
    PrismaDateOptionRepository,
    { provide: DATE_OPTION_REPOSITORY, useExisting: PrismaDateOptionRepository },
  ],
})
export class DateOptionsModule {}
