# Architecture overview

## Scope

Phase 1 provides the identity and tenant boundary. Phase 3 adds the first business module:
organization-owned Artists, reusable Contacts, Business Partners and their normalized role-bearing
associations. Artist representation by a company is an explicit normalized association whose
representatives point to existing company-Contact associations; it is never inferred from shared
Contacts. Phase 4 adds organization-wide EventFormats whose V1 data is the concrete fachliche
Formatvorlage for later events. Bookings, events, event snapshots, calculations, documents,
invoices and rooms remain absent.

## Runtime view

```text
Browser (HTTP-only session cookie)
  │
  └── apps/web (Next.js App Router, server-first rendering)
        │ same-origin /api rewrite + generated @venue/api-client
        ▼
      apps/api (NestJS REST /api/v1 + Better Auth /api/auth/*)
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
| `apps/web`               | Accessible identity, tenant and master-data UI   | Business rules or copied DTOs  |
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
- Helmet headers, an exact trusted-origin allowlist, credentialed CORS, SameSite cookies, and
  Better Auth origin checks provide the HTTP security boundary.
- OpenAPI is generated from the API source. Swagger UI is allowed only outside production and
  only when explicitly enabled.

See [module rules](module-rules.md) and the decisions in [`docs/adr`](adr/README.md).

## Request authorization path

For every organization-owned API request, the central guard resolves the Better Auth session,
loads the current membership from PostgreSQL, requires `ACTIVE`, checks the concrete permission
key, and checks the selected Location scope where applicable. Controllers never authorize by role
name. Services repeat `organization_id` in every business query; mapping tables additionally use
composite organization foreign keys. Unknown and foreign tenant IDs both return the same 404
response. Artist-company representatives additionally use company-aware three-column foreign keys,
which ensure that the selected source Contact association belongs to the same company and tenant.

The `master-data` API module is the first concrete application of the four-layer business-module
rule. It owns Artist, Contact and Business Partner presentation, application, domain and
infrastructure code. The platform module continues to own identity-adjacent organization access.
The only extracted cross-cutting service is the transaction-scoped audit writer.

The separate `event-formats` module follows the same presentation, application, domain and
infrastructure boundaries. Its application use cases own mutation transaction boundaries through
a repository transaction port; Prisma remains confined to the infrastructure adapter. EventFormat
is deliberately the concrete V1 format template itself. No generic template abstraction or
configuration engine exists.

The future event boundary is snapshot-based: an event will copy current EventFormat values at
creation and may retain the source format ID and version. EventFormat updates never mutate existing
events. Archived formats remain historically referencable but will not be offered for new events.

Authentication answers “who is this user?” and remains owned by Better Auth. Authorization
answers “what may this membership do in this organization?” and remains owned by the platform.
Keeping these boundaries separate allows a user to hold different roles in multiple organizations
without encoding business permissions into the identity provider.
