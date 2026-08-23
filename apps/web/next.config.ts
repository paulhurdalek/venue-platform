import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import type { NextConfig } from 'next';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rootEnvironmentFile = path.join(directory, '../../.env');
const isolatedE2eDistDirectory = /^\.next-e2e-[a-z0-9-]+$/;
const isolatedE2eTypeScriptConfig = /^tsconfig\.e2e-[a-z0-9-]+\.json$/;

if (existsSync(rootEnvironmentFile)) {
  process.loadEnvFile(rootEnvironmentFile);
}

export function resolveNextDistDirectory(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.VENUE_E2E_NEXT_DIST_DIR?.trim();
  if (!configured) return '.next';
  if (!isolatedE2eDistDirectory.test(configured)) {
    throw new Error('VENUE_E2E_NEXT_DIST_DIR must be a project-local directory named .next-e2e-*');
  }
  return configured;
}

export function resolveNextTypeScriptConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.VENUE_E2E_TSCONFIG?.trim();
  if (!configured) return 'tsconfig.json';
  if (!isolatedE2eTypeScriptConfig.test(configured)) {
    throw new Error('VENUE_E2E_TSCONFIG must be a project-local file named tsconfig.e2e-*.json');
  }
  return configured;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir: resolveNextDistDirectory(),
  output: 'standalone',
  outputFileTracingRoot: path.join(directory, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: {
    tsconfigPath: resolveNextTypeScriptConfig(),
  },
  logging: {
    incomingRequests: false,
    browserToTerminal: 'error',
  },
  async rewrites() {
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
