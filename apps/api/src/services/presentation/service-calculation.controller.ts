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
import { PERMISSIONS } from '../../security/security.constants.js';
import type { AccessContext } from '../../security/access.types.js';
import { ServiceCalculationService } from '../application/service-calculation.service.js';
import {
  ApplyEventPositionCatalogPricesDto,
  CreateEventPositionDto,
  CreateFormatServiceDto,
  CreateProviderPriceDto,
  CreateServiceCategoryDto,
  CreateServiceDto,
  EventCalculationDto,
  EventFormatServiceDto,
  EventPositionCatalogPricePreviewDto,
  EventServicePositionDto,
  ServiceCategoryDto,
  ServiceCategoryPageDto,
  ServiceDto,
  ServiceListBaseQueryDto,
  ServiceListQueryDto,
  ServicePageDto,
  ServiceProviderPriceDto,
  UpdateCalculationStatusDto,
  UpdateEntityStatusDto,
  UpdateEventPositionDto,
  UpdateFormatServiceDto,
  UpdateProviderPriceDto,
  UpdateServiceCategoryDto,
  UpdateServiceDto,
} from './service-calculation.dto.js';

@ApiTags('service categories')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/service-categories', version: '1' })
export class ServiceCategoryController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.SERVICES_READ)
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 160 })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiOkResponse({ type: ServiceCategoryPageDto })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(ServiceListBaseQueryDto)) query: ServiceListBaseQueryDto,
  ) {
    return this.services.listCategories(access.organizationId, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiBody({ type: CreateServiceCategoryDto })
  @ApiCreatedResponse({ type: ServiceCategoryDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateServiceCategoryDto)) body: CreateServiceCategoryDto,
  ) {
    return this.services.createCategory(access, body);
  }

  @Get(':categoryId')
  @RequirePermission(PERMISSIONS.SERVICES_READ)
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ServiceCategoryDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.services.findCategory(access.organizationId, categoryId);
  }

  @Patch(':categoryId')
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateServiceCategoryDto })
  @ApiOkResponse({ type: ServiceCategoryDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body(createDtoValidationPipe(UpdateServiceCategoryDto)) body: UpdateServiceCategoryDto,
  ) {
    const { version, ...input } = body;
    return this.services.updateCategory(access, categoryId, version, input);
  }

  @Patch(':categoryId/status')
  @RequirePermission(PERMISSIONS.SERVICES_ARCHIVE)
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: ServiceCategoryDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ) {
    return this.services.setCategoryStatus(access, categoryId, body.version, body.status);
  }
}

