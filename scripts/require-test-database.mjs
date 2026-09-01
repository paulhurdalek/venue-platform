const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl?.startsWith('postgresql://')) {
  throw new Error(
    'TEST_DATABASE_URL is required for the explicit database integration test. Load .env.test or set it in CI.',
  );
}
const parsed = new URL(testDatabaseUrl);
const database = decodeURIComponent(parsed.pathname).replace(/^\//, '');
if (database !== 'venue_test') {
  throw new Error(
    `Sicherheitsabbruch: Testlauf verweigert die Datenbank ${database || 'unbekannt'}. Erwartet wird ausschließlich venue_test.`,
  );
}
if (process.env.DATABASE_URL) {
  const development = new URL(process.env.DATABASE_URL);
  if (
    development.hostname === parsed.hostname &&
    development.port === parsed.port &&
    decodeURIComponent(development.pathname).replace(/^\//, '') === database
  ) {
    throw new Error(
      'Sicherheitsabbruch: TEST_DATABASE_URL und DATABASE_URL verweisen auf dieselbe Datenbank.',
    );
  }
}
console.info(
  `Testdatenbank: Host ${parsed.hostname}, Port ${parsed.port || '5432'}, Datenbank ${database}`,
);
