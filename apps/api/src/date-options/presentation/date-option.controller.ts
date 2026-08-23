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
import { EventDto } from '../../events/presentation/event.dto.js';
import { CurrentAccess, RequirePermission } from '../../security/access.decorator.js';
import { AccessGuard } from '../../security/access.guard.js';
import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import { DateOptionService } from '../application/date-option.service.js';
import {
  AvailabilityQueryDto,
  AvailabilityResultDto,
  ConvertDateOptionDto,
  CreateDateOptionBatchDto,
  CreateDateOptionDto,
  DateOptionBatchResultDto,
  DateOptionDto,
  DateOptionListQueryDto,
  DateOptionPageDto,
  UpdateDateOptionDto,
  VersionDto,
} from './date-option.dto.js';

@ApiTags('date-options')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/date-options', version: '1' })
export class DateOptionController {
  constructor(@Inject(DateOptionService) private readonly options: DateOptionService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_READ)
  @ApiQuery({ name: 'fromDate', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'toDate', required: false, type: String, format: 'date' })
  @ApiQuery({ name: 'locationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED', 'UNAVAILABLE'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ type: DateOptionPageDto })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(DateOptionListQueryDto)) query: DateOptionListQueryDto,
  ): Promise<DateOptionPageDto> {
    return this.options.list(access, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_WRITE)
  @ApiBody({ type: CreateDateOptionDto })
  @ApiCreatedResponse({ type: DateOptionDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateDateOptionDto)) body: CreateDateOptionDto,
  ): Promise<DateOptionDto> {
    return this.options.create(access, body);
  }

  @Post('batch')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_WRITE)
  @ApiBody({ type: CreateDateOptionBatchDto })
  @ApiCreatedResponse({ type: DateOptionBatchResultDto })
  createBatch(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateDateOptionBatchDto)) body: CreateDateOptionBatchDto,
  ): Promise<DateOptionBatchResultDto> {
    return this.options.createBatch(access, body);
  }

  @Get(':optionId')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_READ)
  @ApiParam({ name: 'optionId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: DateOptionDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('optionId', ParseUUIDPipe) optionId: string,
  ): Promise<DateOptionDto> {
    return this.options.find(access, optionId);
  }

  @Patch(':optionId')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_WRITE)
  @ApiParam({ name: 'optionId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDateOptionDto })
  @ApiOkResponse({ type: DateOptionDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body(createDtoValidationPipe(UpdateDateOptionDto)) body: UpdateDateOptionDto,
  ): Promise<DateOptionDto> {
    const { version, ...input } = body;
    return this.options.update(access, optionId, version, input);
  }

  @Patch(':optionId/release')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_WRITE)
  @ApiParam({ name: 'optionId', type: String, format: 'uuid' })
  @ApiBody({ type: VersionDto })
  @ApiOkResponse({ type: DateOptionDto })
  release(
    @CurrentAccess() access: AccessContext,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body(createDtoValidationPipe(VersionDto)) body: VersionDto,
  ): Promise<DateOptionDto> {
    return this.options.release(access, optionId, body.version);
  }

  @Patch(':optionId/promote')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_WRITE)
  @ApiParam({ name: 'optionId', type: String, format: 'uuid' })
  @ApiBody({ type: VersionDto })
  @ApiOkResponse({ type: DateOptionDto })
  promote(
    @CurrentAccess() access: AccessContext,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body(createDtoValidationPipe(VersionDto)) body: VersionDto,
  ): Promise<DateOptionDto> {
    return this.options.promote(access, optionId, body.version);
  }

  @Post(':optionId/convert')
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_CONVERT)
  @ApiParam({ name: 'optionId', type: String, format: 'uuid' })
  @ApiBody({ type: ConvertDateOptionDto })
  @ApiCreatedResponse({ type: EventDto })
  convert(
    @CurrentAccess() access: AccessContext,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body(createDtoValidationPipe(ConvertDateOptionDto)) body: ConvertDateOptionDto,
  ): Promise<EventDto> {
    const { version, ...input } = body;
    return this.options.convert(access, optionId, version, input);
  }
}

@ApiTags('availability')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/availability', version: '1' })
export class AvailabilityController {
  constructor(@Inject(DateOptionService) private readonly options: DateOptionService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DATE_OPTIONS_READ)
  @ApiQuery({ name: 'locationId', required: true, type: String, format: 'uuid' })
  @ApiQuery({ name: 'fromDate', required: true, type: String, format: 'date' })
  @ApiQuery({ name: 'toDate', required: true, type: String, format: 'date' })
  @ApiQuery({ name: 'occupancyStartTime', required: true, type: String })
  @ApiQuery({ name: 'occupancyEndTime', required: true, type: String })
  @ApiQuery({ name: 'occupancyEndNextDay', required: false, type: Boolean })
  @ApiQuery({ name: 'weekdays', required: false, type: String })
  @ApiQuery({
    name: 'resultFilter',
    required: false,
    enum: ['FREE_ONLY', 'FREE_AND_SECOND_OPTION'],
  })
  @ApiOkResponse({ type: [AvailabilityResultDto] })
  availability(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(AvailabilityQueryDto)) query: AvailabilityQueryDto,
  ): Promise<AvailabilityResultDto[]> {
    return this.options.availability(access, query);
  }
}
