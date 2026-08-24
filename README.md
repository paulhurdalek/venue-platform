# Venue Platform — Phase 7

This repository contains the secure identity and tenant foundation plus organization-owned Artist,
central Contact and Business Partner master data, organization-wide EventFormat templates and
Location-scoped concrete events, two-rank VenueDateOptions and calculated availability with
calendar/list planning and transactional multi-option creation from selected free dates. It
includes normalized role-bearing relations, permission-aware
administration, optional immutable EventFormat provenance, concurrency-safe relational occupancy
and privacy-conscious audit records. Phase 6 adds event-specific Bookings, relational Line-up
requirements and snapshots, explicit status history, accessible ordering, role-based progress and
server-side financial redaction. Phase 7 adds a relational service catalog, provider prices,
EventFormat service requirements, immutable Event snapshots, automatic Booking-cost projection and
versioned approval-ready Event calculations in EUR.

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

Read [the Phase 1 guide](docs/phase-1.md), [the Phase 2 decision](docs/phase-2-decision.md),
[the Phase 3 guide](docs/phase-3.md), [the Phase 4 guide](docs/phase-4.md),
[the Phase 5 guide](docs/phase-5.md), [the Phase 6 guide](docs/phase-6.md),
[the Phase 7 guide](docs/phase-7.md), and
[the local development guide](docs/local-development.md) before making changes.
The complete pinned toolchain is listed in [versions](docs/versions.md).
Phase-specific local verification evidence and remaining host-only gates are recorded in the
corresponding verification documents, including [Phase 7 verification](docs/phase-7-verification.md).

## Repository map

- `apps/`: independently executable web, API, and worker applications.
- `packages/`: generated API client, database adapter, environment validation, and truly shared
  contracts.
- `e2e/`: cross-application Playwright authentication and administration tests.
- `docs/`: architecture, operating conventions, and decisions.
- `scripts/`: cross-platform orchestration for tests that own child processes.
- `.github/`: automated verification and container build workflow.
