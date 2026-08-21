# Phase 3 verification report

Date: 2026-08-21. Branch: `phase-3-artists-contacts-partners`. No commit, push, merge,
deployment or Phase-4 work was performed.

## Compact lifecycle actions (2026-08-21)

Artist, Contact and Business Partner detail pages no longer render the large permanent lifecycle or
danger-zone panel. Their shared `EditableDetail` heading now exposes a secondary-actions slot beside
the status badges and primary `Bearbeiten` action. The existing shared `LifecycleAction` uses that
slot to render a quiet `Weitere Aktionen` menu only when the server page has confirmed the matching
`*.archive` permission. Organization and Location details were not given lifecycle actions.

For active records, the menu names the concrete destructive action (`Artist archivieren`, `Kontakt
archivieren` or `Geschäftspartner archivieren`); archived records offer `Reaktivieren`. The menu has
an accessible name, `aria-haspopup`, `aria-expanded`, menu/menuitem semantics, first-item focus,
arrow-key navigation, Escape handling and focus restoration. The native modal confirmation offers
an explicit `Abbrechen`/`Archivieren` or `Abbrechen`/`Reaktivieren` decision. Archive confirmation
states that existing links remain, new assignments are prevented and later reactivation is
possible. Errors stay in the dialog; successful status changes refresh the server view and expose an
accessible success message. The existing status endpoints and optimistic version remain unchanged.

Verification evidence:

- Targeted web TypeScript and ESLint checks passed without warnings.
- `pnpm.cmd verify` passed formatting, repository-wide lint, generated OpenAPI/client consistency,
  every workspace type check, database-independent tests and all production builds. The API suite
  reported 29 passed and 22 intentionally database-dependent tests skipped in this command.
- `pnpm.cmd test:e2e` passed the expanded 1/1 Chromium scenario in 21.6 seconds (22.5 seconds total)
  against a freshly migrated isolated PostgreSQL database. It covers active and archived states,
  cancel without mutation, successful archive/reactivation for all three entity types, keyboard
  opening, Escape/focus restoration, the complete confirmation explanation and absence of the menu
  for a read-only member on all three detail pages.
- An in-app browser inspection confirmed the compact heading layout, removal of the large lifecycle
  area, menu focus/ARIA state, Escape/focus restoration, modal layout and unchanged status after
  cancellation. The inspection did not archive the user's development record.
- No API, OpenAPI, permission, database, schema or migration change was needed for this refinement.
- `pnpm.cmd test:containers` was deliberately not repeated because the known local Docker Desktop
  HTTPS-proxy certificate blocker remains. No TLS workaround was added; the complete container run
  remains assigned to the existing GitHub Actions `containers` job.

## Inline contact and representation workflow correction (2026-08-21)

The Artist working view now separates `Agenturen & Firmenvertretungen` from `Direkte Kontakte ohne
Firmenvertretung` with the approved descriptions and read-only empty states. Active companies remain
selectable when they do not yet have Contacts. Edit mode distinguishes no active company, a company
without a Contact, and the case where all active companies are already linked. The company creation
link carries a server-validated Artist-detail `returnTo` path. Business Partner details now use
`Ansprechpartner der Firma` and the corresponding description and edit labels.

Direct Artist Contacts, Business Partner Contacts and Artist company representatives can each be
created inline. The new application use cases write the central Contact, normalized role-bearing
assignments and PII-safe audit entries inside one Prisma transaction. Existing Contacts can still be
selected. Artist company creation can either select an existing `BusinessPartnerContact` through the
established endpoint or create/attach a central Contact atomically. Permission checks require the
existing owner write permission plus `contacts.write`; a workflow that may add a company-contact
assignment also requires `business_partners.write`.

`POST /contacts/matches` performs an organization-bound normalized comparison. Identical trimmed,
case-folded e-mail addresses and digit-normalized phone/mobile values are strong matches and must be
reused. Equal complete names are weak matches and can be consciously confirmed with
`allowNameDuplicate`. The normal Contact creation endpoint applies the same guard. No global unique
constraint and no database migration were added.

The API now rejects a new mixed direct/company assignment of the same Contact for the same Artist
with HTTP 409, code `ARTIST_CONTACT_ASSIGNMENT_CONFLICT` and a stable German message. Both legacy
assignment kinds remain readable; the UI marks an existing conflict and leaves both controlled
unlink actions available. Contact pickers filter the opposite assignment kind, while the same
Contact remains valid for another Artist.

Generated OpenAPI and client contracts contain these additive endpoints:

- `POST /artists/{artistId}/contacts/inline`
- `POST /business-partners/{businessPartnerId}/contacts/inline`
- `POST /artists/{artistId}/business-partners/inline-contact`
- `POST /artists/{artistId}/business-partners/{associationId}/contacts/inline`
- `POST /contacts/matches`

