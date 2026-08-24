import { Module } from '@nestjs/common';

import { ServiceCalculationService } from './application/service-calculation.service.js';
import { SERVICE_CALCULATION_REPOSITORY } from './application/service-calculation.repository.js';
import { PrismaServiceCalculationRepository } from './infrastructure/prisma-service-calculation.repository.js';
import {
  EventCalculationController,
  EventFormatServiceController,
  EventFormatServiceItemController,
  EventServicePositionController,
  ServiceCatalogController,
  ServiceCategoryController,
  ServiceProviderPriceController,
} from './presentation/service-calculation.controller.js';

@Module({
  controllers: [
    ServiceCategoryController,
    ServiceCatalogController,
    ServiceProviderPriceController,
    EventFormatServiceController,
    EventFormatServiceItemController,
    EventCalculationController,
    EventServicePositionController,
  ],
  providers: [
    ServiceCalculationService,
    PrismaServiceCalculationRepository,
    { provide: SERVICE_CALCULATION_REPOSITORY, useExisting: PrismaServiceCalculationRepository },
  ],
})
export class ServicesModule {}
