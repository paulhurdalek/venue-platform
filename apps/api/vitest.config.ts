import { defineConfig } from 'vitest/config';

process.env.NODE_ENV ??= 'test';
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for API tests. Load .env.test.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.CORS_ORIGINS ??= 'http://localhost:3100';
process.env.WEB_PUBLIC_URL ??= 'http://localhost:3100';
process.env.AUTH_PUBLIC_BASE_URL ??= 'http://localhost:3100';
process.env.AUTH_INTERNAL_BASE_URL ??= 'http://localhost:3101';
process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-never-use-in-production-1234567890';
process.env.LOG_LEVEL ??= 'warn';
process.env.SWAGGER_UI_ENABLED ??= 'false';

export default defineConfig({
  test: {
    fileParallelism: false,
    restoreMocks: true,
  },
});
