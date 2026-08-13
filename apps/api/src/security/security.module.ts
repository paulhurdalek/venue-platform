import { Global, Module } from '@nestjs/common';

import { AccessGuard } from './access.guard.js';
import { AccessService } from './access.service.js';
import { RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  providers: [AccessService, AccessGuard, RateLimitService],
  exports: [AccessService, AccessGuard, RateLimitService],
})
export class SecurityModule {}
