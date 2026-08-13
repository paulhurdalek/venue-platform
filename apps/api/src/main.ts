import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';

import { createApiApplication, mountDevelopmentApiDocumentation } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const application = await createApiApplication();
  const config = application.get(ConfigService);
  mountDevelopmentApiDocumentation(application);

  await application.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

void bootstrap();
