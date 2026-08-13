import { Module } from '@nestjs/common';

import {
  InvitationAcceptanceController,
  OrganizationController,
  SessionController,
} from './platform.controller.js';
import { PlatformService } from './platform.service.js';

@Module({
  controllers: [SessionController, OrganizationController, InvitationAcceptanceController],
  providers: [PlatformService],
})
export class PlatformModule {}
