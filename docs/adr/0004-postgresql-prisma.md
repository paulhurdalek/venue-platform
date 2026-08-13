# ADR 0004: PostgreSQL and Prisma

- Status: accepted
- Date: 2026-08-13

## Context

Bookings, money, and later tenancy need transactional relational storage and controlled evolution.

## Decision

Use PostgreSQL 18 and Prisma ORM 7 with the PostgreSQL driver adapter. Prisma Migrate is the sole
schema-change mechanism, with distinct development and test databases.

## Consequences

The platform gains typed access, transactions, and reviewable SQL migrations. Generated clients
must be refreshed after schema changes, and database semantics still require explicit design.
