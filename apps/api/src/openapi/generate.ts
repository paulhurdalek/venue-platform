import 'reflect-metadata';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createApiApplication, createOpenApiDocument } from '../bootstrap.js';

const outputPath = resolve(process.cwd(), 'packages/api-client/openapi/openapi.json');
const application = await createApiApplication();

try {
  const document = createOpenApiDocument(application);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
} finally {
  await application.close();
}
