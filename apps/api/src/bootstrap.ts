import {
  ConsoleLogger,
  type INestApplication,
  type LogLevel,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { API_GLOBAL_PREFIX, API_VERSION } from '@venue/shared';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { AuthService } from './auth/auth.service.js';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter.js';
import { createDtoValidationPipe } from './common/http/dto-validation.pipe.js';

export async function createApiApplication(): Promise<INestApplication> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
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
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  const expressApplication = application.getHttpAdapter().getInstance() as Express;
  const authService = application.get(AuthService);
  expressApplication.all('/api/auth/*splat', toNodeHandler(authService.auth));
  application.use(express.json({ limit: '128kb' }));
  application.use(express.urlencoded({ extended: false, limit: '128kb' }));

  application.setGlobalPrefix(API_GLOBAL_PREFIX);
  application.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
  application.useGlobalPipes(createDtoValidationPipe());
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
    .setDescription('Phase 1 organization, location and authorization API')
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
