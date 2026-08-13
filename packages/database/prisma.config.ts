import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
loadEnvironment({ path: path.join(directory, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Client generation is intentionally offline; applications still validate
    // DATABASE_URL before startup and migrations fail if this placeholder is used.
    url:
      process.env.DATABASE_URL ??
      'postgresql://configuration-required:configuration-required@localhost:5432/configuration-required',
  },
});
