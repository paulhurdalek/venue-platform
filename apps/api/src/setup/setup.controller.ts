import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { RateLimitService } from '../security/rate-limit.service.js';
import { createDtoValidationPipe } from '../common/http/dto-validation.pipe.js';
import {
  BootstrapStatusDto,
  BootstrapTokenQueryDto,
  CompleteBootstrapDto,
  CompleteBootstrapResultDto,
} from './setup.dto.js';
import { SetupService } from './setup.service.js';

@ApiTags('setup')
@ApiExtraModels(BootstrapTokenQueryDto)
@Controller({ path: 'setup/bootstrap', version: '1' })
export class SetupController {
  constructor(
    @Inject(SetupService)
    private readonly setup: SetupService,
    @Inject(RateLimitService)
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Validate a one-time bootstrap token' })
  @ApiQuery({ name: 'token', type: String, minLength: 20 })
  @ApiOkResponse({ type: BootstrapStatusDto })
  async validate(
    @Query(createDtoValidationPipe(BootstrapTokenQueryDto)) query: BootstrapTokenQueryDto,
    @Ip() ip: string,
  ): Promise<BootstrapStatusDto> {
    await this.rateLimit.consume('bootstrap-validate', `${ip}:${query.token}`);
    return this.setup.validateToken(query.token);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the one-time first installation' })
  @ApiBody({ type: CompleteBootstrapDto })
  @ApiOkResponse({ type: CompleteBootstrapResultDto })
  async complete(
    @Body(createDtoValidationPipe(CompleteBootstrapDto)) body: CompleteBootstrapDto,
    @Ip() ip: string,
  ): Promise<CompleteBootstrapResultDto> {
    await this.rateLimit.consume('bootstrap-complete', `${ip}:${body.token}`);
    return this.setup.complete(body);
  }
}
