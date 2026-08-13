# Venue Platform — Phase 1

This repository contains the secure identity and tenant foundation for a modular venue booking
platform: email/password sign-in, database sessions, one-time setup, organizations, locations,
memberships, role-based access, invitation links, and audit records. Later booking and event
modules are deliberately absent.

## Quick start

Prerequisites: Node.js 24.18, Corepack/pnpm 11.21.0, Docker with Compose.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate:deploy
pnpm bootstrap:create
pnpm dev
```

Web runs on `http://localhost:3000`, API health on
`http://localhost:3001/api/v1/health`, and development-only Swagger UI on
`http://localhost:3001/api/docs` when explicitly enabled.

Open the one-time URL printed by `pnpm bootstrap:create` to create the first administrator,
organization, and location. The command refuses to create a second installation or a second live
setup link.

Read [the Phase 1 guide](docs/phase-1.md) and
[the local development guide](docs/local-development.md) before making changes.
The complete pinned toolchain is listed in [versions](docs/versions.md).
Local verification evidence and the remaining container-only gate are recorded in
[Phase 1 verification](docs/phase-1-verification.md).

## Repository map

- `apps/`: independently executable web, API, and worker applications.
- `packages/`: generated API client, database adapter, environment validation, and truly shared
  contracts.
- `e2e/`: cross-application Playwright authentication and administration tests.
- `docs/`: architecture, operating conventions, and decisions.
- `scripts/`: cross-platform orchestration for tests that own child processes.
- `.github/`: automated verification and container build workflow.
