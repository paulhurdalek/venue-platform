import { Module } from '@nestjs/common';

import { EVENT_REPOSITORY } from './application/event.repository.js';
import { EventService } from './application/event.service.js';
import { PrismaEventRepository } from './infrastructure/prisma-event.repository.js';
import { EventController } from './presentation/event.controller.js';

@Module({
  controllers: [EventController],
  providers: [
    EventService,
    PrismaEventRepository,
    { provide: EVENT_REPOSITORY, useExisting: PrismaEventRepository },
  ],
})
export class EventsModule {}
