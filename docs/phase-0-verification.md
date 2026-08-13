# Phase 0 verification record

Date: 2026-08-13

## PostgreSQL 18 volume correction

The development volume and test tmpfs in `compose.yaml` now both mount at
`/var/lib/postgresql`, matching the PostgreSQL 18 official image layout. No Prisma schema,
migration, or business model changed.

A reproducible `pnpm test:containers` acceptance test was added. It runs under an isolated Compose
project name and volume, and is now the CI `containers` job. On a Docker-enabled host it verifies,
in order:

1. both PostgreSQL Compose services become healthy;
2. the committed Prisma migration applies to the test database;
3. the real database integration test passes;
4. a database marker in the development service survives stopping, removing, and recreating its
   container;
5. the web, API, and worker images build successfully.

The verification removes only its isolated temporary Compose volume. It does not access the normal
development volume.

### Checks actually rerun after the correction

- `pnpm verify`: passed, covering formatting, ESLint, TypeScript, OpenAPI/client generation,
  unit/API integration tests, and production workspace builds.
- `pnpm test:e2e`: passed in Chromium (`1 passed`).
- `pnpm peers check`: passed with no peer dependency issues.
- `pnpm security:audit`: passed with no known production vulnerabilities.
- Node syntax validation of `scripts/verify-containers.mjs`: passed.
- Static YAML parsing and assertions: passed for both corrected PostgreSQL mount targets and the CI
  invocation of `pnpm test:containers`.
- `pnpm test:containers`: invoked, but its Docker preflight could not start because the local
  environment has no `docker` executable. None of its five container operations were therefore
  represented as locally successful.

## Successful local checks

- Dependency installation with the locked pnpm 11.21.0 graph.
- `pnpm peers check`: no peer dependency issues.
- `pnpm api:generate`: OpenAPI 3.0 document and typed client regenerated; the resulting contract
  contains `/api/v1/health`.
- `pnpm verify`: formatting, ESLint, TypeScript, unit/integration suite, API/worker compilation, and
  the Next.js production build all passed.
- `pnpm test:unit`: API application use case and worker lifecycle passed.
- `pnpm test:integration`: versioned health route, secure headers, and safe error envelope passed.
- `pnpm test:e2e`: Chromium rendered the neutral Phase 0 page successfully.
- `pnpm security:audit`: no known production dependency vulnerabilities.
- `pnpm peers check`: no peer dependency conflicts.
- Production API and worker deployment bundles were assembled and their ESM entry modules loaded
  successfully.
- `compose.yaml` parsed successfully and contains the isolated `postgres` and `postgres-test`
  services.

The ordinary test suite intentionally skipped one PostgreSQL integration test because
`TEST_DATABASE_URL` was absent. The explicit `pnpm test:db` command does not skip silently: it
requires that variable and CI supplies it.

## Environment-limited checks

Docker, Podman, and a local PostgreSQL client/server are unavailable in the implementation
environment. Consequently, these checks were not executed locally:

- starting PostgreSQL with Docker Compose;
- applying the initial migration to a real PostgreSQL instance;
- executing the real Prisma connection test;
- building the three Docker images.

The CI workflow supplies PostgreSQL for the quality job and runs the new isolated Docker Compose
acceptance test in the container job. Formal Phase 0 acceptance requires that container-enabled
job to pass before Phase 1 begins.
