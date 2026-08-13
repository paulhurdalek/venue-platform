# Database and migration conventions

PostgreSQL is the system of record. Prisma Migrate is the only authoritative schema-change path.
The development and test databases are separate server instances and use distinct credentials,
ports, and database names in Compose.

## Workflow

1. Change `packages/database/prisma/schema.prisma`.
2. Run `pnpm db:migrate:dev` against the development database.
3. Inspect the generated SQL. Rename the migration meaningfully when needed.
4. Run `pnpm db:migrate:deploy` and the database tests.
5. Commit the schema and migration together.

Automated and production environments run only `prisma migrate deploy`. `prisma db push` is never
used. Applied migration files are immutable; corrections are new migrations.

## Phase 0 migration

`20260813000100_phase_0_foundation` enables PostgreSQL `pgcrypto` for future UUID generation. It
creates no business table and makes no organization, tenant, or location modeling decision.

## Data conventions for later phases

- **Identifiers:** UUID v4 unless a domain has a reviewed reason for another identifier. Generate
  IDs in PostgreSQL or the domain boundary, never from a sequential public counter.
- **Timestamps:** use `timestamptz`, store instants in UTC, expose ISO 8601, and convert only at UI
  boundaries. Standard records use `createdAt` and `updatedAt`.
- **Decimals:** use PostgreSQL `numeric` with an explicitly chosen precision and scale. JavaScript
  floating-point numbers are forbidden for persisted money or rates.
- **Currencies:** store an ISO 4217 uppercase currency code beside monetary values. Do not assume a
  platform-wide default currency.
- **Archiving:** prefer a nullable `archivedAt` timestamp when history must remain visible. Hard
  deletion requires an explicit lifecycle rule; soft deletion is not applied universally.
- **Optimistic concurrency:** mutable aggregates use an integer `version`, checked and incremented
  atomically by the repository. A failed expected-version condition is a conflict, not a retryable
  success.
- **Tenancy:** future tenant-owned rows carry an explicit tenant/organization key and tenant-aware
  indexes. The precise model is a Phase 1 decision.

Use `PrismaService.transaction` in API application use cases or `withTransaction` in non-Nest
code. Domain code remains unaware of Prisma transaction types.
