# Architecture overview

## Scope

Phase 1 provides the identity and tenant boundary. Phase 3 adds the first business module:
organization-owned Artists, reusable Contacts, Business Partners and their normalized role-bearing
associations. Artist representation by a company is an explicit normalized association whose
representatives point to existing company-Contact associations; it is never inferred from shared
Contacts. Phase 4 adds organization-wide EventFormats whose V1 data is the concrete fachliche
Formatvorlage for concrete events. Phase 5 adds Location-scoped Events with optional EventFormat
provenance, independent VenueDateOptions and calculated availability. A central relational
occupancy model coordinates all three. Phase 6 adds event-specific Bookings, relational Line-up
requirements and their template-to-Event snapshot boundary. Phase 7 adds organization-wide service
master data, relational format requirements, immutable Event service snapshots and one versioned
calculation per Event. Deals, ticketing, revenue recognition, documents, invoices and rooms remain
absent.

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
their internal application, domain, infrastructure, and presentation boundaries. Phase 5 adds the
Location-bound `events` and `date-options` modules plus a shared occupancy domain/infrastructure
boundary. The EventFormat snapshot boundary, option lifecycle, availability query and bounded
calendar/list read models stay in their owning use cases. Date-option batch creation is an
application-level transaction over ordinary option aggregates; it deliberately introduces no
batch aggregate or persistence table. The worker is a separate process so
long-running work cannot consume API request capacity.

The Phase-6 `bookings` module follows the same four-layer boundary. A global Artist remains master
data; a Booking is a separate versioned Event aggregate relation with its own role, status,
agreement and ordering data. Format and Event Line-up requirements are relational children, not a
JSON/EAV configuration engine. Booking services own transition validation, progress calculation,
financial projection and transactional mutations; Prisma remains in the infrastructure adapter.

The Phase-7 `services` module owns service categories, catalog items, provider prices, format
requirements and calculation use cases through presentation, application, domain and infrastructure
layers. Prisma is confined to its infrastructure repository. Event creation calls one shared
infrastructure snapshot function inside the Event/DateOption transaction. Booking reports relevant
source changes through an application port whose adapter participates in the Booking transaction;
neither application service reaches into another module's Prisma repository.

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

The event boundary supports two explicit creation paths. A template-backed Event copies current
EventFormat values inside its creation transaction and retains source format ID/version plus
provenance snapshots. In the same transaction it also copies each active format Line-up
requirement, including its source ID/version and optional Minor-Unit default fee. A free Event has
all source/snapshot columns null and requires its own
EventKind; it never creates a placeholder format. Both paths store independently editable values.
EventFormat updates never mutate existing Events, and archived formats remain historically
referencable but cannot create new Events.

Event reads and mutations repeat `organization_id` and apply the membership Location scope.
Location and source-format foreign keys are tenant-composite. Event application use cases own the
snapshot, optimistic-update, status and audit transactions; controllers only map validated HTTP
input. A PostgreSQL `DATE` carries the local calendar day, minute columns carry local times and the
Location's IANA timezone is snapshotted without constructing a UTC event instant.

The occupancy boundary converts complete Event schedules and DateOptions to half-open local
timestamp ranges. Events reserve both rank slots; a DateOption reserves only `FIRST` or `SECOND`.
Sorted transaction-scoped advisory locks serialize rank decisions and Location changes, while a
PostgreSQL GiST exclusion constraint is the final concurrent-write invariant. Expiry cleanup,
availability, Event mutations and option mutations all call this same boundary. Incomplete Events
remain valid business records but deliberately have no exact occupancy row and force manual review
for their local date.

`VenueDateOption` remains separate from Event and Booking aggregates. It owns rank, expiry,
status, version and optional master-data references. Release, manual promotion and conversion are
atomic repository transactions. Conversion replaces the option occupancy with the final Event
occupancy, snapshots active format Line-up requirements when a format is selected and marks
overlapping second options unavailable without deleting their history.

Booking reads and writes repeat organization and Event ownership and reuse the Event's Location
scope. Optional company and Contact references use tenant-composite keys; new assignments must be
active and valid for the Artist, while already referenced archived records remain readable and
labelled. The active Line-up is guarded by partial unique indexes for Artist/role and order.
Declined and cancelled rows remain historical and no longer occupy either key.

Status changes follow one explicit domain graph, increment the optimistic version and append both
status history and allowlisted audit metadata inside one transaction. Reordering requires the
complete active set with the current version of every Booking. Progress and Event-list summaries
load requirements and Bookings in batches; list filtering uses aggregate SQL rather than one API
or database query per Event. The `bookings.finance` permission is applied to the server-side DTO
projection, so financial fields never reach unauthorized clients.

Every Event has exactly one `EventCalculation`. Format-backed creation copies service requirements
and resolved prices into relational Event positions in the Event transaction; free Events create an
empty calculation. Snapshot names, categories, units, providers, source versions and prices remain
stable on later catalog edits. Calculation reads load positions, eligible Bookings and history as
bounded relation queries. Dynamic Booking costs have no duplicate persistence row. Position or
Booking financial changes lock and version the calculation, and atomically retain an approved-to-
Draft transition in history and audit.

Authentication answers “who is this user?” and remains owned by Better Auth. Authorization
answers “what may this membership do in this organization?” and remains owned by the platform.
Keeping these boundaries separate allows a user to hold different roles in multiple organizations
without encoding business permissions into the identity provider.
