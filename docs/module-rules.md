# Module and dependency rules

## Backend layers

Each business module introduced after Phase 0 uses these dependency directions:

```text
presentation ──► application ──► domain
                       ▲            ▲
                       └─ infrastructure
```

- **Presentation** maps transport input and output. Controllers call one application use case and
  contain no business rules.
- **Application** coordinates use cases, domain behavior, authorization decisions, and transaction
  boundaries through ports.
- **Domain** contains business concepts and invariants. It imports neither NestJS/HTTP, Next.js,
  Prisma, nor vendor SDKs.
- **Infrastructure** implements application ports for PostgreSQL, files, notifications, and other
  external systems.

The technical health module demonstrates the intended shape without creating premature business
module placeholders.

## Allowed dependencies

- A module may expose an explicit public application contract; consumers must not import its
  infrastructure or internal domain objects.
- Cross-module database-table access is forbidden. Coordination happens through public use cases,
  domain events, or a deliberately reviewed read model.
- Transaction ownership belongs to the application use case that coordinates the operation.
  `PrismaService.transaction` and `withTransaction` are the prepared mechanisms.
- `packages/shared` accepts code only when two real consumers need the same stable technical or
  domain-neutral contract.
- Web code consumes generated OpenAPI bindings. It must not import API controllers, Prisma types,
  or recreate response DTOs.
- Worker ports define capability boundaries. Infrastructure implementations arrive only with the
  relevant business phase.

## Enforcement during review

Reviewers reject deep imports across module folders, controller logic, direct Prisma use in the
domain, schema changes without migrations, handwritten API response copies in the web app, and
generic abstractions without at least two concrete uses.
