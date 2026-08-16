# Phase 2 decision: no separate implementation

Date: 2026-08-16. Status: accepted architecture decision.

## Decision

Phase 2, originally named only “Backoffice und Stammdaten”, does not become a separate code
delivery. Its concrete cross-cutting responsibilities were already delivered in Phase 1:

- organization and Location master data;
- tenant memberships, standard roles and concrete permissions;
- invitations and the administrative settings UI;
- optimistic versions, archive-ready entity conventions and append-only audit;
- versioned REST, DTO validation, OpenAPI generation and the generated client;
- tenant-safe PostgreSQL relations and the server-side authorization boundary.

The remaining “master data” candidates are not generic platform configuration. They belong to
named business capabilities and are introduced by their owning phase. Phase 3 therefore starts
the first business module with Artists, reusable contacts and business partners.

## Rationale

A separate Phase 2 would either duplicate Phase 1 or introduce speculative structures for later
features. In particular, a universal master-data table, EAV model, configurable form engine or
abstract template framework would weaken validation and ownership without a current use case.

The product principle remains:

```text
Backoffice → template owned by a concrete module → event snapshot → explicit event override
```

Templates and snapshots are added only when the corresponding downstream object exists. Phase 3
contains reusable organization-wide source data, but no event snapshot because events do not yet
exist.

## Explicitly deferred

- event formats and their templates;
- events, calendars and event-specific snapshots;
- bookings, line-ups and booking states;
- services, price lists, calculations and cost/revenue data;
- ticketing, deal models and rental terms;
- documents, offers, contracts, invoices and settlement.

This is a no-code decision: no Phase-2 migration or runtime module is required.
