import type { DatabaseClient } from './index.js';

const expectedTestDatabaseName = 'venue_test';

export function assertSafeTestDatabaseUrl(testDatabaseUrl: string | undefined): {
  database: string;
  host: string;
  port: string;
} {
  if (!testDatabaseUrl) throw new Error('Sicherheitsabbruch: TEST_DATABASE_URL ist erforderlich.');
  let testUrl: URL;
  try {
    testUrl = new URL(testDatabaseUrl);
  } catch {
    throw new Error('Sicherheitsabbruch: TEST_DATABASE_URL ist keine gültige PostgreSQL-URL.');
  }
  const database = decodeURIComponent(testUrl.pathname).replace(/^\//, '');
  if (testUrl.protocol !== 'postgresql:' || database !== expectedTestDatabaseName) {
    throw new Error(
      `Sicherheitsabbruch: Testlauf verweigert die Datenbank ${database || 'unbekannt'}. Erwartet wird ausschließlich ${expectedTestDatabaseName}.`,
    );
  }
  return { database, host: testUrl.hostname, port: testUrl.port || '5432' };
}

const TEST_SCOPED_TABLES = [
  'document_status_history',
  'document_version',
  'document_offer_position',
  'document_content_block',
  'document',
  'document_number_sequence',
  'document_template_block',
  'document_template',
  'event_calculation_status_history',
  'ticket_component_allocation',
  'ticket_price_component',
  'additional_revenue',
  'ticket_price_tier',
  'event_service_position',
  'event_calculation',
  'event_format_service',
  'service_provider_price',
  'service',
  'service_category',
  'booking_status_history',
  'event_program_item',
  'booking',
  'event_lineup_requirement',
  'event_format_lineup_requirement',
  'location_occupancy',
  'venue_date_option',
  'event',
  'event_format',
  'artist_business_partner_contact_role',
  'artist_business_partner_contact',
  'artist_business_partner_role',
  'artist_business_partner',
  'business_partner_contact_role',
  'business_partner_contact',
  'business_partner_role_assignment',
  'artist_contact_role',
  'artist_contact',
  'business_partner',
  'artist',
  'contact',
  'audit_log',
  'invitation_location',
  'invitation_role',
  'invitation',
  'membership_location',
  'membership_role',
  'role_permission',
  'role',
  'membership',
  'location',
  'organization',
  'bootstrap_token',
  'auth_rate_limit',
  'auth_verification',
  'auth_session',
  'auth_account',
  'auth_user',
] as const;

const testCleanupSql = `
  TRUNCATE TABLE
    ${TEST_SCOPED_TABLES.map((table) => `"${table}"`).join(',\n    ')}
  RESTART IDENTITY CASCADE
`;

export async function cleanTestDatabase(
  database: Pick<DatabaseClient, '$executeRawUnsafe'>,
  testDatabaseUrl = process.env.TEST_DATABASE_URL,
): Promise<void> {
  const target = assertSafeTestDatabaseUrl(testDatabaseUrl);
  console.info(
    `Testdatenbank-Reset: Host ${target.host}, Port ${target.port}, Datenbank ${target.database}`,
  );
  // permission, contact_role and business_partner_role are migration-owned global catalogs.
  await database.$executeRawUnsafe(testCleanupSql);
}
