import { randomUUID } from 'node:crypto';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface KnownErrorResponse {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = request.header('x-request-id') ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const knownResponse = this.readKnownResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        event: 'request.unhandled_error',
        requestId,
        errorType: exception instanceof Error ? exception.constructor.name : 'UnknownError',
      });
    }

    response.status(status).json({
      code: knownResponse.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message:
        knownResponse.message ?? (status === 500 ? 'Internal server error' : 'Request failed'),
      ...(knownResponse.details ? { details: knownResponse.details } : {}),
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private readKnownResponse(exception: unknown): KnownErrorResponse {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }

    const knownResponse = response as KnownErrorResponse;
    if (typeof knownResponse.code !== 'string' || typeof knownResponse.message !== 'string') {
      return {};
    }

    return knownResponse;
  }
}
