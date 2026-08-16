# Phase 3 verification report

Date: 2026-08-16. Branch: `phase-3-artists-contacts-partners`. No commit, push, merge,
deployment or Phase-4 work was performed.

## Acceptance defect and correction

The first real container-based acceptance run applied all migrations, passed the three database
tests and all Phase-1 integration tests, but two of the six Phase-3 integration tests failed.
Linking a Contact to an archived Business Partner returned HTTP 422 although the stable domain
contract requires HTTP 409 Conflict with `ARCHIVED_RELATION_TARGET`. The later audit assertion did
not see the remaining lifecycle and relationship actions because that test flow had already
stopped at the status mismatch.

`requireActiveRelationshipTargets` now raises `ConflictException` while retaining the existing
stable error code and message. This shared guard is used by both Artist-Contact and Business
Partner-Contact creation. The integration contract now asserts HTTP 409 and
`ARCHIVED_RELATION_TARGET` for both archived parent types. Tests were not weakened or changed to
accept HTTP 422.

## Completed evidence after the correction

- `pnpm.cmd --filter @venue/api test:unit`: 4 files and 19 tests passed.
- `pnpm.cmd --filter @venue/api typecheck`: passed.
- `pnpm.cmd test:containers`: passed end to end against isolated PostgreSQL containers:
  - all three committed migrations were applied to a fresh test database, including
    `20260816000100_phase_3_master_data`;
  - the real database suite passed with 3/3 tests;
  - the API integration suites passed with 3/3 files and 21/21 tests: health 2/2, Phase 1 13/13
    and Phase 3 6/6;
  - the previously failing Business Partner conflict contract passed;
  - the equivalent Artist conflict contract passed;
  - the Phase-3 PII-safe audit test passed after the complete archive, reactivate, role-change and
    unlink flow ran to completion;
  - development-volume persistence across container replacement passed;
  - the web, API and worker production images built successfully.
- The container verifier removed its isolated containers, network and volumes after completion.
- The earlier full `pnpm.cmd verify` run passed formatting, ESLint, OpenAPI/client generation,
  workspace type checks, local tests and production builds.
- The earlier production dependency audit completed with no known vulnerabilities when repeated
  with the workstation's intercepting TLS certificate check disabled.

The generated OpenAPI still contains the complete Phase-3 path, parameter and request-body
contracts. The API integration suite covers role matrices, CRUD, search/filter/pagination,
reusable Contacts, multi-role assignments and partners, lifecycle, stale versions, tenant/API and
database isolation, stable archived-target conflicts and PII-safe audit metadata.

## Browser E2E acceptance

The first Phase-3 Chromium acceptance attempt reached Contact creation but failed because the
unanchored `/Vorname/` label selector also matched the text in "Nachname optional bei Vorname".
The complete Phase-3 flow was reviewed for the same class of ambiguity. Field labels are now
anchored at the beginning of their accessible names; known links, buttons, headings and role names
use exact matching; and both Contact assignment selects use the exact accessible combobox role and
name. The assertions and business flow were retained. The deterministic Business Partner role
summary is asserted as "Agentur, Kunde".

`pnpm.cmd test:e2e` then passed with 1/1 Chromium test in 17.0 seconds (17.8 seconds total). The
scenario completed bootstrap and login, Phase-1 organization/location changes, Artist and Contact
creation, both Contact assignments, Business Partner roles, archive/reactivate, invitation,
read-only Phase-3 navigation, the direct 403 authorization check and logout. The runner cleaned the
isolated test database before and after execution.

To repeat the scenario against an isolated database:

```powershell
docker compose up -d postgres-test
$env:TEST_DATABASE_URL = 'postgresql://venue:venue_test_local_only@127.0.0.1:5433/venue_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm.cmd db:migrate:deploy
pnpm.cmd test:e2e
```

For a non-destructive manual UI review against a dedicated development installation:

1. Apply migrations and create the one-time bootstrap link with `pnpm.cmd bootstrap:create`.
2. Sign in as Administrator and open Artists. Create an Artist with only a stage name; verify the
   "Unvollständig" marker.
3. Create a central Contact with a synthetic address such as `manual-contact@example.test`, then
   link it to the Artist with two roles. Verify that the marker disappears.
4. Create a Business Partner with two partner roles and link the same Contact with one or more
   assignment roles. Open the Contact detail and verify both usages.
5. Change an assignment's roles, remove/recreate a link, then archive and reactivate the Contact,
   Artist and partner. Verify default versus archived list filters.
6. Invite a Produktion or Lesend member. Verify that all three lists are visible, write controls are
   hidden, and a direct POST to a protected endpoint returns 403.
7. Review the organization audit endpoint: actions and IDs must be present; raw addresses, notes,
   telephone numbers and master-data email values must not appear in metadata.
