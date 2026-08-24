# Phase 7 verification

This document records the reproducible checks for services, relational snapshots, Booking-cost
projection and event calculations. Commands run from the repository root with the pinned Node.js
24 and pnpm 11 toolchain.

## Automated coverage

- Domain tests cover Unicode/name normalization, comma/point Euro input, null versus explicit zero,
  exact Minor Units, four-decimal quantities, `HALF_UP` line rounding and status transitions.
- Application tests prove server-side purchase/sales/margin/Booking redaction, independent finance
  write permissions, approval permission, optimistic version rejection, omitted versus explicit
  null prices and redacted catalog-price previews.
- Provider-resolution unit tests cover explicit, preferred and sole-active selection, ambiguous
  multi-provider catalogs and archived provider/partner exclusion.
- Phase-7 API/PostgreSQL integration covers the role matrix, category duplicates and lifecycle,
  two provider prices and one preferred provider, format overrides, normal and option-conversion
  snapshots, snapshot stability after catalog changes, current catalog defaults for new positions,
  explicit price overrides, sole/preferred/ambiguous provider resolution, previewed and audited
  price refreshes that preserve manual values, custom-position exclusion, approval after refresh,
  missing-price approval blocking, planned/committed Booking sources, declined/cancelled exclusion,
  exact totals, approval history/audit/reset, financial redaction, Location scope and stale writes.
- Database integration verifies all seven tables, EUR/nonnegative/quantity/version/provenance checks,
  tenant foreign keys, partial unique indexes, eight permissions, the existing-Event backfill and a
  cross-tenant category/service rejection.
- The serial Playwright flow creates a category, service and two provider prices, adds the service
  to a format, creates an Event snapshot, verifies visible catalog suggestions and manual override,
  clears one snapshot price, previews and confirms the catalog refresh, adds a custom position and
  Booking cost, checks planned and committed totals, approves, changes the Booking amount and
  observes the automatic Draft reset. Its isolated Read-only context also inspects the API response
  and proves that financial keys are absent.

## Acceptance results

A command marked `environment-blocked` was attempted both inside and outside the command sandbox
and is not reported as passed.

| Command                     | Result              | Evidence                                                                                      |
| --------------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm.cmd db:generate`      | passed              | Prisma 7.9.1 generated the client from the Phase-7 schema                                     |
| `pnpm.cmd api:generate`     | passed              | Phase-7 paths, queries, bodies and schemas generated; API client built                        |
| `pnpm.cmd format:check`     | passed              | all matched files use Prettier style                                                          |
| `pnpm.cmd lint`             | passed              | ESLint completed with zero warnings                                                           |
| `pnpm.cmd typecheck`        | passed              | all seven applicable workspaces                                                               |
| `pnpm.cmd test:unit`        | passed              | targeted API 82/82; full API run 84 passed plus Web 11/11 and Worker 1/1                      |
| `pnpm.cmd test:integration` | passed in container | API suites Phase 1 through 7: 7 files and 72/72 tests                                         |
| `pnpm.cmd test:db`          | passed in container | 9/9 tests, including Phase-7 tables, constraints, indexes, backfill and tenant rejection      |
| `pnpm.cmd db:migrate:test`  | passed              | all 10 committed migrations applied to an isolated temporary `venue_test` database            |
| `pnpm.cmd build`            | passed              | Web, API, Worker and packages; all four new service routes present in the Next route manifest |
| `pnpm.cmd test:e2e`         | passed              | 16/16 serial Chromium scenarios, including catalog suggestions and confirmed price refresh    |
| `pnpm.cmd verify`           | passed              | repository format, lint, typecheck, test and build acceptance chain                           |
| `pnpm.cmd peers check`      | passed              | no peer dependency issues                                                                     |
| `pnpm.cmd security:audit`   | environment-blocked | npm advisory endpoint rejected the local TLS chain with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`     |
| `pnpm.cmd test:containers`  | passed              | migrations, 81 DB/API tests, persistence probe and Web/API/Worker image builds                |

All database-dependent checks used disposable test services and the mandatory
`TEST_DATABASE_URL` guard. The temporary containers, networks, volumes and test rows were removed
after the runs. No development database was reset, no earlier migration was changed, and the
security audit was not weakened by disabling TLS verification.

The first browser-test attempt had no PostgreSQL test service and correctly failed with
`ECONNREFUSED`; two subsequent attempts on the default Web port encountered an unrelated existing
listener (`EADDRINUSE`). An isolated test database and ports 3200/3201 removed those environment
collisions. One intermediate Next development-server run exposed an incorrect E2E locator after an
edit-state transition; after correcting that locator, the unmodified final E2E runner passed all
16 scenarios. An interrupted browser run also left a generated `.next-e2e-*` directory behind; one
`verify` retry correctly rejected those compiled artifacts during lint. After removing only that
temporary directory and its generated E2E tsconfigs, the final `verify` run passed. The security
audit was repeated with network escalation and failed identically at the local certificate trust
chain (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, then `fetch failed`), so it remains environment-blocked
rather than passed.
