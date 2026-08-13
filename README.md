# Venue Platform — Phase 0

This repository contains the technical foundation for a modular venue booking platform. It
deliberately contains no authentication or business capabilities.

## Quick start

Prerequisites: Node.js 24.18, Corepack/pnpm 11.21.0, Docker with Compose.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate:deploy
pnpm dev
```

Web runs on `http://localhost:3000`, API health on
`http://localhost:3001/api/v1/health`, and development-only Swagger UI on
`http://localhost:3001/api/docs` when explicitly enabled.

Read [the local development guide](docs/local-development.md) before making changes.
The complete pinned toolchain is listed in [versions](docs/versions.md).
Local verification evidence and the remaining container-only gate are recorded in
[Phase 0 verification](docs/phase-0-verification.md).

## Repository map

- `apps/`: independently executable web, API, and worker applications.
- `packages/`: generated API client, database adapter, environment validation, and truly shared
  contracts.
- `e2e/`: cross-application Playwright smoke tests.
- `docs/`: architecture, operating conventions, and decisions.
- `scripts/`: cross-platform orchestration for tests that own child processes.
- `.github/`: automated verification and container build workflow.
