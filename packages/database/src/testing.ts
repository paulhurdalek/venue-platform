import type { DatabaseClient } from './index.js';

const TEST_SCOPED_TABLES = [
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
): Promise<void> {
  // permission, contact_role and business_partner_role are migration-owned global catalogs.
  await database.$executeRawUnsafe(testCleanupSql);
}
