# Test strategy

| Layer          | Command                                                 | Evidence                                                                                                         |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unit           | `pnpm test:unit`                                        | Security/master-data plus Event, occupancy, option, availability and snapshot rules                              |
| API/PostgreSQL | `pnpm test:integration`                                 | Phase-1/3/4 regressions plus free Events, occupancy concurrency, options, availability, conversion and isolation |
| Migration      | `pnpm test:db`                                          | base/follow-up migrations, tenant keys, exclusion constraints, catalogs and cleanup safety                       |
| E2E setup      | `pnpm test:e2e:setup`                                   | canonical test environment, isolated Next paths, guarded cleanup and preservation of the development cache       |
| Browser E2E    | `pnpm test:e2e`                                         | Thirteen serial focused scenarios with administrator and isolated read-only contexts                             |
| Static/build   | `pnpm verify`                                           | formatting, lint, TypeScript, generated OpenAPI client, tests, production builds                                 |
| Delivery       | `pnpm test:containers`                                  | fresh migrations, DB/API integration, volume persistence, all three images                                       |
| Supply chain   | `pnpm security:audit`; `pnpm install --frozen-lockfile` | production advisories and peer/lock consistency                                                                  |

Database-bearing suites require `TEST_DATABASE_URL`, deliberately refuse a development URL, and
clean only their isolated test tables through the shared `@venue/database/testing` helper. Tenant
and authorization assignments, including `role_permission` and `role`, are cleared, while the
migration-owned global `permission`, `contact_role` and `business_partner_role` catalogs remain
intact. A database regression creates tenant authorization data, invokes the same cleanup, and
asserts that the tenant data is gone, the overall permission count is unchanged and exactly three
`event_formats.*`, three `events.*` and three `date_options.*` permissions remain. Cleanup orders
the relational occupancy and option tables before Events, while global permission and role
dictionaries survive. The ordinary test suite skips real-DB cases when the variable is absent; the
explicit DB command and E2E runner fail instead. CI always provisions PostgreSQL 18.4, deploys the
reviewed migrations, and supplies the variable.

GitHub Actions runs migration deployment, `pnpm verify` and the explicit post-integration
`pnpm test:db` step sequentially. Workspace test scripts inside `verify` use a concurrency of one,
and API Vitest files have `fileParallelism: false`; database-bearing suites therefore cannot race
each other's cleanup. The named post-integration CI step proves once more that API cleanup did not
remove migration-managed catalog rows.

The repository-level E2E and container runners load the complete `.env.test` configuration,
falling back to `.env.test.example` in a clean checkout. These test values override inherited
development values; only invocation-specific database URLs, ports and browser/API origins are
replaced afterwards. This keeps the development sign-in limit at `5`, while container integration
and browser runs consistently use the test limit `20`. The dedicated sign-in rate-limit integration
test reaches the configured boundary and removes its counters in a `finally` block, so unrelated
suites cannot inherit them.

The E2E runner starts the real Nest API and Next web app, creates a bootstrap link through the same
workspace CLI used by operators, and passes that link to Playwright without printing its token.
Playwright runs fourteen serial scenarios with an individual 90-second limit. A browser context created
in `beforeAll` deliberately carries the administrator session and organization ID across the
focused Phase-1, Phase-3 and Phase-4 scenarios; the invited read-only user receives a separately
owned context that is always closed.
Every run assigns the web process a unique project-local `.next-e2e-*` directory, so an E2E value
of `NEXT_PUBLIC_API_BASE_URL` can never be compiled into the normal `apps/web/.next` development
cache. Next receives an isolated `tsconfig.e2e-*.json`, so it never rewrites the normal
`tsconfig.json`. After all child processes have stopped, the runner safely restores the
Next-managed `next-env.d.ts` and removes both temporary artifacts, with retry handling for the
directory, including on startup or test failures. The normal development process therefore
continues to compile the root `.env` value `http://localhost:3000`. Path validation prevents cleanup
from targeting `.next`, the normal TypeScript configuration, a parent directory or anything
outside `apps/web`.

Phase-5 domain tests exercise actual local dates including daylight-saving transition dates,
next-day ends, optional schedules, earliest occupancy starts, half-open overlap, free/template
snapshot mapping, date-option validation, weekday selection and the 93-day search bound.
PostgreSQL/API integration proves exact and null provenance, later source changes, overlapping and
adjacent Events, cross-midnight and cross-Location behavior, cancel/reactivate/change checks,
concurrent Event/option requests, rank limits, expiry/release/promotion, version conflicts,
conversion/unavailability, availability states, permission matrices, safe audit metadata and
tenant/Location isolation. Batch integration additionally proves mixed explicit ranks, duplicate
rejection, Event/first-/second-rank conflicts, full rollback, per-option audits, scope/permission
denial and serialized competing requests. Browser coverage adds free-mode clearing and
manual-review UI, distinct option ranks and calendar markers, manual promotion, weekday
availability, clipboard text, keyboard multi-selection, automatic rank proposals and WCAG-AA
contrast checks for the shared inactive/hover/selected/focus/disabled control states. The
isolated Read-only context verifies that Event and DateOption mutations are absent in both UI and
API.
