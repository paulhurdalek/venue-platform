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
          'business_partner_contact', 'business_partner_contact_role',
          'artist_business_partner', 'artist_business_partner_role',
          'artist_business_partner_contact', 'artist_business_partner_contact_role'
        )
      ORDER BY table_name
    `;
    expect(tables).toHaveLength(14);

    const tenantColumns = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'organization_id'
        AND table_name IN (
          'artist', 'contact', 'artist_contact', 'artist_contact_role',
          'business_partner', 'business_partner_role_assignment',
          'business_partner_contact', 'business_partner_contact_role',
          'artist_business_partner', 'artist_business_partner_role',
          'artist_business_partner_contact', 'artist_business_partner_contact_role'
        )
      ORDER BY table_name
    `;
    expect(tenantColumns).toHaveLength(12);

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
          'business_partner_contact_role_business_partner_contact_id_organization_id_fkey',
          'artist_business_partner_artist_tenant_fkey',
          'artist_business_partner_partner_tenant_fkey',
          'artist_business_partner_role_parent_tenant_fkey',
          'artist_partner_contact_parent_tenant_partner_fkey',
          'artist_partner_contact_source_tenant_partner_fkey',
          'artist_partner_contact_role_parent_tenant_fkey'
        )
    `;
    expect(compositeForeignKeys).toHaveLength(13);

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
          'business_partner_contact_version_positive',
          'artist_business_partner_version_positive',
          'artist_business_partner_contact_version_positive'
        )
    `;
    expect(businessChecks).toHaveLength(16);

    const primaryRepresentativeIndex = await client.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'artist_partner_contact_primary_key'
        AND indexdef LIKE '%WHERE (is_primary = true)%'
    `;
    expect(primaryRepresentativeIndex).toHaveLength(1);

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
    const representationMigration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260817000100_artist_representations'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(representationMigration).toHaveLength(1);
  });

  it('has the additive Phase 4 event-format schema and relational invariants', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const table = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'event_format'
    `;
    expect(table).toHaveLength(1);

    const checks = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE contype = 'c'
        AND conname IN (
          'event_format_name_not_blank',
          'event_format_version_positive',
          'event_format_archive_consistent',
          'event_format_technical_get_in_range',
          'event_format_artist_get_in_range',
          'event_format_doors_range',
          'event_format_start_range',
          'event_format_end_range',
          'event_format_doors_before_start',
          'event_format_technical_get_in_before_start',
          'event_format_artist_get_in_before_start',
          'event_format_end_after_start'
        )
    `;
    expect(checks).toHaveLength(12);

    const uniqueName = await client.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'event_format_organization_id_normalized_name_key'
    `;
    expect(uniqueName).toHaveLength(1);
    expect(
      await client.permission.count({ where: { key: { startsWith: 'event_formats.' } } }),
    ).toBe(3);

    const migration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260822000100_phase_4_event_formats'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });
});
