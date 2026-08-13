import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { SetupService } from './setup.service.js';

const application = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const { link } = await application.get(SetupService).createBootstrapLink();
  process.stdout.write(`${link}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Bootstrap link creation failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await application.close();
}
