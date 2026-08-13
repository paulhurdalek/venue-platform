import { Controller, Get, Inject, Version } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/http/api-error.dto.js';
import { GetHealthUseCase } from '../application/get-health.use-case.js';
import { HealthResponseDto } from './health.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(GetHealthUseCase) private readonly getHealth: GetHealthUseCase) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Report application and database health' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorDto })
  async get(): Promise<HealthResponseDto> {
    return this.getHealth.execute();
  }
}
