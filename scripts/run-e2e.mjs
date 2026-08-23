import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '../packages/database/dist/index.js';
import { cleanTestDatabase } from '../packages/database/dist/testing.js';
import {
  createE2eNextDistDirectoryName,
  createE2eTypeScriptConfig,
  createE2eTypeScriptConfigName,
  removeE2eNextDistDirectory,
  removeE2eTypeScriptConfig,
  restoreFileSnapshots,
  snapshotFiles,
} from './e2e-next-artifacts.mjs';
import { createTestRuntimeEnvironment } from './test-runtime-environment.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDirectory = resolve(rootDirectory, 'apps/web');
const rootRequire = createRequire(resolve(rootDirectory, 'package.json'));
const webRequire = createRequire(resolve(rootDirectory, 'apps/web/package.json'));
const nextCli = webRequire.resolve('next/dist/bin/next');
const playwrightCli = rootRequire.resolve('@playwright/test/cli');
const tsxCli = rootRequire.resolve('tsx/cli');

const configuredTestEnvironment = createTestRuntimeEnvironment();
const databaseUrl = process.env.TEST_DATABASE_URL ?? configuredTestEnvironment.TEST_DATABASE_URL;
if (!databaseUrl?.startsWith('postgresql://')) {
  throw new Error('TEST_DATABASE_URL is required for browser tests.');
}

const webPort = Number(process.env.E2E_WEB_PORT ?? '3000');
const apiPort = Number(process.env.E2E_API_PORT ?? '3101');
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webServerCommand = process.env.E2E_WEB_SERVER_MODE === 'production' ? 'start' : 'dev';
const e2eNextDistDirectoryName = createE2eNextDistDirectoryName();
const e2eTypeScriptConfigName = createE2eTypeScriptConfigName(e2eNextDistDirectoryName);
const nextManagedFiles = [resolve(webDirectory, 'next-env.d.ts')];

const runtimeEnvironment = createTestRuntimeEnvironment({
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  PORT: String(apiPort),
  CORS_ORIGINS: webBaseUrl,
  WEB_PUBLIC_URL: webBaseUrl,
  AUTH_PUBLIC_BASE_URL: webBaseUrl,
  AUTH_INTERNAL_BASE_URL: apiBaseUrl,
  API_BASE_URL: apiBaseUrl,
  NEXT_PUBLIC_API_BASE_URL: webBaseUrl,
  E2E_BASE_URL: webBaseUrl,
  VENUE_E2E_NEXT_DIST_DIR: e2eNextDistDirectoryName,
  VENUE_E2E_TSCONFIG: e2eTypeScriptConfigName,
});

async function waitForServer(server, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server on port ${port} stopped during startup with code ${server.exitCode}`);
    }

    const isListening = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (isListening) return;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server on port ${port} did not become ready within ${timeoutMs}ms`);
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;

  const stopped = new Promise((resolveStopped) => {
    child.once('exit', resolveStopped);
    child.once('error', resolveStopped);
  });

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await new Promise((resolveTaskkill) => {
      taskkill.once('exit', resolveTaskkill);
      taskkill.once('error', resolveTaskkill);
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // The process group already stopped.
    }
  }

  await Promise.race([stopped, new Promise((resolveStopped) => setTimeout(resolveStopped, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      stopped,
      new Promise((resolveStopped) => setTimeout(resolveStopped, 2_000)),
    ]);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

let apiServer;
let webServer;
let tests;
let managedFileSnapshots;
let databasePrepared = false;
let exitCode;

try {
  await cleanDatabase(databaseUrl);
  databasePrepared = true;
  const bootstrapLink = await createBootstrapLink(runtimeEnvironment);
  managedFileSnapshots = await snapshotFiles(nextManagedFiles);
  await createE2eTypeScriptConfig(webDirectory, e2eTypeScriptConfigName);

  apiServer = spawn(
    process.execPath,
    [tsxCli, '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'],
    {
      cwd: rootDirectory,
      detached: process.platform !== 'win32',
      env: runtimeEnvironment,
      stdio: 'inherit',
    },
  );
  webServer = spawn(process.execPath, [nextCli, webServerCommand, '-p', String(webPort)], {
    cwd: webDirectory,
    detached: process.platform !== 'win32',
    env: runtimeEnvironment,
    stdio: 'inherit',
  });

  await Promise.all([
    waitForServer(apiServer, apiPort, 120_000),
    waitForServer(webServer, webPort, 120_000),
  ]);
  tests = spawn(process.execPath, [playwrightCli, 'test'], {
    cwd: rootDirectory,
    detached: process.platform !== 'win32',
    env: { ...runtimeEnvironment, E2E_BOOTSTRAP_LINK: bootstrapLink },
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  exitCode = await new Promise((resolve, reject) => {
    let recentOutput = '';

    tests.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      recentOutput = `${recentOutput}${text}`.slice(-512);

      const match = recentOutput.match(/__VENUE_E2E_RESULT__=(\w+)/);
      if (match) resolve(match[1] === 'passed' ? 0 : 1);
    });
    tests.once('exit', (code) => resolve(code ?? 1));
    tests.once('error', reject);
  });
} finally {
  await stopProcessTree(tests);
  await stopProcessTree(webServer);
  await stopProcessTree(apiServer);
  try {
    if (databasePrepared) await cleanDatabase(databaseUrl);
  } finally {
    try {
      if (managedFileSnapshots) {
        await restoreFileSnapshots(managedFileSnapshots, e2eNextDistDirectoryName);
      }
    } finally {
      try {
        await removeE2eTypeScriptConfig(webDirectory, e2eTypeScriptConfigName);
      } finally {
        await removeE2eNextDistDirectory(webDirectory, e2eNextDistDirectoryName);
      }
    }
  }
}

process.exitCode = exitCode;

async function createBootstrapLink(environment) {
  const child = spawn(
    process.execPath,
    [tsxCli, '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/setup/create-bootstrap.cli.ts'],
    {
      cwd: rootDirectory,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let errorOutput = '';
  child.stdout.on('data', (chunk) => (output += chunk.toString()));
  child.stderr.on('data', (chunk) => (errorOutput += chunk.toString()));
  const code = await new Promise((resolve, reject) => {
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
    child.once('error', reject);
  });
  if (code !== 0) throw new Error(`Bootstrap link creation failed: ${errorOutput.trim()}`);
  const link = output
    .split(/\r?\n/)
    .find((line) => line.startsWith('http') && line.includes('/setup?token='));
  if (!link) throw new Error('Bootstrap command did not return a setup link.');
  return link;
}

async function cleanDatabase(connectionString) {
  const database = createDatabaseClient(connectionString);
  try {
    await cleanTestDatabase(database);
  } finally {
    await database.$disconnect();
  }
}
