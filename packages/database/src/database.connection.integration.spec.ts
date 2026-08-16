import { afterAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PostgreSQL connection', () => {
  let client: DatabaseClient | undefined;

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('executes a real query against the isolated test database', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const result = await client.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;

    expect(result).toEqual([{ value: 1 }]);
  });

  it('has the complete Phase 1 migration and database-level tenant constraints', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const tables = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('auth_user', 'organization', 'location', 'membership', 'invitation', 'audit_log')
      ORDER BY table_name
    `;
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'audit_log',
      'auth_user',
      'invitation',
      'location',
      'membership',
      'organization',
    ]);

    const tenantColumns = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'organization_id'
        AND table_name IN (
          'role_permission', 'membership_role', 'membership_location',
          'invitation_role', 'invitation_location'
        )
      ORDER BY table_name
    `;
    expect(tenantColumns).toHaveLength(5);

    const migration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260813000200_phase_1_auth_org'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });

  it('has the additive Phase 3 schema, dictionaries and composite tenant constraints', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const tables = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'artist', 'contact', 'contact_role', 'artist_contact', 'artist_contact_role',
          'business_partner', 'business_partner_role', 'business_partner_role_assignment',
          'business_partner_contact', 'business_partner_contact_role'
        )
      ORDER BY table_name
    `;
    expect(tables).toHaveLength(10);

    const tenantColumns = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'organization_id'
        AND table_name IN (
          'artist', 'contact', 'artist_contact', 'artist_contact_role',
          'business_partner', 'business_partner_role_assignment',
          'business_partner_contact', 'business_partner_contact_role'
        )
      ORDER BY table_name
    `;
    expect(tenantColumns).toHaveLength(8);

    const compositeForeignKeys = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND conname IN (
          'artist_contact_artist_id_organization_id_fkey',
          'artist_contact_contact_id_organization_id_fkey',
          'artist_contact_role_artist_contact_id_organization_id_fkey',
          'business_partner_role_assignment_business_partner_id_organization_id_fkey',
          'business_partner_contact_business_partner_id_organization_id_fkey',
          'business_partner_contact_contact_id_organization_id_fkey',
          'business_partner_contact_role_business_partner_contact_id_organization_id_fkey'
        )
    `;
    expect(compositeForeignKeys).toHaveLength(7);

    const businessChecks = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE contype = 'c'
        AND conname IN (
          'artist_identity_required',
          'artist_country_code_format',
          'artist_version_positive',
          'artist_archive_consistent',
          'contact_name_required',
          'contact_version_positive',
          'contact_archive_consistent',
          'artist_contact_version_positive',
          'business_partner_company_name_not_blank',
          'business_partner_country_code_format',
          'business_partner_billing_country_code_format',
          'business_partner_version_positive',
          'business_partner_archive_consistent',
          'business_partner_contact_version_positive'
        )
    `;
    expect(businessChecks).toHaveLength(14);

    const lifecycleValues = await client.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'EntityStatus'
      ORDER BY enumsortorder
    `;
    expect(lifecycleValues.map(({ enumlabel }) => enumlabel)).toEqual(['ACTIVE', 'ARCHIVED']);

    expect(await client.contactRole.count()).toBe(6);
    expect(await client.businessPartnerRole.count()).toBe(8);
    const migration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260816000100_phase_3_master_data'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });
});
