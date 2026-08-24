# Phase 6 verification

This document records the reproducible acceptance status for relational Booking and Line-up plus
the additive Phase-6 performance follow-up. It covers Artist direct contact, structured hotel
arrangements, role-independent duplicate protection, multiple performances per Booking, breaks,
atomic program ordering and the responsive Web workflow. Commands ran from the repository root on
24 August 2026 with the pinned Node.js 24 and pnpm 11 toolchain.

## Coverage

- Booking domain tests retain the six statuses, direct corrections, explicit reactivation,
  active/historical semantics, exact optional money and custom roles.
- Eleven Web unit tests cover comma/point inputs including `100,00 → 10000`, large exact values,
  localized output, no fee and deterministic Booking/Management/Agency contact prefill.
- Nineteen focused Phase-6 PostgreSQL/API scenarios are part of 70 passing scenarios across Phases
  1, 3, 4, 5 and 6. New cases prove representative priority, direct Artist channels, missing direct
  contact and permission redaction; `NONE`/`REQUIRED`/`BUYOUT`; exact Buy-out money and finance
  redaction; stable role-independent duplicate conflicts; one-winner parallel creation; explicit
  separate creation; declined/cancelled history; multiple sets, another Artist, breaks, atomic
  ordering, audit, optimistic conflicts and tenant/Location/permission boundaries.
- Eight database checks cover all nine additive migrations. The new regression executes the exact
  follow-up migration's hotel update and performance insert against a legacy-style Booking and
  verifies lossless mapping/backfill, seven constraints, tenant keys, index replacement and cleanup.
- Fifteen serial Playwright scenarios retain all earlier regressions. The Phase-6 flow books the
  same Artist twice, checks the warning, chooses the recommended extra performance, edits two
  ten-minute sets, adds an Umbaupause, proves simulated 409 rollback, uses drag-and-drop and keyboard
  ordering, reloads persistence, then stores/reopens a German `100,00` Hotel-Buy-out and checks the
  Artist direct contact. The isolated Read-only context sees Booking/program data without finance or
  mutation controls.

## Acceptance results in the Codex environment

| Command                            | Result              | Evidence                                                                                                                                               |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm.cmd format` / `format:check` | passed              | Pinned Prettier formatted the repository; final verification found every matched file compliant.                                                       |
| `pnpm.cmd lint`                    | passed              | ESLint completed with zero warnings.                                                                                                                   |
| `pnpm.cmd typecheck`               | passed              | API, Web, Worker and all internal packages passed strict TypeScript.                                                                                   |
| `pnpm.cmd api:generate`            | passed              | OpenAPI and `@venue/api-client` contain optional duplicate/hotel input, direct-contact output and all program-item paths.                              |
| `pnpm.cmd db:migrate:test`         | passed              | All 9 migrations are deployed, including unchanged `20260823000300_phase_6_booking_lineup` and additive `20260824000100_phase_6_booking_performances`. |
| `pnpm.cmd test:db`                 | passed              | 1 file and 8/8 real database scenarios passed.                                                                                                         |
| `pnpm.cmd test:unit`               | passed              | API 63/63 and Worker 1/1 passed; the Web workspace additionally passed 11/11 focused tests.                                                            |
| API/PostgreSQL integration         | passed              | 6 files and 70/70 scenarios passed, including new duplicate races, hotel/direct-contact redaction and program ordering.                                |
| `pnpm.cmd test:e2e`                | passed              | 15/15 Chromium scenarios passed on the supported alternate ports 3010/3111.                                                                            |
| `pnpm.cmd build`                   | passed              | API, Web, Worker and all package production builds passed as part of `verify`.                                                                         |
| `pnpm.cmd verify`                  | passed              | Formatting, ESLint, generation, all workspace types/tests and all production builds completed.                                                         |
| `pnpm.cmd peers check`             | passed              | `No peer dependency issues found`.                                                                                                                     |
| `pnpm.cmd security:audit`          | environment-blocked | Sandbox and approved host-network attempts both failed on `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; TLS verification was not weakened.                        |
| `pnpm.cmd test:containers`         | passed              | Fresh 9-migration deploy, 8 DB tests, 70 API tests, persistence recreation and Web/API/Worker image builds passed.                                     |

The final `verify` run reported five configuration tests, four E2E-isolation setup tests, 65
non-database API tests, eleven Web tests, one Worker test, eight database scenarios skipped without
an inherited `TEST_DATABASE_URL`, 68 API/PostgreSQL scenarios skipped in that non-database pass,
and successful API/Web/Worker production builds. Real database coverage ran separately and passed
all 8 DB and 70 API/PostgreSQL scenarios.

The first three extended browser runs exposed test-only locator/timing assumptions after one
Booking began rendering multiple program rows. They reached the implemented UI correctly; stable
row locators and an explicit wait for the intentionally disabled pending handle corrected the tests.
The final unchanged application run passed 15/15 in 1.1 minutes. Expected 409 responses come from
the duplicate warning, simulated ordering rollback and optimistic-conflict coverage.

The container runner used a uniquely named Compose project, applied every migration to fresh
PostgreSQL, proved its own development-volume persistence across replacement, built all three
images and removed only the temporary resources it created. The pre-existing
`venue-platform-postgres-1` remained healthy. The separately started tmpfs-backed `postgres-test`
service was stopped afterwards and reports `Exited (0)`; no development database, existing volume
or user data was reset or removed.

## Remaining host-side gate

Retry the following unchanged after the machine's trusted npm registry certificate chain is fixed:

```powershell
pnpm.cmd security:audit
```

Do not disable TLS verification.

## Delivery state

- `20260824000100_phase_6_booking_performances` is the only schema follow-up for this addendum.
- Migration `20260823000300_phase_6_booking_lineup` and all earlier migrations remain unchanged.
- Existing Booking hotel, duration, order and timestamps are preserved/backfilled; deprecated
  compatibility columns remain in place.
- No example Artist, format, Event, Booking or program data was seeded.
- No development database, existing Docker volume or user data was reset or deleted.
- Nothing is staged, committed, pushed or merged; the branch remains `phase-6-booking-lineup`.
