import { Module } from '@nestjs/common';

import { BOOKING_CALCULATION_PROJECTION } from './application/booking-calculation-projection.port.js';
import { BOOKING_REPOSITORY } from './application/booking.repository.js';
import { BookingService } from './application/booking.service.js';
import { PrismaBookingCalculationProjection } from './infrastructure/prisma-booking-calculation-projection.js';
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
    PrismaBookingCalculationProjection,
    { provide: BOOKING_REPOSITORY, useExisting: PrismaBookingRepository },
    { provide: BOOKING_CALCULATION_PROJECTION, useExisting: PrismaBookingCalculationProjection },
  ],
})
export class BookingsModule {}
