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
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { createDtoValidationPipe } from '../../common/http/dto-validation.pipe.js';
import { CurrentAccess, RequirePermission } from '../../security/access.decorator.js';
import { AccessGuard } from '../../security/access.guard.js';
import type { AccessContext } from '../../security/access.types.js';
import { PERMISSIONS } from '../../security/security.constants.js';
import { RevenuePlanningService } from '../application/revenue-planning.service.js';
import {
  AdditionalRevenueDto,
  AdditionalRevenueInputDto,
  ApplyCalculationTemplateDto,
  CalculationTemplatePreviewDto,
  MoveRevenueEntityDto,
  PreviewCalculationTemplateDto,
  RevenuePlanDto,
  SetExpectedGuestsDto,
  SetRevenueEntityStatusDto,
  TicketComponentInputDto,
  TicketPriceComponentDto,
  TicketPriceTierDto,
  TicketTierInputDto,
  UpdateAdditionalRevenueDto,
  UpdateTicketComponentDto,
  UpdateTicketTierDto,
} from './revenue-planning.dto.js';

@ApiTags('revenue-planning')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events/:eventId/revenue-plan', version: '1' })
export class EventRevenuePlanningController {
  constructor(@Inject(RevenuePlanningService) private readonly revenue: RevenuePlanningService) {}

  @Get()
  @RequirePermission(PERMISSIONS.CALCULATIONS_SALES)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: RevenuePlanDto })
  find(@CurrentAccess() access: AccessContext, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.revenue.findPlan(access, eventId);
  }

  @Patch('expected-guests')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: SetExpectedGuestsDto })
  @ApiOkResponse({ type: RevenuePlanDto })
  setExpectedGuests(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(SetExpectedGuestsDto)) body: SetExpectedGuestsDto,
  ) {
    return this.revenue.setExpectedGuests(
      access,
      eventId,
      body.eventVersion,
      body.expectedGuestCount,
    );
  }

  @Post('calculation-template-preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: PreviewCalculationTemplateDto })
  @ApiOkResponse({ type: CalculationTemplatePreviewDto })
  previewTemplate(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(PreviewCalculationTemplateDto))
    body: PreviewCalculationTemplateDto,
  ) {
    return this.revenue.previewCalculationTemplate(access, eventId, body.calculationTemplateId);
  }

  @Post('apply-calculation-template')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: ApplyCalculationTemplateDto })
  @ApiOkResponse({ type: RevenuePlanDto })
  applyTemplate(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(ApplyCalculationTemplateDto)) body: ApplyCalculationTemplateDto,
  ) {
    return this.revenue.applyCalculationTemplate(
      access,
      eventId,
      body.calculationTemplateId,
      body.calculationVersion,
      body.confirmReplacement,
      body.recipientResolutions ?? [],
    );
  }

  @Post('ticket-tiers')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: TicketTierInputDto })
  @ApiCreatedResponse({ type: TicketPriceTierDto })
  createTier(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(TicketTierInputDto)) body: TicketTierInputDto,
  ) {
    return this.revenue.createTicketTier(access, eventId, body);
  }

  @Post('additional-revenues')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: AdditionalRevenueInputDto })
  @ApiCreatedResponse({ type: AdditionalRevenueDto })
  createAdditional(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(AdditionalRevenueInputDto)) body: AdditionalRevenueInputDto,
  ) {
    return this.revenue.createAdditionalRevenue(access, eventId, body);
  }
}

@ApiTags('revenue-planning')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId', version: '1' })
export class RevenuePlanningResourcesController {
  constructor(@Inject(RevenuePlanningService) private readonly revenue: RevenuePlanningService) {}