Verification evidence:

- Domain and Application coverage includes normalized e-mail/phone/name matching, strong and weak
  duplicate handling, additional permission checks and the direct/company Artist conflict. API unit
  tests passed with 27/27 tests.
- A dedicated isolated PostgreSQL database received all four existing migrations. The database
  suite passed 3/3 tests. The real API suites passed 24/24 tests, including successful atomic inline
  workflows, role persistence, normalized duplicate matches, same-Artist 409, different-Artist
  allowance, and deliberate late foreign-key failures proving rollback without orphan Contacts for
  all three transaction shapes.
- `pnpm.cmd verify` passed formatting, lint, generated OpenAPI/client consistency, every workspace
  type check, database-independent tests and all production builds. It reported 29 API tests passed
  and 22 database-dependent tests skipped in that command's intentionally database-free context.
- `pnpm.cmd test:e2e` passed 1/1 Chromium scenario in 22.0 seconds (22.8 seconds total) against the
  isolated database. It covers existing and inline direct Contacts, existing and inline company
  Contacts, representative filtering, inline representative creation, accessible exact selectors,
  clickable channels, responsive layout and absence of write controls for a read-only member.
- The E2E runner accepts isolated web/API ports and an optional production web-server mode. This
  allowed the acceptance run on 3200/3201 without terminating the user's running development server
  on port 3000.
- The container verifier now uses configurable Compose host ports and reserves 55432/55433 by
  default, while ordinary `docker compose up` keeps 5432/5433. Its migration, database, API and
  persistence stages passed. The web image then reached dependency installation, but the local
  Docker Desktop HTTPS proxy at `http.docker.internal:3128` presented a certificate chain that the
  Node Linux image does not trust. pnpm consistently reported `UNABLE_TO_VERIFY_LEAF_SIGNATURE` for
  package and npm-attestation requests. The stalled retry cycle was stopped after the environment
  cause was established; TLS and supply-chain checks were not weakened.
- The two containers, network and volume belonging only to the isolated Compose project
  `venue-platform-phase3-20888` were removed after the controlled stop. The existing
  `venue-platform-postgres-1` development database remained running and healthy.
- The complete container check remains wired as the `containers` job in `.github/workflows/ci.yml`
  on a clean GitHub-hosted Ubuntu runner. Because the current work is deliberately uncommitted and
  unpushed, that job can only validate these changes after the later approved pull-request workflow.
- The earlier in-app visual inspection could not attach because its then-installed browser-control
  runtime rejected its own plugin service path as untrusted. The later lifecycle refinement above
  was inspected successfully with the updated runtime.

## Compact read-only master-data UX (2026-08-21)

Existing Artist, Contact, Business Partner, Organization and Location records now open in a
compact read-only view. Empty optional fields are omitted, related values are grouped, and e-mail,
telephone, mobile and safe HTTP(S) website values are direct links. A permission-aware
`Bearbeiten` action reveals the unchanged edit fields on the same page. `Abbrechen` discards the
client-side draft; a successful update returns to the read view after refreshing the server data
and shows a success message. Create, invitation, login, filter and search forms retain their former
behavior.

The Artist page puts `Management & Booking` directly below its compact heading. Explicit company
representations are ordered with the representation containing the primary representative first;
within each company the API's deterministic primary-first representative order is preserved. The
company, company roles, representatives, Contact roles and all available contact channels remain
visible in read mode. Direct Artist Contacts stay separate. Relationship and role editors are also
closed initially and require their own permission-aware action.

Artist overview rows now expose the primary company, primary representative and clickable contact
channels. Contact and Business Partner lists show their most relevant assignments, roles and
contact paths. The same semantic tables become compact labeled cards below 620 px, and the detail
section grid becomes one column. The existing Artist DTO already contained the normalized company
and representative graph, and the Prisma repository loads it with nested includes and deterministic
ordering; therefore this UX work required no additional API query, DTO/OpenAPI change, N+1 query,
database field or migration.

The Chromium acceptance scenario now verifies read mode before edit, hidden empty Artist fields,
cancel without persistence, successful save back to read mode, Organization and Location parity,
Contact and Business Partner parity, two representatives in primary-first order, contact-link
targets, the compact Artist overview, a narrow viewport without horizontal document overflow and
the absence of every write control for a read-only member.

Verification evidence for the UX revision:

- The targeted web type check and ESLint run passed with zero warnings.
- `pnpm.cmd verify` passed formatting, lint, generated OpenAPI/client consistency, every workspace
  type check, all database-independent tests and all production builds. API tests reported 23
  passed and 20 database-dependent tests skipped in that environment; the database package
  reported its three explicit database tests skipped there as designed.
