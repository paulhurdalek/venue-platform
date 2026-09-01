import { describe, expect, it } from 'vitest';

import { assertSafeTestDatabaseUrl } from './testing.js';

describe('assertSafeTestDatabaseUrl', () => {
  it('accepts the local test database', () => {
    expect(assertSafeTestDatabaseUrl('postgresql://venue:test@localhost:5433/venue_test')).toEqual({
      database: 'venue_test',
      host: 'localhost',
      port: '5433',
    });
  });

  it('accepts a dynamically mapped container port', () => {
    expect(
      assertSafeTestDatabaseUrl('postgresql://venue:test@127.0.0.1:49152/venue_test'),
    ).toMatchObject({ database: 'venue_test', port: '49152' });
  });

  it.each(['venue_development', 'another_database'])('rejects %s', (database) => {
    expect(() =>
      assertSafeTestDatabaseUrl(`postgresql://venue:test@localhost:5432/${database}`),
    ).toThrow('Sicherheitsabbruch: Testlauf verweigert die Datenbank');
  });

  it('allows identical test runtime URLs', () => {
    const url = 'postgresql://venue:test@localhost:5433/venue_test';
    expect(assertSafeTestDatabaseUrl(url)).toMatchObject({ database: 'venue_test' });
  });
});
