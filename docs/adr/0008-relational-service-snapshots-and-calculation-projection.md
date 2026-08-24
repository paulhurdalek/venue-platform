# ADR 0008: Relational service snapshots and calculated Booking projection

- Status: accepted
- Date: 2026-08-24

## Context

Event formats need reusable service requirements whose current catalog prices affect future Events,
while an existing Event must never change when category, service, provider, price or format data is
edited. Event calculations also need Booking fee, travel and hotel Buy-out costs without creating a
second editable copy. Money must remain exact and Phase 7 supports only EUR.

## Decision

Store categories, services, provider prices and format requirements relationally. When an Event is
created, create its one calculation and copy every active format requirement into a relational
Event position in the same transaction. Persist source IDs and versions plus the human-readable and
financial snapshot fields. Manual Event edits preserve that snapshot provenance.

Store all monetary values as optional nonnegative `BIGINT` Minor Units with a database-enforced EUR
currency. Store quantities as `DECIMAL(18,4)` and calculate line totals server-side using exact
integer arithmetic and `HALF_UP` cent rounding.

Do not persist derived Booking-cost rows. Project active Booking fee, travel and Buy-out values when
loading the calculation. The Booking module reports relevant changes through an Application port;
its infrastructure adapter locks and versions the owning calculation in the Booking transaction.
An approved calculation is reset to Draft with status history and audit metadata.

## Consequences

- Future Events observe current catalog defaults; existing Events remain immutable with respect to
  later catalog changes.
- Free and migrated Events have an empty, usable calculation without fabricated services.
- Booking amounts have one write authority and cannot drift from a copied calculation position.
- Calculation reads join the Event, positions, Bookings and history as bounded relation queries,
  avoiding a query per row or per Event.
- Missing prices remain distinguishable from zero and block approval rather than creating a false
  complete total.
- Ticketing, revenue recognition, taxes, exchange rates, documents and invoicing remain outside
  this decision.
