import { Module } from '@nestjs/common';

import { EVENT_FORMAT_REPOSITORY } from './application/event-format.repository.js';
import { EventFormatService } from './application/event-format.service.js';
import { PrismaEventFormatRepository } from './infrastructure/prisma-event-format.repository.js';
import { EventFormatController } from './presentation/event-format.controller.js';

@Module({
  controllers: [EventFormatController],
  providers: [
    EventFormatService,
    PrismaEventFormatRepository,
    { provide: EVENT_FORMAT_REPOSITORY, useExisting: PrismaEventFormatRepository },
  ],
})
export class EventFormatsModule {}
