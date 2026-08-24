import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { createDtoValidationPipe } from '../../common/http/dto-validation.pipe.js';
import { CurrentAccess, RequirePermission } from '../../security/access.decorator.js';
import { AccessGuard } from '../../security/access.guard.js';
import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import { BookingService } from '../application/booking.service.js';
import {
  BookingDto,
  BookingListQueryDto,
  BookingProgressDto,
  CreateEventProgramItemDto,
  CreateBookingDto,
  EventProgramItemDto,
  LineupRequirementSetDto,
  ReplaceLineupRequirementsDto,
  UpdateBookingDto,
  UpdateBookingStatusDto,
  UpdateEventProgramItemDto,
  UpdateEventProgramOrderDto,
  UpdateLineupOrderDto,
} from './booking.dto.js';

@ApiTags('bookings and lineup')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'eventId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events/:eventId', version: '1' })
export class EventBookingsController {
  constructor(@Inject(BookingService) private readonly bookings: BookingService) {}

  @Get('bookings')
  @RequirePermission(PERMISSIONS.BOOKINGS_READ)
  @ApiQuery({ name: 'includeHistorical', required: false, type: Boolean })
  @ApiOkResponse({ type: [BookingDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query(createDtoValidationPipe(BookingListQueryDto)) query: BookingListQueryDto,
  ): Promise<BookingDto[]> {
    return this.bookings.list(access, eventId, query.includeHistorical);
  }

  @Post('bookings')
  @RequirePermission(PERMISSIONS.BOOKINGS_WRITE)
  @ApiBody({ type: CreateBookingDto })
  @ApiCreatedResponse({ type: BookingDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(CreateBookingDto)) body: CreateBookingDto,
  ): Promise<BookingDto> {
    return this.bookings.create(access, eventId, body);
  }

  @Get('program-items')
  @RequirePermission(PERMISSIONS.BOOKINGS_READ)
  @ApiOkResponse({ type: [EventProgramItemDto] })
  programItems(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<EventProgramItemDto[]> {
    return this.bookings.listProgramItems(access, eventId);
  }

  @Post('program-items')
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: CreateEventProgramItemDto })
  @ApiCreatedResponse({ type: EventProgramItemDto })
  createProgramItem(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(CreateEventProgramItemDto)) body: CreateEventProgramItemDto,
  ): Promise<EventProgramItemDto> {
    return this.bookings.createProgramItem(access, eventId, body);
  }

  @Put('program/order')
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: UpdateEventProgramOrderDto })
  @ApiOkResponse({ type: [EventProgramItemDto] })
  reorderProgramItems(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(UpdateEventProgramOrderDto)) body: UpdateEventProgramOrderDto,
  ): Promise<EventProgramItemDto[]> {
    return this.bookings.reorderProgramItems(access, eventId, body.items);
  }

  @Get('booking-progress')
  @RequirePermission(PERMISSIONS.BOOKINGS_READ)
  @ApiOkResponse({ type: BookingProgressDto })
  progress(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<BookingProgressDto> {
    return this.bookings.progress(access, eventId);
  }

  @Put('lineup/order')
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: UpdateLineupOrderDto })
  @ApiOkResponse({ type: [BookingDto] })
  reorder(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(UpdateLineupOrderDto)) body: UpdateLineupOrderDto,
  ): Promise<BookingDto[]> {
    return this.bookings.reorder(access, eventId, body.items);
  }

  @Get('lineup-requirements')
  @RequirePermission(PERMISSIONS.BOOKINGS_READ)
  @ApiOkResponse({ type: LineupRequirementSetDto })
  requirements(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<LineupRequirementSetDto> {
    return this.bookings.getEventRequirements(access, eventId);
  }

  @Put('lineup-requirements')
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: ReplaceLineupRequirementsDto })
  @ApiOkResponse({ type: LineupRequirementSetDto })
  replaceRequirements(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(ReplaceLineupRequirementsDto)) body: ReplaceLineupRequirementsDto,
  ): Promise<LineupRequirementSetDto> {
    return this.bookings.replaceEventRequirements(access, eventId, body.version, body.items);
  }
}

