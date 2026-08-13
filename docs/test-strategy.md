# Test strategy

| Layer          | Command                                                 | Phase 1 evidence                                                                                                                                                                |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | `pnpm test:unit`                                        | permission and membership evaluation, Location scope, invitation state, token hashing, optimistic versions, bootstrap eligibility                                               |
| API/PostgreSQL | `pnpm test:integration`                                 | bootstrap, blocked signup, sign-in/session/logout, cookies, roles, tenant/Location isolation, permission denial, suspension, invitation lifecycle, multi-org user, audit safety |
| Migration      | `pnpm test:db`                                          | real driver, applied Phase 1 migration, tables, and tenant columns                                                                                                              |
| Browser E2E    | `pnpm test:e2e`                                         | setup UI, sign-in, organization/Location edits, invite/copy, second browser acceptance, UI/API denial, logout                                                                   |
| Static/build   | `pnpm verify`                                           | formatting, lint, TypeScript, generated OpenAPI client, tests, production builds                                                                                                |
| Delivery       | `pnpm test:containers`                                  | fresh migrations, DB/API integration, volume persistence, all three images                                                                                                      |
| Supply chain   | `pnpm security:audit`; `pnpm install --frozen-lockfile` | production advisories and peer/lock consistency                                                                                                                                 |

Database-bearing suites require `TEST_DATABASE_URL`, deliberately refuse a development URL, and
clean only their isolated test tables. The ordinary test suite skips real-DB cases when the
variable is absent; the explicit DB command and E2E runner fail instead. CI always provisions
PostgreSQL 18.4, deploys the reviewed migrations, and supplies the variable.

The E2E runner starts the real Nest API and Next web app, creates a bootstrap link through the same
workspace CLI used by operators, and passes that link to Playwright without printing its token.
