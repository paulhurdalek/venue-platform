# Phase 4 verification

This document records the reproducible acceptance evidence for organization-wide event formats.
Commands are run from the repository root with the pinned Node.js 24 and pnpm 11 toolchain.

## Coverage

- Domain unit tests cover Unicode/name normalization, local minute conversion, next-day rendering,
  optional schedules and invalid time ordering.
- PostgreSQL integration tests cover the additive migration, permission backfill, CRUD,
  same-tenant name conflicts, cross-tenant name reuse, tenant isolation, filtering, pagination,
  optimistic versions, lifecycle, safe audit metadata and preservation of migration-owned
  permission catalogs during shared API/E2E cleanup.
- The existing Phase-1 and Phase-3 integration suites remain part of every database run and assert
  the expanded standard-role matrix. A separate boundary test proves the configured sign-in rate
  limit returns 429 and clears its counters even when an assertion fails.
- Seven serial Playwright scenarios cover Phase-1 bootstrap/administration, Phase-3 master data and
  relationships, and Phase-4 empty/create/read/edit/lifecycle/responsive/read-only behavior. Every
  focused scenario has its own 90-second limit while the administrator context and organization ID
  are deliberately reused.
- The E2E setup regression covers isolated Next build paths, rejection of unsafe paths, restoration
  of Next-managed files, preservation of the normal `.next` development cache, and replacement of
  inherited development limits by the canonical test environment.

## Required acceptance commands

The corrected local acceptance run on 2026-08-23 produced these results:

| Command                                                       | Result | Evidence                                                                                                                                                      |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd verify`                                             | passed | Formatting, ESLint, generated OpenAPI/client, TypeScript, serial workspace tests (including four E2E-setup regressions) and all production builds passed.     |
| `pnpm.cmd test:e2e:setup`                                     | passed | 4/4 regressions passed within `verify`, including inherited development-limit replacement and isolated Next artifact cleanup.                                 |
| `pnpm.cmd db:migrate:test`                                    | passed | PostgreSQL on `localhost:5433` was reachable; all five migrations were already applied.                                                                       |
| `.env.test` + `pnpm.cmd --filter @venue/api test:integration` | passed | 4/4 files and 33/33 tests passed in 21.01 s, including six Phase-4 sign-ins, tenant isolation and the separate real 429 boundary test with counter cleanup.   |
| `.env.test` + `pnpm.cmd test:db`                              | passed | 5/5 tests passed after the API suites and again after E2E cleanup; the unchanged exact assertion found three `event_formats.*` permissions.                   |
| `pnpm.cmd test:e2e`                                           | passed | 7/7 focused Chromium scenarios passed in 56.0 s; Phase 1, Phase 3, Phase 4 and the independent read-only browser context all executed.                        |
| `pnpm.cmd security:audit`                                     | passed | The requester reported `No known vulnerabilities found` from the local security acceptance run.                                                               |
| `pnpm.cmd test:containers`                                    | passed | Fresh migrations, 5/5 database tests, 33/33 API tests, volume persistence and all three images passed; final result: `Phase 4 container verification passed.` |

All required Phase-4 gates passed. The initial sandboxed container attempt could not access the
locally installed Docker engine (`spawnSync docker EPERM`); the permitted host-side rerun then
completed the migrations, database and API integration suites, volume-persistence check and all
three image builds successfully.

## Migration-owned catalog cleanup correction

All Phase-1, Phase-3 and Phase-4 API suites and the E2E runner now use one exported database-test
cleanup helper. It truncates tenant, authorization-assignment, authentication and event-format
data, including `role_permission` and `role`, but deliberately leaves the globally
migration-managed `permission`, `contact_role` and `business_partner_role` catalogs intact. No
repair migration was added and the production data model was not relaxed.

The database regression creates an organization, role and role-permission assignment, invokes the
shared cleanup, and proves the tenant records were removed while the global permission count stayed
unchanged and exactly three `event_formats.*` permissions remained. The same exact catalog check
also passed immediately after all API integration suites and again after the browser E2E runner.

GitHub Actions already executes migration deployment, `verify` and `test:db` as sequential steps;
the post-`verify` database step is now explicitly named as the migration-catalog regression.
Workspace test scripts inside `verify` run with concurrency one, while the API Vitest configuration
continues to disable file parallelism. Cleanup can therefore no longer race or permanently
contaminate a later database check.

## E2E timeout and locator correction

The former 180-second monolithic test was replaced with seven named serial scenarios. Each scenario
starts from the organization home page, shares only the deliberately owned administrator browser
context and stored IDs/paths, and receives a fresh 90-second budget. The invited user is isolated in
a second context closed in `finally`; both contexts are closed even after failures. Playwright test
discovery confirms all Phase-1, Phase-3 and Phase-4 scenarios remain browser-driven.

The first corrected live run proved that the reported line was not only a cumulative timeout: the
native event-kind `<select>` had the expected accessibility name and values, but Playwright's label
lookup did not bind to it. The locator is now the stricter exact combobox role/name pair, with
explicit assertions for the initial and selected values. The ambiguous `Ende` label was likewise
replaced by the exact `Ende optional` textbox role, and the two following selects use exact
combobox names. No locator was broadened and no sleep was introduced.

## Complete test runtime configuration

`scripts/test-runtime-environment.mjs` parses the local `.env.test`, or `.env.test.example` when the
local file is absent. Both the E2E and container runners apply this complete configuration after
the inherited process environment, then override only runtime database URLs, ports and origins.
Consequently `NODE_ENV=test`, `AUTH_SIGN_IN_RATE_LIMIT_MAX=20`, the general maximum `100` and the
sensitive maximum `50` cannot silently fall back to development values. Development and production
limits remain unchanged. The dedicated integration boundary test removes rate-limit records before
and in `finally` after its requests, while every database suite also truncates the counter table.

## E2E cache-isolation correction

The E2E runner now passes a unique `VENUE_E2E_NEXT_DIST_DIR=.next-e2e-*` only to its child
environment. `next.config.ts` defaults to `.next` when that variable is absent and rejects `.next`,
path traversal and non-E2E directory names when it is present. A temporary
`tsconfig.e2e-*.json` prevents Next from modifying the normal TypeScript configuration. The runner
waits for its process trees to terminate, restores `next-env.d.ts` only when it still contains the
known E2E marker, and removes both isolated artifacts in nested `finally` paths. A scan after the
regression run found no `.next-e2e-*` directories or E2E TypeScript configs and no
`http://127.0.0.1:3000` bundles in the normal cache; the existing normal cache contained the
expected `http://localhost:3000` origin.

No test, TLS verification, registry verification or security gate may be disabled to obtain a pass.
