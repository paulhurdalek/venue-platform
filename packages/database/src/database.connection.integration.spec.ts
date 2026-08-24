import { readFile } from 'node:fs/promises';

import { afterAll, describe, expect, it } from 'vitest';

import { createDatabaseClient, type DatabaseClient } from './index.js';
import { cleanTestDatabase } from './testing.js';

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

  it('has the additive Phase 5 event schema, snapshot keys and relational invariants', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const table = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'event'
    `;
    expect(table).toHaveLength(1);

    const checks = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE contype = 'c'
        AND conname IN (
          'event_name_not_blank',
          'event_format_name_snapshot_not_blank',
          'event_timezone_snapshot_not_blank',
          'event_version_positive',
          'event_source_format_version_positive',
          'event_status_timestamps_consistent',
          'event_technical_get_in_range',
          'event_artist_get_in_range',
          'event_doors_range',
          'event_start_range',
          'event_end_range',
          'event_doors_before_start',
          'event_technical_get_in_before_start',
          'event_artist_get_in_before_start',
          'event_end_after_start'
        )
    `;
    expect(checks).toHaveLength(15);

    const tenantForeignKeys = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND conname IN ('event_location_tenant_fkey', 'event_source_format_tenant_fkey')
    `;
    expect(tenantForeignKeys).toHaveLength(2);
    expect(await client.permission.count({ where: { key: { startsWith: 'events.' } } })).toBe(3);

    const migration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260823000100_phase_5_events'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });

  it('has the additive Phase 5 occupancy follow-up without rewriting the base migration', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    const tables = await client.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('venue_date_option', 'location_occupancy')
      ORDER BY table_name
    `;
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'location_occupancy',
      'venue_date_option',
    ]);
    const constraints = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE conname IN (
        'event_snapshot_source_consistent',
        'venue_date_option_end_after_start',
        'venue_date_option_location_tenant_fkey',
        'location_occupancy_one_source',
        'location_occupancy_no_overlap'
      )
    `;
    expect(constraints).toHaveLength(5);
    expect(await client.permission.count({ where: { key: { startsWith: 'date_options.' } } })).toBe(
      3,
    );
    const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name IN (
        '20260823000100_phase_5_events',
        '20260823000200_phase_5_occupancy_options'
      )
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migrations).toHaveLength(2);
  });

  it('has the additive Phase 6 follow-up and executes its legacy Booking backfill losslessly', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    await cleanTestDatabase(client);
    const migrationSql = await readFile(
      new URL(
        '../prisma/migrations/20260824000100_phase_6_booking_performances/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const hotelBackfill = migrationSql.match(/UPDATE "booking"[\s\S]+?END;/)?.[0];
    const performanceBackfill = migrationSql.match(
      /INSERT INTO "event_program_item"[\s\S]+?FROM "booking";/,
    )?.[0];
    expect(hotelBackfill).toBeTruthy();
    expect(performanceBackfill).toBeTruthy();

    const organization = await client.organization.create({
      data: { name: 'Phase 6 migration venue' },
    });
    const location = await client.location.create({
      data: {
        organizationId: organization.id,
        name: 'Migration Hall',
        timezone: 'Europe/Berlin',
      },
    });
    const event = await client.event.create({
      data: {
        organizationId: organization.id,
        locationId: location.id,
        name: 'Migration Event',
        eventDate: new Date('2026-10-15T00:00:00Z'),
        eventKind: 'OWN_PRODUCTION',
        timezone: 'Europe/Berlin',
      },
    });
    const artist = await client.artist.create({
      data: { organizationId: organization.id, stageName: 'Legacy Artist' },
    });
    const booking = await client.booking.create({
      data: {
        organizationId: organization.id,
        eventId: event.id,
        artistId: artist.id,
        role: 'ARTIST',
        lineupOrder: 7,
        performanceDurationMinutes: 10,
        hotelRequired: true,
      },
    });

    await client.$executeRawUnsafe(hotelBackfill!);
    await client.$executeRawUnsafe(performanceBackfill!);

    expect(await client.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({
      hotelRequired: true,
      hotelArrangement: 'REQUIRED',
      performanceDurationMinutes: 10,
      lineupOrder: 7,
    });
    expect(await client.eventProgramItem.findMany({ where: { bookingId: booking.id } })).toEqual([
      expect.objectContaining({
        organizationId: organization.id,
        eventId: event.id,
        kind: 'PERFORMANCE',
        sortOrder: 1,
        durationMinutes: 10,
        version: 1,
      }),
    ]);

    const constraints = await client.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE conname IN (
        'booking_hotel_buyout_pair',
        'event_program_item_kind_booking',
        'event_program_item_order_positive',
        'event_program_item_duration_positive',
        'event_program_item_version_positive',
        'event_program_item_event_tenant_fkey',
        'event_program_item_booking_tenant_event_fkey'
      )
    `;
    expect(constraints).toHaveLength(7);
    const obsoleteIndex = await client.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'booking_active_artist_role_key'
    `;
    expect(obsoleteIndex).toHaveLength(0);
    const migration = await client.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE migration_name = '20260824000100_phase_6_booking_performances'
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    expect(migration).toHaveLength(1);
  });

  it('preserves migration-owned permissions while clearing tenant authorization data', async () => {
    client = createDatabaseClient(testDatabaseUrl!);
    await cleanTestDatabase(client);
    const permissionCountBefore = await client.permission.count();
    const eventFormatPermission = await client.permission.findUniqueOrThrow({
      where: { key: 'event_formats.read' },
    });
    const organization = await client.organization.create({
      data: { name: 'Cleanup regression venue' },
    });
    const role = await client.role.create({
      data: {
        organizationId: organization.id,
        key: 'cleanup_regression',
        name: 'Cleanup regression',
      },
    });
    await client.rolePermission.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        permissionId: eventFormatPermission.id,
      },
    });

    await cleanTestDatabase(client);

    expect(await client.organization.count({ where: { id: organization.id } })).toBe(0);
    expect(await client.role.count({ where: { id: role.id } })).toBe(0);
    expect(await client.rolePermission.count({ where: { roleId: role.id } })).toBe(0);
    expect(await client.permission.count()).toBe(permissionCountBefore);
    expect(
      await client.permission.count({ where: { key: { startsWith: 'event_formats.' } } }),
    ).toBe(3);
    expect(await client.permission.count({ where: { key: { startsWith: 'events.' } } })).toBe(3);
    expect(await client.permission.count({ where: { key: { startsWith: 'date_options.' } } })).toBe(
      3,
    );
  });
});
