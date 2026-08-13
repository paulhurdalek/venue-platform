import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pnpmPackagePath = require.resolve('pnpm');
const pnpmPackage = JSON.parse(readFileSync(pnpmPackagePath, 'utf8'));
const pnpmCli = resolve(dirname(pnpmPackagePath), pnpmPackage.bin.pnpm);
const projectName = `venue-platform-phase0-${process.pid}`;
const marker = randomUUID();
const composeArguments = ['compose', '--project-name', projectName, '--profile', 'test'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    throw new Error(`Unable to execute ${command}: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFailure) {
    const details = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}.${details}`);
  }

  return result;
}

function docker(...args) {
  return run('docker', args);
}

function compose(...args) {
  return docker(...composeArguments, ...args);
}

function pnpm(args, environment) {
  return run(process.execPath, [pnpmCli, ...args], {
    env: { ...process.env, ...environment },
  });
}

function logStep(step, message) {
  process.stdout.write(`\n[${step}/5] ${message}\n`);
}

try {
  run('docker', ['version'], { capture: true });
  run('docker', ['compose', 'version'], { capture: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Phase 0 container verification cannot start: ${message}\n`);
  process.exit(1);
}

try {
  logStep(1, 'Starting PostgreSQL development and test services');
  compose('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres', 'postgres-test');

  const testDatabaseEnvironment = {
    DATABASE_URL: 'postgresql://venue:venue_test_local_only@127.0.0.1:5433/venue_test',
    TEST_DATABASE_URL: 'postgresql://venue:venue_test_local_only@127.0.0.1:5433/venue_test',
  };

  logStep(2, 'Applying the committed Prisma migrations to the test database');
  pnpm(['db:migrate:deploy'], testDatabaseEnvironment);

  logStep(3, 'Running the real database integration test');
  pnpm(['test:db'], testDatabaseEnvironment);

  logStep(4, 'Verifying development data survives container replacement');
  compose(
    'exec',
    '--no-TTY',
    'postgres',
    'psql',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    'venue',
    '--dbname',
    'venue_development',
    '--command',
    `DROP SCHEMA IF EXISTS phase0_container_verification CASCADE;
     CREATE SCHEMA phase0_container_verification;
     CREATE TABLE phase0_container_verification.persistence_probe (marker uuid PRIMARY KEY);
     INSERT INTO phase0_container_verification.persistence_probe (marker) VALUES ('${marker}');`,
  );
  compose('stop', 'postgres');
  compose('rm', '--force', 'postgres');
  compose('up', '--detach', '--wait', '--wait-timeout', '120', 'postgres');

  const persistenceResult = run(
    'docker',
    [
      ...composeArguments,
      'exec',
      '--no-TTY',
      'postgres',
      'psql',
      '--tuples-only',
      '--no-align',
      '--username',
      'venue',
      '--dbname',
      'venue_development',
      '--command',
      `SELECT marker FROM phase0_container_verification.persistence_probe WHERE marker = '${marker}';`,
    ],
    { capture: true },
  );

  if (persistenceResult.stdout.trim() !== marker) {
    throw new Error('The persistence marker was not present after recreating postgres.');
  }

  compose(
    'exec',
    '--no-TTY',
    'postgres',
    'psql',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    'venue',
    '--dbname',
    'venue_development',
    '--command',
    'DROP SCHEMA phase0_container_verification CASCADE;',
  );

  logStep(5, 'Building the web, API, and worker application images');
  for (const application of ['web', 'api', 'worker']) {
    docker(
      'build',
      '--file',
      `apps/${application}/Dockerfile`,
      '--tag',
      `venue-${application}:phase0-verification`,
      '.',
    );
  }

  process.stdout.write('\nPhase 0 container verification passed.\n');
} finally {
  run('docker', [...composeArguments, 'down', '--volumes', '--remove-orphans'], {
    allowFailure: true,
  });
}
