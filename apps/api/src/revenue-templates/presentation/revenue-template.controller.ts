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
import { RevenueTemplateService } from '../application/revenue-template.service.js';
import {
  CalculationTemplateDto,
  CalculationTemplateInputDto,
  DuplicateRevenueTemplateDto,
  SaveEventCalculationTemplateDto,
  TaxRateTemplateDto,
  TaxRateTemplateInputDto,
  TemplateStatusQueryDto,
  TicketProviderTemplateDto,
  TicketProviderTemplateInputDto,
  UpdateCalculationTemplateDto,
  UpdateRevenueTemplateStatusDto,
  UpdateTaxRateTemplateDto,
  UpdateTicketProviderTemplateDto,
} from './revenue-template.dto.js';

@ApiTags('revenue templates')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/revenue-templates', version: '1' })
export class RevenueTemplateController {
  constructor(@Inject(RevenueTemplateService) private readonly templates: RevenueTemplateService) {}

  @Get('tax-rates')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_READ)
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiOkResponse({ type: [TaxRateTemplateDto] })
  listTaxRates(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(TemplateStatusQueryDto)) query: TemplateStatusQueryDto,
  ) {
    return this.templates.listTaxRates(access.organizationId, query.status);
  }

  @Post('tax-rates')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiBody({ type: TaxRateTemplateInputDto })
  @ApiCreatedResponse({ type: TaxRateTemplateDto })
  createTaxRate(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(TaxRateTemplateInputDto)) body: TaxRateTemplateInputDto,
  ) {
    return this.templates.createTaxRate(access, body);
  }

  @Patch('tax-rates/:templateId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateTaxRateTemplateDto })
  @ApiOkResponse({ type: TaxRateTemplateDto })
  updateTaxRate(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateTaxRateTemplateDto)) body: UpdateTaxRateTemplateDto,
  ) {
    const { version, ...input } = body;
    return this.templates.updateTaxRate(access, id, version, input);
  }

  @Patch('tax-rates/:templateId/status')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_ARCHIVE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateRevenueTemplateStatusDto })
  @ApiOkResponse({ type: TaxRateTemplateDto })
  setTaxRateStatus(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateRevenueTemplateStatusDto))
    body: UpdateRevenueTemplateStatusDto,
  ) {
    return this.templates.setTaxRateStatus(access, id, body.version, body.status);
  }

  @Get('ticket-providers')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_READ)
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiOkResponse({ type: [TicketProviderTemplateDto] })
  listProviders(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(TemplateStatusQueryDto)) query: TemplateStatusQueryDto,
  ) {
    return this.templates.listProviders(access.organizationId, query.status);
  }

  @Post('ticket-providers')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiBody({ type: TicketProviderTemplateInputDto })
  @ApiCreatedResponse({ type: TicketProviderTemplateDto })
  createProvider(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(TicketProviderTemplateInputDto))
    body: TicketProviderTemplateInputDto,
  ) {
    return this.templates.createProvider(access, body);
  }

  @Get('ticket-providers/:templateId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_READ)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: TicketProviderTemplateDto })
  findProvider(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
  ) {
    return this.templates.findProvider(access.organizationId, id);
  }

  @Patch('ticket-providers/:templateId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateTicketProviderTemplateDto })
  @ApiOkResponse({ type: TicketProviderTemplateDto })
  updateProvider(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateTicketProviderTemplateDto))
    body: UpdateTicketProviderTemplateDto,
  ) {
    const { version, ...input } = body;
    return this.templates.updateProvider(access, id, version, input);
  }

  @Post('ticket-providers/:templateId/duplicate')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: DuplicateRevenueTemplateDto })
  @ApiCreatedResponse({ type: TicketProviderTemplateDto })
  duplicateProvider(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(DuplicateRevenueTemplateDto)) body: DuplicateRevenueTemplateDto,
  ) {
    return this.templates.duplicateProvider(access, id, body.name);
  }

  @Patch('ticket-providers/:templateId/status')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_ARCHIVE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateRevenueTemplateStatusDto })
  @ApiOkResponse({ type: TicketProviderTemplateDto })
  setProviderStatus(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateRevenueTemplateStatusDto))
    body: UpdateRevenueTemplateStatusDto,
  ) {
    return this.templates.setProviderStatus(access, id, body.version, body.status);
  }

  @Get('calculations')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_READ)
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiOkResponse({ type: [CalculationTemplateDto] })
  listCalculations(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(TemplateStatusQueryDto)) query: TemplateStatusQueryDto,
  ) {
    return this.templates.listCalculations(access.organizationId, query.status);
  }

  @Post('calculations')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiBody({ type: CalculationTemplateInputDto })
  @ApiCreatedResponse({ type: CalculationTemplateDto })
  createCalculation(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CalculationTemplateInputDto)) body: CalculationTemplateInputDto,
  ) {
    return this.templates.createCalculation(access, body);
  }

  @Get('calculations/:templateId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_READ)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CalculationTemplateDto })
  findCalculation(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
  ) {
    return this.templates.findCalculation(access.organizationId, id);
  }

  @Patch('calculations/:templateId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateCalculationTemplateDto })
  @ApiOkResponse({ type: CalculationTemplateDto })
  updateCalculation(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateCalculationTemplateDto)) body: UpdateCalculationTemplateDto,
  ) {
    const { version, ...input } = body;
    return this.templates.updateCalculation(access, id, version, input);
  }

  @Post('calculations/:templateId/duplicate')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: DuplicateRevenueTemplateDto })
  @ApiCreatedResponse({ type: CalculationTemplateDto })
  duplicateCalculation(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(DuplicateRevenueTemplateDto)) body: DuplicateRevenueTemplateDto,
  ) {
    return this.templates.duplicateCalculation(access, id, body.name);
  }

  @Patch('calculations/:templateId/status')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_ARCHIVE)
  @ApiParam({ name: 'templateId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateRevenueTemplateStatusDto })
  @ApiOkResponse({ type: CalculationTemplateDto })
  setCalculationStatus(
    @CurrentAccess() access: AccessContext,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body(createDtoValidationPipe(UpdateRevenueTemplateStatusDto))
    body: UpdateRevenueTemplateStatusDto,
  ) {
    return this.templates.setCalculationStatus(access, id, body.version, body.status);
  }

  @Post('calculations/from-event/:eventId')
  @RequirePermission(PERMISSIONS.REVENUE_TEMPLATES_WRITE)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiBody({ type: SaveEventCalculationTemplateDto })
  @ApiCreatedResponse({ type: CalculationTemplateDto })
  saveEventCalculation(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(SaveEventCalculationTemplateDto))
    body: SaveEventCalculationTemplateDto,
  ) {
    return this.templates.saveEventCalculation(access, eventId, body);
  }
}
