# Architecture overview

## Scope

Phase 0 supplies the runtime and delivery foundation only. Authentication, tenants,
organizations, locations, bookings, events, calculations, documents, invoices, and dashboards
are intentionally absent.

## Runtime view

```text
Browser
  │
  └── apps/web (Next.js App Router, server-first rendering)
        │ generated @venue/api-client
        ▼
      apps/api (NestJS REST, /api/v1)
        │ infrastructure adapters
        ▼
      packages/database (Prisma ORM) ── PostgreSQL

apps/worker (separate NestJS application context)
        │
        └── packages/database ────────── PostgreSQL
```

The API is a modular monolith. Future business modules remain deployment-aligned while owning
their internal application, domain, infrastructure, and presentation boundaries. The worker is
a separate process so long-running work cannot consume API request capacity.

## Workspace components

| Component                | Responsibility                                   | Must not contain               |
| ------------------------ | ------------------------------------------------ | ------------------------------ |
| `apps/web`               | Accessible shell and server-side API consumption | Business rules or copied DTOs  |
| `apps/api`               | Versioned HTTP delivery and use-case composition | UI concerns                    |
| `apps/worker`            | Lifecycle and ports for later background work    | Phase 0 jobs or a queue system |
| `packages/api-client`    | Generated OpenAPI types and small client factory | Handwritten endpoint DTOs      |
| `packages/database`      | Prisma client creation, transactions, migrations | Business orchestration         |
| `packages/configuration` | Validated process configuration                  | Secrets or logging of values   |
| `packages/shared`        | Small, stable technical contracts                | A universal domain engine      |

## Cross-cutting behavior

- Every executable validates required environment variables before becoming ready.
- API errors have stable `code`, `message`, `requestId`, and `timestamp` fields and never expose
  stack traces to clients.
- JSON logs are written to standard output. Secret values are never interpolated into log
  messages.
- Helmet headers, a strict origin allowlist, and no credentialed cross-origin requests provide a
  conservative HTTP baseline.
- OpenAPI is generated from the API source. Swagger UI is allowed only outside production and
  only when explicitly enabled.

See [module rules](module-rules.md) and the decisions in [`docs/adr`](adr/README.md).
