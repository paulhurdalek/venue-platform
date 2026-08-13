import 'reflect-metadata';

import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const config = application.get(ConfigService);
  const logLevel = config.getOrThrow<LogLevel>('LOG_LEVEL');
  const levels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

  application.useLogger(
    new ConsoleLogger({
      json: true,
      colors: false,
      prefix: 'venue-worker',
      logLevels: levels.slice(0, Math.max(levels.indexOf(logLevel), 3) + 1),
    }),
  );
  application.enableShutdownHooks();
}

void bootstrap();