@ApiTags('bookings and lineup')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'bookingId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/bookings/:bookingId', version: '1' })
export class BookingController {
  constructor(@Inject(BookingService) private readonly bookings: BookingService) {}

  @Get()
  @RequirePermission(PERMISSIONS.BOOKINGS_READ)
  @ApiOkResponse({ type: BookingDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<BookingDto> {
    return this.bookings.find(access, bookingId);
  }

  @Patch()
  @RequirePermission(PERMISSIONS.BOOKINGS_WRITE)
  @ApiBody({ type: UpdateBookingDto })
  @ApiOkResponse({ type: BookingDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body(createDtoValidationPipe(UpdateBookingDto)) body: UpdateBookingDto,
  ): Promise<BookingDto> {
    const { version, ...input } = body;
    return this.bookings.update(access, bookingId, version, input);
  }

  @Patch('status')
  @RequirePermission(PERMISSIONS.BOOKINGS_STATUS)
  @ApiBody({ type: UpdateBookingStatusDto })
  @ApiOkResponse({ type: BookingDto })
  status(
    @CurrentAccess() access: AccessContext,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body(createDtoValidationPipe(UpdateBookingStatusDto)) body: UpdateBookingStatusDto,
  ): Promise<BookingDto> {
    return this.bookings.setStatus(
      access,
      bookingId,
      body.version,
      body.status,
      body.note,
      body.confirmReactivation ?? false,
    );
  }
}

@ApiTags('bookings and lineup')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'itemId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/program-items/:itemId', version: '1' })
export class EventProgramItemController {
  constructor(@Inject(BookingService) private readonly bookings: BookingService) {}

  @Patch()
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: UpdateEventProgramItemDto })
  @ApiOkResponse({ type: EventProgramItemDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(createDtoValidationPipe(UpdateEventProgramItemDto)) body: UpdateEventProgramItemDto,
  ): Promise<EventProgramItemDto> {
    const { version, ...input } = body;
    return this.bookings.updateProgramItem(access, itemId, version, input);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiQuery({ name: 'version', required: true, type: Number })
  async remove(
    @CurrentAccess() access: AccessContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('version') version: string,
  ): Promise<void> {
    const parsedVersion = Number(version);
    if (!Number.isInteger(parsedVersion) || parsedVersion < 1) {
      throw new UnprocessableEntityException({
        code: 'PROGRAM_ITEM_VERSION_REQUIRED',
        message: 'Eine gültige Programmpunkt-Version ist erforderlich',
      });
    }
    await this.bookings.deleteProgramItem(access, itemId, parsedVersion);
  }
}

@ApiTags('bookings and lineup')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({
  path: 'organizations/:organizationId/event-formats/:eventFormatId/lineup-requirements',
  version: '1',
})
export class EventFormatLineupController {
  constructor(@Inject(BookingService) private readonly bookings: BookingService) {}

  @Get()
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_READ)
  @ApiOkResponse({ type: LineupRequirementSetDto })
  requirements(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
  ): Promise<LineupRequirementSetDto> {
    return this.bookings.getFormatRequirements(access, eventFormatId);
  }

  @Put()
  @RequirePermission(PERMISSIONS.LINEUP_WRITE)
  @ApiBody({ type: ReplaceLineupRequirementsDto })
  @ApiOkResponse({ type: LineupRequirementSetDto })
  replace(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
    @Body(createDtoValidationPipe(ReplaceLineupRequirementsDto)) body: ReplaceLineupRequirementsDto,
  ): Promise<LineupRequirementSetDto> {
    return this.bookings.replaceFormatRequirements(access, eventFormatId, body.version, body.items);
  }
}
