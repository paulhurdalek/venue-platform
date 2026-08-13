import {
  ConsoleLogger,
  type INestApplication,
  type LogLevel,
  UnprocessableEntityException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_GLOBAL_PREFIX, API_VERSION } from '@venue/shared';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';

export async function createApiApplication(): Promise<INestApplication> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApiApplication(application);
  return application;
}

export function configureApiApplication(application: INestApplication): void {
  const config = application.get(ConfigService);
  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');
  const configuredLogLevel = config.getOrThrow<LogLevel>('LOG_LEVEL');

  application.useLogger(
    new ConsoleLogger({
      json: true,
      colors: false,
      prefix: 'venue-api',
      logLevels: logLevelsFrom(configuredLogLevel),
    }),
  );
  application.use(helmet());
  application.enableCors({
    origin: origins,
    credentials: false,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  application.setGlobalPrefix(API_GLOBAL_PREFIX);
  application.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { fields: errors.map((error) => error.property) },
        }),
    }),
  );
  application.useGlobalFilters(new AllExceptionsFilter());
  application.enableShutdownHooks();
}

const orderedLogLevels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

function logLevelsFrom(minimumLevel: LogLevel): LogLevel[] {
  const index = orderedLogLevels.indexOf(minimumLevel);
  return index === -1 ? ['fatal', 'error', 'warn', 'log'] : orderedLogLevels.slice(0, index + 1);
}

export function createOpenApiDocument(application: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('Venue Platform API')
    .setDescription('Technical Phase 0 API foundation')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(application, options);
}

export function mountDevelopmentApiDocumentation(application: INestApplication): void {
  const config = application.get(ConfigService);
  const isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';
  const enabled = config.getOrThrow<boolean>('SWAGGER_UI_ENABLED');

  if (!isProduction && enabled) {
    SwaggerModule.setup('api/docs', application, createOpenApiDocument(application));
  }
}
