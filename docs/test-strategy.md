# Test strategy

The suite follows risk boundaries rather than a coverage-number target.

| Layer                | Tool and command                                                               | Purpose                                                      |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Unit                 | Vitest, `pnpm test:unit`                                                       | Pure use cases, configuration, worker lifecycle              |
| API integration      | Vitest + Supertest, `pnpm test:integration`                                    | Real Nest routing, filters, versioning, headers              |
| Database integration | Vitest + PostgreSQL, `pnpm test:db`                                            | Real Prisma driver and isolated test database                |
| Web smoke            | Playwright, `pnpm test:e2e`                                                    | Browser-visible technical shell and no premature navigation  |
| Static               | TypeScript/ESLint/Prettier, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Contract and consistency checks                              |
| Delivery             | `pnpm build` and three Docker builds                                           | Reproducible production artifacts                            |
| Container acceptance | Docker Compose, `pnpm test:containers`                                         | Startup, migration, DB test, persistence, application images |

## Isolation

The database test reads `TEST_DATABASE_URL` and is skipped inside the ordinary `pnpm test` suite
when it is absent, so unit runs cannot accidentally touch a developer database. The explicit
`pnpm test:db` command fails when the URL is absent. CI always provides it, applies migrations, and
therefore executes the test. Test data must never be written to the development database.

The API integration test replaces the database provider because it verifies HTTP composition, not
the PostgreSQL adapter. The dedicated database test owns that boundary.

Playwright starts the web application itself. The page tolerates an absent API and reports that
state, allowing the shell smoke test to remain focused and deterministic.

## Required gates

`pnpm verify` runs formatting, linting, type checking, unit/integration tests, and the production
workspace build. CI additionally runs migrated database integration, Playwright Chromium, the
production dependency audit, and the isolated container acceptance test. The latter uses its own
Compose project and volume, then removes only those temporary resources.
