# Test strategy

| Layer          | Command                                                 | Evidence                                                                                                                                      |
| -------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | `pnpm test:unit`                                        | Phase-1 security rules plus Artist/Contact identity and derived completeness rules                                                            |
| API/PostgreSQL | `pnpm test:integration`                                 | Phase-1 regression plus Phase-3 CRUD, search/filter/page, versions, lifecycle, reuse, roles, permissions, tenant isolation and PII-safe audit |
| Migration      | `pnpm test:db`                                          | real driver, applied Phase-1/3 migrations, new tables/dictionaries and composite tenant foreign keys                                          |
| Browser E2E    | `pnpm test:e2e`                                         | Phase-1 identity/admin flow plus Artist, Contact reuse, partner multi-role/link, lifecycle and read-only UI                                   |
| Static/build   | `pnpm verify`                                           | formatting, lint, TypeScript, generated OpenAPI client, tests, production builds                                                              |
| Delivery       | `pnpm test:containers`                                  | fresh migrations, DB/API integration, volume persistence, all three images                                                                    |
| Supply chain   | `pnpm security:audit`; `pnpm install --frozen-lockfile` | production advisories and peer/lock consistency                                                                                               |

Database-bearing suites require `TEST_DATABASE_URL`, deliberately refuse a development URL, and
clean only their isolated test tables. The ordinary test suite skips real-DB cases when the
variable is absent; the explicit DB command and E2E runner fail instead. CI always provisions
PostgreSQL 18.4, deploys the reviewed migrations, and supplies the variable.

The E2E runner starts the real Nest API and Next web app, creates a bootstrap link through the same
workspace CLI used by operators, and passes that link to Playwright without printing its token.
