import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { DealService } from '../application/deal.service.js';
import {
  CreateDealDto,
  DealDto,
  DealTemplateApplicationDto,
  DealTemplateDto,
  DealTemplateInputDto,
  DealTemplatePreviewDto,
  SetDealTemplateStatusDto,
  UpdateDealDto,
  UpdateDealStatusDto,
  UpdateDealTemplateDto,
} from './deal.dto.js';

@ApiTags('deals')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@ApiParam({ name: 'eventId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events/:eventId/deal', version: '1' })
export class EventDealController {
  constructor(@Inject(DealService) private readonly deals: DealService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DEALS_READ)
  @ApiOkResponse({ type: DealDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<DealDto> {
    return this.deals.findForEvent(access, eventId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.DEALS_WRITE)
  @ApiBody({ type: CreateDealDto })
  @ApiCreatedResponse({ type: DealDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(CreateDealDto)) body: CreateDealDto,
  ): Promise<DealDto> {
    return this.deals.create(access, eventId, body);
  }
}

@ApiTags('deals')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/deals', version: '1' })
export class DealController {
  constructor(@Inject(DealService) private readonly deals: DealService) {}

  @Patch(':dealId')
  @RequirePermission(PERMISSIONS.DEALS_WRITE)
  @ApiParam({ name: 'dealId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDealDto })
  @ApiOkResponse({ type: DealDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body(createDtoValidationPipe(UpdateDealDto)) body: UpdateDealDto,
  ): Promise<DealDto> {
    return this.deals.update(access, dealId, body);
  }

  @Patch(':dealId/status')
  @RequirePermission(PERMISSIONS.DEALS_STATUS)
  @ApiParam({ name: 'dealId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDealStatusDto })
  @ApiOkResponse({ type: DealDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body(createDtoValidationPipe(UpdateDealStatusDto)) body: UpdateDealStatusDto,
  ): Promise<DealDto> {
    return this.deals.setStatus(access, dealId, body.version, body.status);
  }

  @Post(':dealId/template-preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.DEALS_WRITE)
  @ApiParam({ name: 'dealId', type: String, format: 'uuid' })
  @ApiBody({ type: DealTemplateApplicationDto })
  @ApiOkResponse({ type: DealTemplatePreviewDto })
  preview(
    @CurrentAccess() access: AccessContext,
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body(createDtoValidationPipe(DealTemplateApplicationDto)) body: DealTemplateApplicationDto,
  ): Promise<DealTemplatePreviewDto> {
    return this.deals.previewTemplate(access, dealId, body.templateId);
  }

  @Post(':dealId/apply-template')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.DEALS_WRITE)
  @ApiParam({ name: 'dealId', type: String, format: 'uuid' })
  @ApiBody({ type: DealTemplateApplicationDto })
  @ApiOkResponse({ type: DealDto })
  apply(
    @CurrentAccess() access: AccessContext,
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body(createDtoValidationPipe(DealTemplateApplicationDto)) body: DealTemplateApplicationDto,
  ): Promise<DealDto> {
    return this.deals.applyTemplate(
      access,
      dealId,
      body.templateId,
      body.version,
      body.confirmReplacement,
    );
  }
}

@ApiTags('deal-templates')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/deal-templates', version: '1' })
export class DealTemplateController {
  constructor(@Inject(DealService) private readonly deals: DealService) {}

  @Get()
  @RequirePermission(PERMISSIONS.DEAL_TEMPLATES_READ)
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiOkResponse({ type: [DealTemplateDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Query('status') status?: 'ACTIVE' | 'ARCHIVED' | 'ALL',
  ): Promise<DealTemplateDto[]> {
    return this.deals.listTemplates(access, status ?? 'ACTIVE');
  }

  @Post()
  @RequirePermission(PERMISSIONS.DEAL_TEMPLATES_WRITE)
  @ApiBody({ type: DealTemplateInputDto })
  @ApiCreatedResponse({ type: DealTemplateDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(DealTemplateInputDto)) body: DealTemplateInputDto,
  ): Promise<DealTemplateDto> {
    return this.deals.createTemplate(access, body);
  }

  @Get(':templateId')
  @RequirePermission(PERMISSIONS.DEAL_TEMPLATES_READ)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: DealTemplateDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<DealTemplateDto> {
    return this.deals.findTemplate(access, templateId);
  }

  @Patch(':templateId')
  @RequirePermission(PERMISSIONS.DEAL_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateDealTemplateDto })
  @ApiOkResponse({ type: DealTemplateDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(createDtoValidationPipe(UpdateDealTemplateDto)) body: UpdateDealTemplateDto,
  ): Promise<DealTemplateDto> {
    const { version, ...input } = body;
    return this.deals.updateTemplate(access, templateId, version, input as DealTemplateInputDto);
  }

  @Patch(':templateId/status')
  @RequirePermission(PERMISSIONS.DEAL_TEMPLATES_ARCHIVE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: SetDealTemplateStatusDto })
  @ApiOkResponse({ type: DealTemplateDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body(createDtoValidationPipe(SetDealTemplateStatusDto)) body: SetDealTemplateStatusDto,
  ): Promise<DealTemplateDto> {
    return this.deals.setTemplateStatus(access, templateId, body.version, body.status);
  }
}
