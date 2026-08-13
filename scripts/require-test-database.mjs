const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl?.startsWith('postgresql://')) {
  throw new Error(
    'TEST_DATABASE_URL is required for the explicit database integration test. Load .env.test or set it in CI.',
  );
}