- The first real Chromium attempt exposed an ambiguous Organization heading selector after the new
  `Organisationsdaten` section was introduced. All remaining non-exact heading selectors were made
  exact. The unchanged end-to-end business scenario then passed with 1/1 test in 31.4 seconds (32.6
  seconds total) against the isolated PostgreSQL test service.
- `pnpm.cmd test:containers` applied all four migrations, passed 3/3 PostgreSQL tests, passed 22/22
  API integration tests and passed the development-volume persistence check. The web image build
  then reached `pnpm install --frozen-lockfile --prefer-offline` but the local registry path
  repeatedly returned `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, including for npm attestations. The run
  was stopped after the configured retries demonstrated the stable external certificate-chain
  failure. TLS, frozen-lockfile and supply-chain verification were not disabled or weakened; API
  and worker image builds consequently did not run. Only the isolated acceptance containers,
  network and temporary volume were removed, and the previously running repository development
  PostgreSQL container was restored.
- Because the mandatory container check could not finish successfully, no local commit was
  created.

## Artist representation extension (2026-08-17)

Phase 3 now models company representation explicitly instead of inferring it from shared Contacts.
The additive `20260817000100_artist_representations` migration introduces normalized,
organization-owned Artist–Business Partner, company-role, representative and representative-role
tables. Company representatives point to the exact existing `BusinessPartnerContact` row. Composite
tenant/company foreign keys prohibit cross-tenant and wrong-company selections, and a partial
unique index permits at most one primary representative per company representation. Existing
Artists, Contacts, Business Partners and both existing Contact-assignment types are untouched.

The REST/OpenAPI contract and generated client now cover linking and unlinking a company
representation, replacing its company roles, and adding, changing or removing representatives.
Company links and representatives have independent positive optimistic versions. A representation
requires company roles and at least one representative; every representative requires Contact
roles. The last representative can only be removed together with the complete representation, and
a source Business Partner–Contact assignment in use returns the stable HTTP 409
`RELATIONSHIP_IN_USE`. Creation, role changes, representative changes and controlled unlinking are
audited transactionally using only IDs, role IDs, versions and the primary flag.

The Artist detail page contains a permission-aware “Management & Booking” working view.
It exposes company and Contact detail links, company and representative roles, optional primary
status, and visible `mailto:`/`tel:` links for e-mail, telephone and mobile. Existing direct Artist
Contact cards remain separate and show the same contact channels. The browser flow covers both
views and scopes role selectors by their accessible fieldset names so the two “Agentur” roles are
not ambiguous.

Current local evidence for this extension:

- `pnpm format:check`: passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed for every workspace package after OpenAPI and Prisma generation.
- `pnpm --filter @venue/api test:unit`: 4 files and 21/21 tests passed.
- `pnpm test`: all database-independent tests passed; API reported 23 passed, database-bearing API
  tests 20 skipped, and the explicit database package tests 3 skipped because no test database URL
  was active for that command.
- API, worker and production Next.js builds passed. The web build compiled, type-checked and
  generated all routes including the Artist detail route.
- Playwright discovered the updated Chromium scenario successfully with `--list`.

Two subsequent container acceptance runs applied all four migrations and passed the real database
suite with 3/3 tests, the API integration suites with 22/22 tests, and the development-volume
persistence test. Both runs then failed exclusively while the web image was downloading workspace
dependencies: the registry connection reached about 495 of 498 packages before pnpm aborted with a
request timeout.

All three application Dockerfiles now use the current `# syntax=docker/dockerfile:1` frontend and
the same locked BuildKit cache `venue-pnpm-store` mounted at `/pnpm/store`. Installation still uses
the committed lockfile with `--frozen-lockfile` and additionally uses `--prefer-offline`, allowing
completed downloads to survive a failed build and to be reused by the web, API and worker image
builds on the same trusted builder. Earlier temporary project-level pnpm request settings limited
network concurrency to 8, retried failed fetches five times with 10–120 second backoff, and allowed
up to 600 seconds per request. These settings were removed once the certificate-chain cause was known:
retries cannot repair an untrusted proxy certificate and only hide the failure for several minutes.
pnpm remains pinned to 11.21.0; TLS verification, lifecycle-script allowlists, lockfile verification
and the existing supply-chain controls remain unchanged. No machine-specific certificate or path is
part of the repository. The three image builds must be repeated in the GitHub Actions `containers`
job to close the final container acceptance gap. After this stabilization, `pnpm format:check`,
`pnpm lint`, and the complete `pnpm typecheck` workspace run passed.

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
