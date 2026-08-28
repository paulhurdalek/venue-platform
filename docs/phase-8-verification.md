# Phase 8 verification

This report records the reproducible checks for revenue planning, reusable templates, independent
event snapshots, ticket pricing, recipient economics, approval safety and the compact responsive
UI. Commands are run from the repository root with the pinned Node.js 24 and pnpm 11 toolchain.

## Automated coverage

- Domain tests cover deterministic net/gross conversion, `HALF_UP` rounding, percentage
  components, exact mixed fixed/percentage allocations and guest-/ticket-dependent revenue.
- Database integration verifies the relational Phase-8 tables and template backfill, including the
  exact defaults `Steuerfrei – 0 %`, `Ermäßigt – 7 %` and `Regulär – 19 %`, tenant constraints,
  integer storage and cross-tenant rejection.
- Phase-8 API/PostgreSQL integration covers template lifecycle, version conflicts, duplication,
  archival/reactivation, ticket-provider snapshots, all four event-creation source combinations,
  later preview and confirmed full replacement, automatic ordering and moving, atomic ticket tier
  plus price structure creation, invalid/archived recipients, approval fallback, audit and
  financial permissions.
- The serial Playwright flow covers event navigation, the compact calculation layout, exact
  accessible dialog names such as the `Betrag €` textbox, tax-template selections, ticket price
  structure, allocations and results. It also verifies the vertical costs-before-tickets order,
  the labelled local table scroll region, the event-wide ticketing breakdown and its clipboard
  text, and the initially collapsed additional-revenue section. At a 390-pixel viewport it asserts
  `document.documentElement.scrollWidth <= window.innerWidth`.

## Snapshot and safety assertions

Template data is copied in the same database transaction as the target event or explicit apply
operation. Tests mutate or archive the source after copying and verify that the event snapshot does
not change. Existing revenue data requires the explicit replacement flag and is replaced rather
than merged. Recipient references are resolved inside the organization; invalid or archived
recipients block application until the preview conflict is resolved. No ticket sales, payment,
refund, invoice, payout or accounting behavior is introduced.

## Acceptance results

The following results were captured on 2026-08-27. A check is never reported as passed unless its
command completed successfully.

| Command                     | Result              | Evidence                                                                                                                                                 |
| --------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd test:db`          | Passed              | 1 database test file, 10/10 PostgreSQL assertions passed against a freshly recreated `venue_test` database with all 12 migrations.                       |
| `pnpm.cmd test:integration` | Passed              | 8 files, 76/76 API/PostgreSQL integration tests passed.                                                                                                  |
| `pnpm.cmd test:e2e`         | Passed              | 17/17 serial Playwright scenarios passed in 1.9 minutes, including Phase 8 at 390 px and the page-overflow assertion.                                    |
| `pnpm.cmd peers check`      | Passed              | No peer-dependency issues found.                                                                                                                         |
| `pnpm.cmd test:containers`  | Environment blocked | Exit code 1 before container startup: Docker cannot be executed in this environment (`spawnSync docker EPERM`). No container result is claimed.          |
| `pnpm.cmd security:audit`   | Environment blocked | Sandboxed and approved-network runs both failed at the registry certificate chain (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). No clean audit result is claimed. |
| `pnpm.cmd verify`           | Passed              | Exit code 0: formatting, zero-warning lint, all TypeScript checks, generated API artifacts, tests and production builds passed.                          |

Inside `verify`, configuration passed 5/5 tests, API passed 88 tests with 74 database-backed tests
skipped by the unit runner, Web passed 22/22 and Worker passed 1/1. The database package's 10 tests
were skipped by that command's environment; the separate successful `test:db` result above is the
database acceptance evidence.

## Responsive verification note

The full Playwright run is the authoritative browser result: it starts the real application,
creates the Phase-8 data through the UI, switches to 390 px and checks the document dimensions.
An additional attempt to claim the already open localhost page in the in-app browser was rejected
by that browser's URL security policy. The restriction was not bypassed and is not presented as a
manual pass.

## Environment follow-up

1. Run `pnpm.cmd test:containers` on a host where the Docker CLI is executable to reconfirm the
   already preserved container workflow.
2. Run `pnpm.cmd security:audit` through a registry connection with a valid trusted certificate
   chain.
