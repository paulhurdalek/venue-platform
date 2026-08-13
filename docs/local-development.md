# Local development

## Prerequisites

- Node.js `24.18.x`
- Corepack and pnpm `11.21.0`
- Docker Engine with Docker Compose v2
- Git

Run all commands from the repository root. Copy `.env.example` to `.env`; the committed values are
local-only examples and are not suitable for shared or production environments.

## Install and start

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate:deploy
pnpm dev
```

The development endpoints are:

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/api/v1/health`
- Swagger UI: `http://localhost:3001/api/docs` only if `SWAGGER_UI_ENABLED=true`

`pnpm dev` rebuilds required packages and regenerated API bindings before starting all three
applications. The worker reports `worker.ready` only after its database check succeeds. `Ctrl+C`
initiates graceful shutdown.

## Stop and reset

```bash
docker compose stop
docker compose down
```

`docker compose down -v` also deletes the local development database and is intentionally not the
normal stop command.

## Migrations and generated artifacts

```bash
pnpm db:migrate:dev       # create a reviewed development migration
pnpm db:migrate:deploy    # apply committed migrations
pnpm db:status
pnpm api:generate         # OpenAPI JSON and typed bindings
```

Never use `prisma db push` in this project. Do not edit files under
`packages/database/src/generated`, `packages/api-client/src/generated`, or
`packages/api-client/openapi` manually.

## Tests and production builds

```bash
pnpm verify
cp .env.test.example .env.test
docker compose --profile test up -d postgres-test
pnpm db:migrate:test
dotenv -e .env.test -- pnpm test:db
pnpm exec playwright install chromium  # once per developer machine
pnpm test:e2e
pnpm security:audit
```

Build the production images from the repository root:

```bash
docker build -f apps/web/Dockerfile -t venue-web .
docker build -f apps/api/Dockerfile -t venue-api .
docker build -f apps/worker/Dockerfile -t venue-worker .
```

Run the complete container acceptance test on a machine with Docker Compose:

```bash
pnpm test:containers
```

It uses an isolated Compose project and volume, applies the migration to the test service, runs the
real database integration test, recreates the development database container to verify volume
persistence, and builds all three application images. The temporary verification volume is removed
afterward; the normal `venue-platform` development volume is not touched.

Production deployments must inject environment values through the deployment platform. Do not
copy `.env` files into images.
