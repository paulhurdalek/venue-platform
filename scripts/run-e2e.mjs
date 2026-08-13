import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(resolve(rootDirectory, 'package.json'));
const webRequire = createRequire(resolve(rootDirectory, 'apps/web/package.json'));
const nextCli = webRequire.resolve('next/dist/bin/next');
const playwrightCli = rootRequire.resolve('@playwright/test/cli');

const server = spawn(process.execPath, [nextCli, 'dev', '-p', '3000'], {
  cwd: resolve(rootDirectory, 'apps/web'),
  detached: process.platform !== 'win32',
  env: process.env,
  stdio: 'inherit',
});

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Web server stopped during startup with code ${server.exitCode}`);
    }

    const isListening = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port: 3000 });
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

  throw new Error(`Web server did not become ready within ${timeoutMs}ms`);
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
  await waitForServer(120_000);
  const tests = spawn(process.execPath, [playwrightCli, 'test'], {
    cwd: rootDirectory,
    detached: process.platform !== 'win32',
    env: process.env,
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
  await stopProcessTree(server);
}

process.exitCode = exitCode;
