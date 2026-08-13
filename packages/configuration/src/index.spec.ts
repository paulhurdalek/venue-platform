import { describe, expect, it } from 'vitest';

import { apiEnvironmentSchema, parseEnvironment } from './index.js';

describe('parseEnvironment', () => {
  it('parses and normalizes a valid API environment', () => {
    const result = parseEnvironment(apiEnvironmentSchema, {
      DATABASE_URL: 'postgresql://venue:secret@localhost:5432/venue',
      CORS_ORIGINS: 'http://localhost:3000,https://example.test',
    });

    expect(result.PORT).toBe(3001);
    expect(result.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://example.test']);
    expect(result.SESSION_DURATION_SECONDS).toBe(604_800);
    expect(result.PASSWORD_MIN_LENGTH).toBe(12);
  });

  it('rejects missing required values without including their contents', () => {
    expect(() => parseEnvironment(apiEnvironmentSchema, {})).toThrow(
      'Invalid environment configuration. Check: DATABASE_URL',
    );
  });

  it('rejects local or weak secrets in production', () => {
    expect(() =>
      parseEnvironment(apiEnvironmentSchema, {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://venue:secret@localhost:5432/venue',
        CORS_ORIGINS: 'https://venue.example',
        WEB_PUBLIC_URL: 'https://venue.example',
      }),
    ).toThrow('BETTER_AUTH_SECRET');
  });

  it('rejects insecure production origins and weak rotation secrets', () => {
    expect(() =>
      parseEnvironment(apiEnvironmentSchema, {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://venue:secret@localhost:5432/venue',
        CORS_ORIGINS: 'http://venue.example',
        WEB_PUBLIC_URL: 'http://venue.example',
        AUTH_PUBLIC_BASE_URL: 'http://venue.example',
        BETTER_AUTH_SECRET: 'A7pQ2mZ9vK4sX8dN6tR3yW5cB1jL0uFo',
        BETTER_AUTH_SECRET_PREVIOUS: 'test-only-secret-never-use-in-production-1234567890',
      }),
    ).toThrow(/BETTER_AUTH_SECRET_PREVIOUS|WEB_PUBLIC_URL/);
  });

  it('requires the public Better Auth base to use the web origin', () => {
    expect(() =>
      parseEnvironment(apiEnvironmentSchema, {
        DATABASE_URL: 'postgresql://venue:secret@localhost:5432/venue',
        CORS_ORIGINS: 'http://localhost:3000',
        WEB_PUBLIC_URL: 'http://localhost:3000',
        AUTH_PUBLIC_BASE_URL: 'http://localhost:3002',
      }),
    ).toThrow('AUTH_PUBLIC_BASE_URL');
  });
});