@ApiTags('services')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/services', version: '1' })
export class ServiceCatalogController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.SERVICES_READ)
  @ApiQuery({ name: 'q', required: false, type: String, maxLength: 160 })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ARCHIVED', 'ALL'] })
  @ApiQuery({ name: 'categoryId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiOkResponse({ type: ServicePageDto })
  list(
    @CurrentAccess() access: AccessContext,
    @Query(createDtoValidationPipe(ServiceListQueryDto)) query: ServiceListQueryDto,
  ) {
    return this.services.listServices(access, query);
  }

  @Post()
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiBody({ type: CreateServiceDto })
  @ApiCreatedResponse({ type: ServiceDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Body(createDtoValidationPipe(CreateServiceDto)) body: CreateServiceDto,
  ) {
    return this.services.createService(access, body);
  }

  @Get(':serviceId')
  @RequirePermission(PERMISSIONS.SERVICES_READ)
  @ApiParam({ name: 'serviceId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ServiceDto })
  find(
    @CurrentAccess() access: AccessContext,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.services.findService(access, serviceId);
  }

  @Patch(':serviceId')
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'serviceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateServiceDto })
  @ApiOkResponse({ type: ServiceDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body(createDtoValidationPipe(UpdateServiceDto)) body: UpdateServiceDto,
  ) {
    const { version, ...input } = body;
    return this.services.updateService(access, serviceId, version, input);
  }

  @Patch(':serviceId/status')
  @RequirePermission(PERMISSIONS.SERVICES_ARCHIVE)
  @ApiParam({ name: 'serviceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: ServiceDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ) {
    return this.services.setServiceStatus(access, serviceId, body.version, body.status);
  }

  @Post(':serviceId/provider-prices')
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'serviceId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateProviderPriceDto })
  @ApiCreatedResponse({ type: ServiceProviderPriceDto })
  createProvider(
    @CurrentAccess() access: AccessContext,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body(createDtoValidationPipe(CreateProviderPriceDto)) body: CreateProviderPriceDto,
  ) {
    return this.services.createProviderPrice(access, serviceId, body);
  }
}

@ApiTags('service provider prices')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/service-provider-prices', version: '1' })
export class ServiceProviderPriceController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Patch(':providerPriceId')
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'providerPriceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateProviderPriceDto })
  @ApiOkResponse({ type: ServiceProviderPriceDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('providerPriceId', ParseUUIDPipe) providerPriceId: string,
    @Body(createDtoValidationPipe(UpdateProviderPriceDto)) body: UpdateProviderPriceDto,
  ) {
    const { version, ...input } = body;
    return this.services.updateProviderPrice(access, providerPriceId, version, input);
  }

  @Patch(':providerPriceId/status')
  @RequirePermission(PERMISSIONS.SERVICES_ARCHIVE)
  @ApiParam({ name: 'providerPriceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: ServiceProviderPriceDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('providerPriceId', ParseUUIDPipe) providerPriceId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ) {
    return this.services.setProviderPriceStatus(access, providerPriceId, body.version, body.status);
  }
}

@ApiTags('event format services')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({
  path: 'organizations/:organizationId/event-formats/:eventFormatId/services',
  version: '1',
})
export class EventFormatServiceController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.SERVICES_READ)
  @ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiOkResponse({ type: [EventFormatServiceDto] })
  list(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.services.listFormatServices(access, eventFormatId, includeArchived === 'true');
  }

  @Post()
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'eventFormatId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateFormatServiceDto })
  @ApiCreatedResponse({ type: EventFormatServiceDto })
  create(
    @CurrentAccess() access: AccessContext,
    @Param('eventFormatId', ParseUUIDPipe) eventFormatId: string,
    @Body(createDtoValidationPipe(CreateFormatServiceDto)) body: CreateFormatServiceDto,
  ) {
    return this.services.createFormatService(access, eventFormatId, body);
  }
}

@ApiTags('event format services')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/event-format-services', version: '1' })
export class EventFormatServiceItemController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Patch(':formatServiceId')
  @RequirePermission(PERMISSIONS.SERVICES_WRITE)
  @ApiParam({ name: 'formatServiceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateFormatServiceDto })
  @ApiOkResponse({ type: EventFormatServiceDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('formatServiceId', ParseUUIDPipe) formatServiceId: string,
    @Body(createDtoValidationPipe(UpdateFormatServiceDto)) body: UpdateFormatServiceDto,
  ) {
    const { version, ...input } = body;
    return this.services.updateFormatService(access, formatServiceId, version, input);
  }

  @Patch(':formatServiceId/status')
  @RequirePermission(PERMISSIONS.SERVICES_ARCHIVE)
  @ApiParam({ name: 'formatServiceId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: EventFormatServiceDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('formatServiceId', ParseUUIDPipe) formatServiceId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ) {
    return this.services.setFormatServiceStatus(access, formatServiceId, body.version, body.status);
  }
}

@ApiTags('event calculations')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/events/:eventId/calculation', version: '1' })
export class EventCalculationController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.CALCULATIONS_READ)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: EventCalculationDto })
  get(@CurrentAccess() access: AccessContext, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.services.getCalculation(access, eventId);
  }

  @Post('positions')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiBody({ type: CreateEventPositionDto })
  @ApiCreatedResponse({ type: EventServicePositionDto })
  addPosition(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(CreateEventPositionDto)) body: CreateEventPositionDto,
  ) {
    return this.services.addEventPosition(access, eventId, body);
  }

  @Patch('status')
  @RequirePermission(PERMISSIONS.CALCULATIONS_READ)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateCalculationStatusDto })
  @ApiOkResponse({ type: EventCalculationDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(createDtoValidationPipe(UpdateCalculationStatusDto)) body: UpdateCalculationStatusDto,
  ) {
    return this.services.setCalculationStatus(
      access,
      eventId,
      body.version,
      body.status,
      body.note,
    );
  }
}

@ApiTags('event calculation positions')
@ApiParam({ name: 'organizationId', type: String, format: 'uuid' })
@UseGuards(AccessGuard)
@Controller({ path: 'organizations/:organizationId/event-service-positions', version: '1' })
export class EventServicePositionController {
  constructor(
    @Inject(ServiceCalculationService) private readonly services: ServiceCalculationService,
  ) {}

  @Patch(':positionId')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiParam({ name: 'positionId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEventPositionDto })
  @ApiOkResponse({ type: EventServicePositionDto })
  update(
    @CurrentAccess() access: AccessContext,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Body(createDtoValidationPipe(UpdateEventPositionDto)) body: UpdateEventPositionDto,
  ) {
    const { version, ...input } = body;
    return this.services.updateEventPosition(access, positionId, version, input);
  }

  @Get(':positionId/catalog-price-preview')
  @RequirePermission(PERMISSIONS.CALCULATIONS_READ)
  @ApiParam({ name: 'positionId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: EventPositionCatalogPricePreviewDto })
  previewCatalogPrices(
    @CurrentAccess() access: AccessContext,
    @Param('positionId', ParseUUIDPipe) positionId: string,
  ) {
    return this.services.previewEventPositionCatalogPrices(access, positionId);
  }

  @Patch(':positionId/catalog-prices')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiParam({ name: 'positionId', type: String, format: 'uuid' })
  @ApiBody({ type: ApplyEventPositionCatalogPricesDto })
  @ApiOkResponse({ type: EventServicePositionDto })
  applyCatalogPrices(
    @CurrentAccess() access: AccessContext,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Body(createDtoValidationPipe(ApplyEventPositionCatalogPricesDto))
    body: ApplyEventPositionCatalogPricesDto,
  ) {
    return this.services.applyEventPositionCatalogPrices(access, positionId, body.version);
  }

  @Patch(':positionId/status')
  @RequirePermission(PERMISSIONS.CALCULATIONS_WRITE)
  @ApiParam({ name: 'positionId', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateEntityStatusDto })
  @ApiOkResponse({ type: EventServicePositionDto })
  setStatus(
    @CurrentAccess() access: AccessContext,
    @Param('positionId', ParseUUIDPipe) positionId: string,
    @Body(createDtoValidationPipe(UpdateEntityStatusDto)) body: UpdateEntityStatusDto,
  ) {
    return this.services.setEventPositionStatus(access, positionId, body.version, body.status);
  }
}
