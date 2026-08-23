# Database and migration conventions

PostgreSQL is the system of record. Prisma Migrate is the only schema-change path. Automated and
production environments run only `prisma migrate deploy`; `prisma db push` and Better Auth runtime
schema generation are forbidden.

## Phase 1 migration

`20260813000200_phase_1_auth_org` is applied after the unchanged Phase 0 migration. It creates:

- Better Auth user, account, session, verification, and database rate-limit tables;
- bootstrap tokens, organizations, locations, memberships, permissions, and roles;
- organization-keyed role, membership, Location, and invitation mapping tables;
- invitations and append-only audit records;
- UUID defaults, unique keys, tenant-aware indexes, check constraints, restrictive business
  foreign keys, and an audit update/delete prevention trigger.

All new IDs use PostgreSQL `gen_random_uuid()`. Better Auth is configured with its supported
`advanced.database.generateId: "uuid"` option so runtime-created identity rows follow the same
convention. Business associations do not cascade on delete. Composite foreign keys prevent a role,
membership, Location, or invitation mapping from crossing its `organization_id` boundary.

Mutable organization, Location, and membership rows have positive integer versions. Updates use
`WHERE id = ? AND organization_id = ? AND version = ?` and atomically increment the version; zero
updated rows become HTTP 409.

## Phase 3 migration

`20260816000100_phase_3_master_data` is additive and leaves both Phase 0 and Phase 1 migrations
unchanged. It creates Artist, Contact and Business Partner tables; normalized Contact assignments;
Contact-role and partner-role dictionaries; normalized partner-role assignments; checks for
identity, country codes, lifecycle consistency and positive versions; and tenant-aware indexes and
composite foreign keys.

The migration seeds only non-personal fixed dictionaries and nine stable permission definitions.
It backfills the Phase-3 matrix for every existing organization-local standard role with
conflict-safe inserts. `SetupService` uses the same source matrix when a future organization is
created. No example Artist, Contact or partner rows are seeded.

Artist, Contact and Business Partner updates use the same optimistic `WHERE id + organization_id +
version` pattern. Role-bearing Contact associations also have versions. Business entities use
restrictive foreign keys and are archived rather than deleted.

## Phase 4 migration

`20260822000100_phase_4_event_formats` is additive on the merged Phase-3 schema. It creates the
organization-owned `event_format` table, the two-value `EventKind` and three-value
`RecordingDefault` enums, a tenant-scoped unique normalized name, lifecycle/version checks and
stable list/search indexes. Local time defaults use nullable integer columns. Get-ins, doors and
start are constrained to `0..1439`; end is constrained to `0..2879` for a next-day end. SQL checks
also enforce known start-relative ordering without inferring an order from missing optional values.

The migration adds the three stable `event_formats.*` permissions and backfills all existing
organization-local standard roles with conflict-safe inserts. Setup uses the same application
catalog for future organizations. No example format, event, snapshot or generic template row is
seeded.

## Workflow

1. Change `packages/database/prisma/schema.prisma`.
2. Generate a migration against the Phase 0 development state.
3. Review and, where required, add PostgreSQL checks and indexes.
4. Run `pnpm db:migrate:deploy` on a fresh isolated PostgreSQL database.
5. Run `pnpm test:db` and `pnpm test:integration` with `TEST_DATABASE_URL`.
6. Commit schema and migration together; never edit a migration after deployment.
