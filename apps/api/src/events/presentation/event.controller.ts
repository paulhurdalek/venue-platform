import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { EventService } from '../application/event.service.js';
import {
  CreateEventDto,
  EventDto,
  EventListQueryDto,
  EventPageDto,
  UpdateEventDto,
  UpdateEventStatusDto,
} from './event.dto.js';

@ApiTags('events')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events', version: '1' })
export class EventController {
  constructor(
    @Inject(EventService)
    private readonly events: EventService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.EVENTS_READ)
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 160 })
  @ApiQuery({ name: 'fromDate', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'toDate', required: false, type: String, format: 'date' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'eventFormatId', required: false, type: String, format: 'uuid' })
  @ApiQuery({
    name: 'eventKind',
    required: false,
    enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'],
  })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiOkResponse({ type: EventPageDto })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(EventListQueryDto)) query: EventListQueryDto,
  ): Promise<EventPageDto> {
    return this.events.list(access, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.EVENTS_WRITE)
  @ApiBody({ type: CreateEventDto })
  @ApiCreatedResponse({ type: EventDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateEventDto)) body: CreateEventDto,
  ): Promise<EventDto> {
    return this.events.create(access, body);
  }

  @Get(':eventId')
  @RequirePermission(PERMISSIONS.EVENTS_READ)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: EventDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<EventDto> {
    return this.events.find(access, eventId);
  }

  @Patch(':eventId')
  @RequirePermission(PERMISSIONS.EVENTS_WRITE)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEventDto })
  @ApiOkResponse({ type: EventDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(UpdateEventDto)) body: UpdateEventDto,
  ): Promise<EventDto> {
    const { version, ...input } = body;
    return this.events.update(access, eventId, version, input);
  }

  @Patch(':eventId/status')
  @RequirePermission(PERMISSIONS.EVENTS_STATUS)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEventStatusDto })
  @ApiOkResponse({ type: EventDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(UpdateEventStatusDto)) body: UpdateEventStatusDto,
  ): Promise<EventDto> {
    return this.events.setStatus(access, eventId, body.version, body.status);
  }
}
