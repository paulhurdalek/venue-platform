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
import { EventFormatService } from '../application/event-format.service.js';
import {
  CreateEventFormatDto,
  EventFormatDto,
  EventFormatListQueryDto,
  EventFormatPageDto,
  UpdateEventFormatDto,
  UpdateEventFormatStatusDto,
} from './event-format.dto.js';

@ApiTags('event formats')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/event-formats', version: '1' })
export class EventFormatController {
  constructor(
    @Inject(EventFormatService)
    private readonly eventFormats: EventFormatService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_READ)
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 160 })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiQuery({
    name: 'eventKind',
    required: false,
    enum: ['OWN_PRODUCTION', 'THIRD_PARTY_EVENT'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiOkResponse({ type: EventFormatPageDto })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(EventFormatListQueryDto)) query: EventFormatListQueryDto,
  ): Promise<EventFormatPageDto> {
    return this.eventFormats.list(access.organizationId, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_WRITE)
  @ApiBody({ type: CreateEventFormatDto })
  @ApiCreatedResponse({ type: EventFormatDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateEventFormatDto)) body: CreateEventFormatDto,
  ): Promise<EventFormatDto> {
    return this.eventFormats.create(access, body);
  }

  @Get(':eventFormatId')
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_READ)
  @ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: EventFormatDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
  ): Promise<EventFormatDto> {
    return this.eventFormats.find(access.organizationId, eventFormatId);
  }

  @Patch(':eventFormatId')
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_WRITE)
  @ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEventFormatDto })
  @ApiOkResponse({ type: EventFormatDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
    @Body(createDtoValidationPipe(UpdateEventFormatDto)) body: UpdateEventFormatDto,
  ): Promise<EventFormatDto> {
    const { version, ...input } = body;
    return this.eventFormats.update(access, eventFormatId, version, input);
  }

  @Patch(':eventFormatId/status')
  @RequirePermission(PERMISSIONS.EVENT_FORMATS_ARCHIVE)
  @ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEventFormatStatusDto })
  @ApiOkResponse({ type: EventFormatDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
    @Body(createDtoValidationPipe(UpdateEventFormatStatusDto)) body: UpdateEventFormatStatusDto,
  ): Promise<EventFormatDto> {
    return this.eventFormats.setStatus(access, eventFormatId, body.version, body.status);
  }
}
