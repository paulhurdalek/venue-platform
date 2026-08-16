import { Module } from '@nestjs/common';

import { MasterDataService } from './application/master-data.service.js';
import { MASTER_DATA_REPOSITORY } from './application/master-data.repository.js';
import { PrismaMasterDataRepository } from './infrastructure/prisma-master-data.repository.js';
import { MasterDataController } from './presentation/master-data.controller.js';

@Module({
  controllers: [MasterDataController],
  providers: [
    MasterDataService,
    PrismaMasterDataRepository,
    { provide: MASTER_DATA_REPOSITORY, useExisting: PrismaMasterDataRepository },
  ],
})
export class MasterDataModule {}
