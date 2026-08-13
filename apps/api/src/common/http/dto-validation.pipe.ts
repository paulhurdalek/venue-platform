import { type Type, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

export function createDtoValidationPipe(expectedType?: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
    ...(expectedType ? { expectedType } : {}),
    exceptionFactory: (errors) =>
      new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { fields: errors.map((error) => error.property) },
      }),
  });
}
