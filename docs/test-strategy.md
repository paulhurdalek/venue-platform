# Test strategy

| Layer          | Command                                                 | Evidence                                                                                                   |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unit           | `pnpm test:unit`; Web workspace test                    | Security/master-data, Event/occupancy/option, Booking rules plus exact amount/prefill helpers              |
| API/PostgreSQL | `pnpm test:integration`                                 | Phase-1–7 regressions, snapshots/calculations, concurrency, redaction and isolation                        |
| Migration      | `pnpm test:db`                                          | all additive migrations, backfills, tenant keys, constraints, catalogs and cleanup safety                  |
| E2E setup      | `pnpm test:e2e:setup`                                   | canonical test environment, isolated Next paths, guarded cleanup and preservation of the development cache |
| Browser E2E    | `pnpm test:e2e`                                         | Serial Phase-1–7 workflow with administrator and isolated read-only contexts                               |
| Static/build   | `pnpm verify`                                           | formatting, lint, TypeScript, generated OpenAPI client, tests, production builds                           |
| Delivery       | `pnpm test:containers`                                  | fresh migrations, DB/API integration, volume persistence, all three images                                 |
| Supply chain   | `pnpm security:audit`; `pnpm install --frozen-lockfile` | production advisories and peer/lock consistency                                                            |

Database-bearing suites require `TEST_DATABASE_URL`, deliberately refuse a development URL, and
clean only their isolated test tables through the shared `@venue/database/testing` helper. Tenant
and authorization assignments, including `role_permission` and `role`, are cleared, while the
migration-owned global `permission`, `contact_role` and `business_partner_role` catalogs remain
intact. A database regression creates tenant authorization data, invokes the same cleanup, and
asserts that the tenant data is gone, the overall permission count is unchanged and exactly three
`event_formats.*`, three `events.*`, three `date_options.*`, four `bookings.*` and one
`lineup.write` permissions remain. Cleanup orders Booking history, Event program items, Bookings,
Line-up requirements, relational occupancy and option tables before Events and formats, while
global permission and role dictionaries survive. The ordinary test suite skips real-DB cases when
the variable is absent; the
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
Playwright runs fifteen serial scenarios with an individual 90-second limit. A browser context created
in `beforeAll` deliberately carries the administrator session and organization ID across the
focused Phase-1, Phase-3, Phase-4, Phase-5 and Phase-6 scenarios; the invited read-only user receives a separately
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

Phase-6 unit tests pin exactly six stable statuses, direct corrections, confirmed reactivation,
active/historical semantics, optional internal Minor-Unit fees and relational custom roles. Eleven
Web unit tests cover comma/point Euro input including `100,00 → 10000`, very large exact conversions
without floating point, localized output, no fee and deterministic Booking/Management/Agency plus
primary-contact prefill.
PostgreSQL/API scenarios prove format-to-Event requirement and fee snapshots, later template
independence, Artist/Booking separation, tenant-safe structured contacts, direct Artist fallback
with and without channels, representative priority, all three hotel arrangements, exact Buy-out
money and finance/contact redaction. They additionally cover role-independent duplicate conflicts,
one-winner parallel creation, explicit separate creation, declined/cancelled history, multiple
performances per Booking, another Artist between sets, breaks, atomic/versioned reorder and rollback
preconditions, audits, progress-by-Booking and Location/tenant/permission boundaries. Existing
status, history, pagination, snapshot, summary/filter and concurrency regressions remain selected.
The database suite executes the exact follow-up migration's hotel mapping and performance backfill
against a legacy-style Booking and verifies all new constraints, tenant foreign keys and removal of
the obsolete partial index.

Browser coverage executes the real search/autoprefill → duplicate warning → recommended second
performance path, edits two ten-minute sets, inserts an Umbaupause, proves simulated 409 rollback,
then uses drag-and-drop and arrow-key ordering and verifies persistence after reload. The same flow
checks an Artist direct contact and stores/reopens a German `100,00` Hotel-Buy-out. The isolated
Read-only context sees both Booking and program but no financial or mutation controls.

Phase-7 domain and application tests cover normalized duplicates, exact Euro parsing, explicit
zero/null, four-decimal quantities, deterministic `HALF_UP` rounding, transitions, independent
financial write permissions and server-side response redaction. Database tests verify the seven
tables, provenance/EUR/amount/version constraints, tenant keys, partial uniqueness, eight
permissions and existing-Event calculation backfill. Shared cleanup truncates calculation history,
positions, calculations, format services and catalog tables before their parent Events, formats,
partners and organizations while preserving the migration-owned permission catalog.

The Phase-7 PostgreSQL/API scenario covers category/provider lifecycle, duplicate and preferred
provider conflicts, catalog versus override resolution, Event and DateOption conversion snapshots,
snapshot independence after catalog edits, free Events, individual positions, missing-price
approval denial, exact planned/committed totals, all three Booking money sources, terminal Booking
exclusion, optimistic conflicts, audit/history, automatic approval reset and Location/tenant/
permission boundaries. The Playwright continuation exercises the same operator journey and checks
the restricted-role JSON response directly for absent financial fields.
