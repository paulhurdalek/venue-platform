# Phase 10 verification report

This report records the final verification of the Phase 10 document polish. It is updated with the
actual command result after every required gate; no skipped database, browser, container, or audit
gate is reported as passed.

## Scope

- concrete offer titles independent of internal templates;
- atomic organization/year/type document numbers without reuse;
- external offer positions without internal revenue, payout, cost, or margin data;
- one server-side A4 renderer for preview and immutable PDF versions;
- finance-free, contact-free event-day `Ablauf` documents;
- migration, permissions, snapshots, audit history, responsive UI, and visual PDF regression.

## Results

| Gate                    | Result | Evidence                                                                                  |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `pnpm format:check`     | passed | Prettier reported that all matched files use the configured style.                        |
| `pnpm verify`           | passed | Format, lint, typecheck, generated OpenAPI client, tests, and all production builds pass. |
| `pnpm test:db`          | passed | 12 database tests pass against the migrated test database.                                |
| `pnpm test:integration` | passed | 80 API integration tests pass.                                                            |
| `pnpm test:e2e`         | passed | 21 Playwright scenarios pass on dynamically allocated web/API ports.                      |
| `pnpm peers check`      | passed | No peer dependency issues found.                                                          |
| `pnpm test:containers`  | passed | See the container verification details below.                                             |
| `pnpm security:audit`   | passed | No known vulnerabilities found with production dependencies and `audit-level=high`.       |

The direct Windows audit request could not establish the npm registry certificate chain
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). TLS verification was not disabled. The exact repository gate was
therefore repeated with the same manifests and lockfile in an ephemeral Node container with normal TLS
verification; it passed. pnpm's supply-chain policy check also passed all 580 lockfile entries.

## Container verification

The Phase 10 container gate completed with dynamic host ports and a fresh, isolated Compose project:

- all 15 migrations applied to an empty database, including both Phase 10 migrations;
- 12 database tests and 80 API integration tests passed in the container workflow;
- a persisted canary survived the database restart;
- production images for web, API, and worker built successfully;
- the temporary containers, network, and database volume were removed after the successful run.

## Visual PDF evidence

`pnpm test:pdf-visual` generated a filled offer with 72 positions and rendered all six A4 pages through
Poppler. The regression verifies exact page dimensions, the masthead, non-empty content bounds, clipping
guards, and deterministic raster fingerprints. All six rendered pages were additionally inspected page
by page for the offer title, real table layout, repeated table headers, totals, conditions, footer, euro
signs, and German special characters. The temporary PDF and raster files were removed before handoff.
