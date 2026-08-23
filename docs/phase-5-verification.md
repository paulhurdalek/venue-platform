# Phase 5 verification

This document records the reproducible acceptance status for free/template Events, central
Location occupancy, VenueDateOptions, transactional batch creation, availability and the
calendar/list UI. Commands run from the repository root with the pinned Node.js 24 and pnpm 11
toolchain.

## Coverage

- API domain/unit tests cover free/template provenance, optional schedules, earliest Event
  occupancy, half-open and next-day overlap, date-option validation, weekdays and the 93-day
  availability bound.
- Seven database checks cover the untouched Phase-5 migrations, tenant foreign keys, provenance
  checks, the GiST exclusion constraint, permission backfill and cleanup preservation.
- Eighteen Phase-5 API/PostgreSQL scenarios include the existing Event/option lifecycle plus mixed
  batch ranks, duplicate-request rejection, Event/first-/second-rank conflicts, complete rollback,
  per-option audits, tenant/Location/permission isolation and parallel competing batches. The
  combined integration selection contains 51 passing scenarios across Phases 1, 3, 4 and 5.
- Fourteen serial Playwright scenarios cover the earlier phases plus template/free Event creation,
  option lifecycle and calendar markers, weekday availability/clipboard text, keyboard batch
  selection, automatic rank proposals, immediate created-option links and computed WCAG-AA
  contrast for inactive, hover, selected, focus and disabled control states.

## Acceptance results in the Codex environment

| Command                    | Result  | Evidence                                                                                         |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `pnpm.cmd format`          | passed  | Repository files were formatted with the pinned Prettier version.                                |
| `pnpm.cmd lint`            | passed  | ESLint completed with zero warnings.                                                             |
| `pnpm.cmd typecheck`       | passed  | OpenAPI/client generation and all workspace TypeScript checks passed.                            |
| `pnpm.cmd api:generate`    | passed  | OpenAPI and the generated TypeScript client include `POST /date-options/batch`.                  |
| API/PostgreSQL integration | passed  | All 5 files and 51/51 scenarios passed against the dedicated PostgreSQL test database.           |
| `pnpm.cmd test:e2e`        | passed  | 14/14 Chromium scenarios passed in 1.3 minutes on isolated ports 3200/3201.                      |
| `pnpm.cmd verify`          | passed  | Format, ESLint, generated client, TypeScript, unit/setup tests and production builds all passed. |
| `pnpm.cmd peers check`     | passed  | `No peer dependency issues found`.                                                               |
| `pnpm.cmd test:containers` | passed  | Fresh migrations, DB/API tests, persistence probe and web/API/worker image builds completed.     |
| `pnpm.cmd security:audit`  | blocked | Registry TLS chain failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; TLS verification stayed on.    |

The successful `verify` run reported five configuration tests, 53 passing non-database API tests,
49 API integration tests skipped without `TEST_DATABASE_URL`, one worker test, four E2E-setup
tests and successful API/Web/worker production builds. The separate database-backed selection then
passed 51/51 API scenarios. The fresh container gate applied all seven migrations, passed 7/7
database checks and 51/51 API scenarios, verified development-volume persistence, built all three
images and removed only its own temporary Compose project.

The first sandboxed container attempt correctly reported `spawnSync docker EPERM`; the approved
host execution against the already-running Docker Desktop installation passed. The security audit
was attempted both in the sandbox and with approved host network access. Both attempts reached the
registry but failed on the machine's untrusted leaf-certificate chain. No TLS, registry or
security check was disabled or weakened.

No development database, existing Docker volume or local Phase-5 data was reset, removed or
altered. The dedicated `postgres-test` service used by E2E was stopped without deleting its
container or volume. Both `20260823000100_phase_5_events` and the already-applied
`20260823000200_phase_5_occupancy_options` migration remain unchanged; the batch refinement needs
no migration.

## Remaining host-side gate

The security audit must be rerun unchanged in a normal PowerShell session after the trusted
registry certificate chain has been corrected:

```powershell
cd 'C:\Users\Administrator\Documents\Codex\2026-08-13\files-mentioned-by-the-user-codex-2\outputs\venue-platform'
pnpm.cmd security:audit
```

This is the only remaining verification gate. Nothing is staged or committed.

## Files changed by this refinement

- `README.md`
- `apps/api/integration/phase-5.integration.spec.ts`
- `apps/api/src/date-options/application/date-option.models.ts`
- `apps/api/src/date-options/application/date-option.service.ts`
- `apps/api/src/date-options/presentation/date-option.controller.ts`
- `apps/api/src/date-options/presentation/date-option.dto.ts`
- `apps/web/app/components/events/free-dates-panel.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/o/[organizationId]/events/page.tsx`
- `docs/architecture.md`
- `docs/database-and-migrations.md`
- `docs/phase-5-verification.md`
- `docs/phase-5.md`
- `docs/security.md`
- `docs/test-strategy.md`
- `e2e/phase-1.spec.ts`
- `packages/api-client/openapi/openapi.json`
- `packages/api-client/src/generated/schema.ts`

No Prisma schema or migration file changed for this refinement.
