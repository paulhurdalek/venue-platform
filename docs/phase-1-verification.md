# Phase 1 verification report

Date: 2026-08-13. Branch: `phase-1-auth-org`. No push, merge, or deployment was performed.

## Completed local evidence

- `pnpm db:migrate:deploy`: both migrations applied from an empty PostgreSQL 18.4 database.
- `pnpm test:db`: 2/2 real migration/constraint tests passed.
- `pnpm test:integration`: 13/13 API and PostgreSQL tests passed.
- `pnpm test:e2e`: 1/1 full Chromium scenario passed, including two browser contexts.
- `pnpm verify` plus the final focused reruns: formatting, ESLint, all workspace TypeScript checks,
  API 21/21, database 2/2, configuration 5/5, and worker 1/1 tests, generated OpenAPI/client, and
  all production builds passed.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities (rerun with npm registry
  TLS verification disabled because this workstation's intercepting certificate was not trusted by
  Node; the advisory response itself was successful).
- `pnpm install --frozen-lockfile --offline --ignore-scripts`: lockfile policy and peer resolution
  passed.

The PostgreSQL/API matrix proves one-time bootstrap, blocked public sign-up, sign-in/session/
sign-out, HTTP-only/SameSite cookies, five roles, stale-version conflict, permission denial,
suspension, two-organization isolation, selected Location scope, single-use/expired/revoked
invitations, existing-user multi-organization membership, safe audit metadata, and append-only
audit enforcement.

The Chromium matrix proves setup through the printed link, sign-in, organization and Location
editing, invitation creation and clipboard copy, acceptance in a second browser, hidden Team UI
for a read-only role, backend 403, sign-out, and renewed route protection. Next development
incoming-request logs are disabled, so bootstrap and invitation tokens do not enter E2E output.

## Environment limitation

Docker is not installed on this workstation, so `pnpm test:containers` and the three Docker image
builds could not be executed locally. The script has been upgraded to run Phase 1 DB and API
integration before persistence and image checks. It now explicitly runs `pnpm packages:build`
immediately before the API integration suite, so a fresh installation does not depend on
pre-existing workspace `dist` directories. The unchanged Dockerfiles passed the workspace
production builds; GitHub CI remains the authoritative container gate.

Subject to that environment-only container gate, the branch is ready for review and GitHub CI.
