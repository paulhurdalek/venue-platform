import type { AccessContext } from '../../security/access.types.js';

export const BOOKING_CALCULATION_PROJECTION = Symbol('BOOKING_CALCULATION_PROJECTION');

/** Application boundary used by Booking persistence to invalidate a calculation atomically. */
export interface BookingCalculationProjectionPort {
  sourceChanged(
    transaction: object,
    access: AccessContext,
    eventId: string,
    bookingId: string,
    reason: string,
  ): Promise<void>;
}
