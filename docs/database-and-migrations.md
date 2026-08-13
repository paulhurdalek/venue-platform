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

## Workflow

1. Change `packages/database/prisma/schema.prisma`.
2. Generate a migration against the Phase 0 development state.
3. Review and, where required, add PostgreSQL checks and indexes.
4. Run `pnpm db:migrate:deploy` on a fresh isolated PostgreSQL database.
5. Run `pnpm test:db` and `pnpm test:integration` with `TEST_DATABASE_URL`.
6. Commit schema and migration together; never edit a migration after deployment.
