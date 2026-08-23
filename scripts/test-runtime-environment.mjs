import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localTestEnvironmentFile = resolve(rootDirectory, '.env.test');
export const testEnvironmentFile = existsSync(localTestEnvironmentFile)
  ? localTestEnvironmentFile
  : resolve(rootDirectory, '.env.test.example');
export const testRuntimeDefaults = Object.freeze(
  parseEnv(readFileSync(testEnvironmentFile, 'utf8')),
);

if (testRuntimeDefaults.NODE_ENV !== 'test') {
  throw new Error(`${testEnvironmentFile} must set NODE_ENV=test.`);
}

export function createTestRuntimeEnvironment(overrides = {}, inheritedEnvironment = process.env) {
  return {
    ...inheritedEnvironment,
    ...testRuntimeDefaults,
    ...overrides,
  };
}
