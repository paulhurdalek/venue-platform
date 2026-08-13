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
  });

  it('rejects missing required values without including their contents', () => {
    expect(() => parseEnvironment(apiEnvironmentSchema, {})).toThrow(
      'Invalid environment configuration. Check: DATABASE_URL',
    );
  });
});
