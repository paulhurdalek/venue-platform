import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabaseClient } from '../packages/database/dist/index.js';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(resolve(rootDirectory, 'package.json'));
const webRequire = createRequire(resolve(rootDirectory, 'apps/web/package.json'));
const nextCli = webRequire.resolve('next/dist/bin/next');
const playwrightCli = rootRequire.resolve('@playwright/test/cli');
const tsxCli = rootRequire.resolve('tsx/cli');

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl?.startsWith('postgresql://')) {
  throw new Error('TEST_DATABASE_URL is required for browser tests.');
}

const runtimeEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  PORT: '3101',
  CORS_ORIGINS: 'http://127.0.0.1:3000',
  WEB_PUBLIC_URL: 'http://127.0.0.1:3000',
  AUTH_PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
  AUTH_INTERNAL_BASE_URL: 'http://127.0.0.1:3101',
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? 'test-only-secret-never-use-in-production-1234567890',
  SESSION_DURATION_SECONDS: process.env.SESSION_DURATION_SECONDS ?? '3600',
  PASSWORD_MIN_LENGTH: process.env.PASSWORD_MIN_LENGTH ?? '10',
  BOOTSTRAP_TOKEN_TTL_SECONDS: process.env.BOOTSTRAP_TOKEN_TTL_SECONDS ?? '600',
  INVITATION_TTL_SECONDS: process.env.INVITATION_TTL_SECONDS ?? '3600',
  RATE_LIMIT_WINDOW_SECONDS: process.env.RATE_LIMIT_WINDOW_SECONDS ?? '60',
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ?? '100',
  AUTH_SIGN_IN_RATE_LIMIT_MAX: process.env.AUTH_SIGN_IN_RATE_LIMIT_MAX ?? '20',
  SENSITIVE_RATE_LIMIT_MAX: process.env.SENSITIVE_RATE_LIMIT_MAX ?? '50',
  LOG_LEVEL: 'warn',
  SWAGGER_UI_ENABLED: 'false',
  API_BASE_URL: 'http://127.0.0.1:3101',
  NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3000',
};

await cleanDatabase(databaseUrl);
const bootstrapLink = await createBootstrapLink(runtimeEnvironment);

const apiServer = spawn(
  process.execPath,
  [tsxCli, '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'],
  {
    cwd: rootDirectory,
    detached: process.platform !== 'win32',
    env: runtimeEnvironment,
    stdio: 'inherit',
  },
);

const webServer = spawn(process.execPath, [nextCli, 'dev', '-p', '3000'], {
  cwd: resolve(rootDirectory, 'apps/web'),
  detached: process.platform !== 'win32',
  env: runtimeEnvironment,
  stdio: 'inherit',
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
  if (!child.pid || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    child.kill();
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // The process group already stopped.
  }
}

let exitCode;

try {
  await Promise.all([
    waitForServer(apiServer, 3101, 120_000),
    waitForServer(webServer, 3000, 120_000),
  ]);
  const tests = spawn(process.execPath, [playwrightCli, 'test'], {
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

  await stopProcessTree(tests);
} finally {
  await stopProcessTree(webServer);
  await stopProcessTree(apiServer);
  await cleanDatabase(databaseUrl);
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
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE
        "business_partner_contact_role", "business_partner_contact",
        "business_partner_role_assignment", "artist_contact_role", "artist_contact",
        "business_partner", "artist", "contact", "audit_log",
        "invitation_location", "invitation_role", "invitation",
        "membership_location", "membership_role", "role_permission", "role", "permission",
        "membership", "location", "organization", "bootstrap_token", "auth_rate_limit",
        "auth_verification", "auth_session", "auth_account", "auth_user"
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await database.$disconnect();
  }
}
