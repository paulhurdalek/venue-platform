import { defineConfig } from 'vitest/config';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://venue:test@localhost:5433/venue_test';
process.env.CORS_ORIGINS ??= 'http://localhost:3100';
process.env.LOG_LEVEL ??= 'warn';
process.env.SWAGGER_UI_ENABLED ??= 'false';

export default defineConfig({
  test: {
    restoreMocks: true,
  },
});