  @Patch('ticket-price-tiers/:tierId')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: UpdateTicketTierDto })
  @ApiOkResponse({ type: TicketPriceTierDto })
  updateTier(
    @CurrentAccess() access: AccessContext,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body(createDtoValidationPipe(UpdateTicketTierDto)) body: UpdateTicketTierDto,
  ) {
    const { version, ...input } = body;
    return this.revenue.updateTicketTier(access, tierId, version, input);
  }

  @Patch('ticket-price-tiers/:tierId/status')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: SetRevenueEntityStatusDto })
  @ApiOkResponse({ type: TicketPriceTierDto })
  setTierStatus(
    @CurrentAccess() access: AccessContext,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body(createDtoValidationPipe(SetRevenueEntityStatusDto)) body: SetRevenueEntityStatusDto,
  ) {
    return this.revenue.setTicketTierStatus(access, tierId, body.version, body.status);
  }

  @Patch('ticket-price-tiers/:tierId/order')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: MoveRevenueEntityDto })
  @ApiOkResponse({ type: TicketPriceTierDto })
  moveTier(
    @CurrentAccess() access: AccessContext,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body(createDtoValidationPipe(MoveRevenueEntityDto)) body: MoveRevenueEntityDto,
  ) {
    return this.revenue.moveTicketTier(access, tierId, body.version, body.direction);
  }

  @Post('ticket-price-tiers/:tierId/components')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: TicketComponentInputDto })
  @ApiCreatedResponse({ type: TicketPriceComponentDto })
  createComponent(
    @CurrentAccess() access: AccessContext,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body(createDtoValidationPipe(TicketComponentInputDto)) body: TicketComponentInputDto,
  ) {
    return this.revenue.createComponent(access, tierId, body);
  }

  @Patch('ticket-price-components/:componentId')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: UpdateTicketComponentDto })
  @ApiOkResponse({ type: TicketPriceComponentDto })
  updateComponent(
    @CurrentAccess() access: AccessContext,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body(createDtoValidationPipe(UpdateTicketComponentDto)) body: UpdateTicketComponentDto,
  ) {
    const { version, ...input } = body;
    return this.revenue.updateComponent(access, componentId, version, input);
  }

  @Patch('ticket-price-components/:componentId/status')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: SetRevenueEntityStatusDto })
  @ApiOkResponse({ type: TicketPriceComponentDto })
  setComponentStatus(
    @CurrentAccess() access: AccessContext,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body(createDtoValidationPipe(SetRevenueEntityStatusDto)) body: SetRevenueEntityStatusDto,
  ) {
    return this.revenue.setComponentStatus(access, componentId, body.version, body.status);
  }

  @Patch('ticket-price-components/:componentId/order')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: MoveRevenueEntityDto })
  @ApiOkResponse({ type: TicketPriceComponentDto })
  moveComponent(
    @CurrentAccess() access: AccessContext,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body(createDtoValidationPipe(MoveRevenueEntityDto)) body: MoveRevenueEntityDto,
  ) {
    return this.revenue.moveComponent(access, componentId, body.version, body.direction);
  }

  @Patch('additional-revenues/:revenueId')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: UpdateAdditionalRevenueDto })
  @ApiOkResponse({ type: AdditionalRevenueDto })
  updateAdditional(
    @CurrentAccess() access: AccessContext,
    @Param('revenueId', ParseUUIDPipe) revenueId: string,
    @Body(createDtoValidationPipe(UpdateAdditionalRevenueDto)) body: UpdateAdditionalRevenueDto,
  ) {
    const { version, ...input } = body;
    return this.revenue.updateAdditionalRevenue(access, revenueId, version, input);
  }

  @Patch('additional-revenues/:revenueId/status')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: SetRevenueEntityStatusDto })
  @ApiOkResponse({ type: AdditionalRevenueDto })
  setAdditionalStatus(
    @CurrentAccess() access: AccessContext,
    @Param('revenueId', ParseUUIDPipe) revenueId: string,
    @Body(createDtoValidationPipe(SetRevenueEntityStatusDto)) body: SetRevenueEntityStatusDto,
  ) {
    return this.revenue.setAdditionalRevenueStatus(access, revenueId, body.version, body.status);
  }

  @Patch('additional-revenues/:revenueId/order')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiBody({ type: MoveRevenueEntityDto })
  @ApiOkResponse({ type: AdditionalRevenueDto })
  moveAdditional(
    @CurrentAccess() access: AccessContext,
    @Param('revenueId', ParseUUIDPipe) revenueId: string,
    @Body(createDtoValidationPipe(MoveRevenueEntityDto)) body: MoveRevenueEntityDto,
  ) {
    return this.revenue.moveAdditionalRevenue(access, revenueId, body.version, body.direction);
  }
}
