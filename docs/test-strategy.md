# Test strategy

| Layer          | Command                                                 | Evidence                                                                                                          |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unit           | `pnpm test:unit`                                        | Security/master-data rules plus EventFormat normalization, local times and ordering                               |
| API/PostgreSQL | `pnpm test:integration`                                 | Phase-1/3 regression, isolated sign-in rate-limit boundary, and Phase-4 CRUD, lifecycle, permissions and tenancy  |
| Migration      | `pnpm test:db`                                          | real driver, applied Phase-1/3/4 migrations, tenant keys, relational time checks and dictionaries                 |
| E2E setup      | `pnpm test:e2e:setup`                                   | canonical test environment, isolated Next paths, guarded cleanup and preservation of the development cache        |
| Browser E2E    | `pnpm test:e2e`                                         | Seven serial, focused Phase-1/3/4 browser scenarios with a controlled administrator session and read-only context |
| Static/build   | `pnpm verify`                                           | formatting, lint, TypeScript, generated OpenAPI client, tests, production builds                                  |
| Delivery       | `pnpm test:containers`                                  | fresh migrations, DB/API integration, volume persistence, all three images                                        |
| Supply chain   | `pnpm security:audit`; `pnpm install --frozen-lockfile` | production advisories and peer/lock consistency                                                                   |

Database-bearing suites require `TEST_DATABASE_URL`, deliberately refuse a development URL, and
clean only their isolated test tables. The ordinary test suite skips real-DB cases when the
variable is absent; the explicit DB command and E2E runner fail instead. CI always provisions
PostgreSQL 18.4, deploys the reviewed migrations, and supplies the variable.

The repository-level E2E and container runners load the complete `.env.test` configuration,
falling back to `.env.test.example` in a clean checkout. These test values override inherited
development values; only invocation-specific database URLs, ports and browser/API origins are
replaced afterwards. This keeps the development sign-in limit at `5`, while container integration
and browser runs consistently use the test limit `20`. The dedicated sign-in rate-limit integration
test reaches the configured boundary and removes its counters in a `finally` block, so unrelated
suites cannot inherit them.

The E2E runner starts the real Nest API and Next web app, creates a bootstrap link through the same
workspace CLI used by operators, and passes that link to Playwright without printing its token.
Playwright runs seven serial scenarios with an individual 90-second limit. A browser context created
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
