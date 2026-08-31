import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { resolveNextDistDirectory, resolveNextTypeScriptConfig } from '../apps/web/next.config.ts';
import {
  createE2eNextDistDirectoryName,
  createE2eTypeScriptConfig,
  createE2eTypeScriptConfigName,
  removeE2eNextDistDirectory,
  removeE2eTypeScriptConfig,
  resolveE2eNextDistDirectory,
  restoreFileSnapshots,
  snapshotFiles,
} from './e2e-next-artifacts.mjs';
import { createTestRuntimeEnvironment, testRuntimeDefaults } from './test-runtime-environment.mjs';

test('test runners replace inherited development limits with the canonical test configuration', () => {
  const environment = createTestRuntimeEnvironment(
    {
      DATABASE_URL: 'postgresql://test-override',
      TEST_DATABASE_URL: 'postgresql://test-override',
    },
    {
      NODE_ENV: 'development',
      AUTH_SIGN_IN_RATE_LIMIT_MAX: '5',
      SENSITIVE_RATE_LIMIT_MAX: '10',
    },
  );

  assert.equal(environment.NODE_ENV, 'test');
  assert.equal(environment.RATE_LIMIT_MAX_REQUESTS, '100');
  assert.equal(environment.AUTH_SIGN_IN_RATE_LIMIT_MAX, '20');
  assert.equal(environment.SENSITIVE_RATE_LIMIT_MAX, '50');
  assert.equal(environment.DATABASE_URL, 'postgresql://test-override');
  assert.equal(environment.TEST_DATABASE_URL, 'postgresql://test-override');
  assert.equal(testRuntimeDefaults.NEXT_PUBLIC_API_BASE_URL, 'http://localhost:3100');
});

test('root test command overrides inherited database configuration with .env.test', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.test, /dotenv -e \.env\.test -o/);
  const environment = createTestRuntimeEnvironment(
    {},
    {
      DATABASE_URL: 'postgresql://venue:development@localhost:5432/venue_development',
    },
  );
  assert.equal(environment.DATABASE_URL, testRuntimeDefaults.DATABASE_URL);
  assert.equal(environment.TEST_DATABASE_URL, testRuntimeDefaults.TEST_DATABASE_URL);
  assert.equal(environment.DATABASE_URL.includes('development'), false);
});

test('normal Next.js runs keep using the regular .next directory', () => {
  assert.equal(resolveNextDistDirectory({}), '.next');
  assert.equal(resolveNextTypeScriptConfig({}), 'tsconfig.json');
});

test('E2E Next.js runs accept only an isolated project-local directory', () => {
  const directoryName = createE2eNextDistDirectoryName();
  const typescriptConfigName = createE2eTypeScriptConfigName(directoryName);
  assert.equal(resolveNextDistDirectory({ VENUE_E2E_NEXT_DIST_DIR: directoryName }), directoryName);
  assert.equal(
    resolveNextTypeScriptConfig({ VENUE_E2E_TSCONFIG: typescriptConfigName }),
    typescriptConfigName,
  );
  assert.throws(() => resolveNextDistDirectory({ VENUE_E2E_NEXT_DIST_DIR: '.next' }));
  assert.throws(() => resolveNextDistDirectory({ VENUE_E2E_NEXT_DIST_DIR: '../outside-project' }));
  assert.throws(() => resolveNextTypeScriptConfig({ VENUE_E2E_TSCONFIG: 'tsconfig.json' }));
});

test('E2E cleanup restores Next-managed files and leaves the normal cache untouched', async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'venue-e2e-cache-'));
  try {
    const webDirectory = join(fixtureDirectory, 'apps', 'web');
    const normalCacheDirectory = join(webDirectory, '.next');
    const nextEnvPath = join(webDirectory, 'next-env.d.ts');
    const tsconfigPath = join(webDirectory, 'tsconfig.json');
    const e2eDirectoryName = createE2eNextDistDirectoryName();
    const e2eDirectory = resolveE2eNextDistDirectory(webDirectory, e2eDirectoryName);
    const e2eTypeScriptConfigName = createE2eTypeScriptConfigName(e2eDirectoryName);
    const e2eTypeScriptConfigPath = join(webDirectory, e2eTypeScriptConfigName);
    await mkdir(normalCacheDirectory, { recursive: true });
    await mkdir(e2eDirectory, { recursive: true });
    await writeFile(join(normalCacheDirectory, 'normal-cache-marker'), 'localhost:3000');
    await writeFile(join(e2eDirectory, 'e2e-cache-marker'), '127.0.0.1:3000');
    await writeFile(nextEnvPath, 'normal next declarations');
    await writeFile(tsconfigPath, '{"include":[".next/types/**/*.ts"]}');
    const snapshots = await snapshotFiles([nextEnvPath]);
    await createE2eTypeScriptConfig(webDirectory, e2eTypeScriptConfigName);

    await writeFile(nextEnvPath, `temporary ${e2eDirectoryName} declarations`);
    await writeFile(e2eTypeScriptConfigPath, '{"include":[".next-e2e/types/**/*.ts"]}');
    await restoreFileSnapshots(snapshots, e2eDirectoryName);
    await removeE2eTypeScriptConfig(webDirectory, e2eTypeScriptConfigName);
    await removeE2eNextDistDirectory(webDirectory, e2eDirectoryName);

    assert.equal(await readFile(nextEnvPath, 'utf8'), 'normal next declarations');
    const guardedSnapshots = await snapshotFiles([nextEnvPath]);
    await writeFile(nextEnvPath, 'concurrent developer edit');
    await assert.rejects(restoreFileSnapshots(guardedSnapshots, e2eDirectoryName));
    assert.equal(await readFile(nextEnvPath, 'utf8'), 'concurrent developer edit');
    await writeFile(nextEnvPath, 'normal next declarations');
    assert.equal(await readFile(tsconfigPath, 'utf8'), '{"include":[".next/types/**/*.ts"]}');
    assert.equal(
      await readFile(join(normalCacheDirectory, 'normal-cache-marker'), 'utf8'),
      'localhost:3000',
    );
    await assert.rejects(access(e2eTypeScriptConfigPath));
    await assert.rejects(access(e2eDirectory));
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});
