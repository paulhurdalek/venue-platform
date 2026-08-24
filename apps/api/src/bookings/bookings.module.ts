import { Module } from '@nestjs/common';

import { BOOKING_REPOSITORY } from './application/booking.repository.js';
import { BookingService } from './application/booking.service.js';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository.js';
import {
  BookingController,
  EventBookingsController,
  EventFormatLineupController,
  EventProgramItemController,
} from './presentation/booking.controller.js';

@Module({
  controllers: [
    EventBookingsController,
    BookingController,
    EventFormatLineupController,
    EventProgramItemController,
  ],
  providers: [
    BookingService,
    PrismaBookingRepository,
    { provide: BOOKING_REPOSITORY, useExisting: PrismaBookingRepository },
  ],
})
export class BookingsModule {}
