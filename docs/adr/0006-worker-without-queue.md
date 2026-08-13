# ADR 0006: Separate worker without a queue in Phase 0

- Status: accepted
- Date: 2026-08-13

## Context

Later document generation, notifications, and outbox processing must not execute in request
handlers, but choosing queue infrastructure now would pre-empt operational decisions.

## Decision

Provide a separately startable NestJS application context with graceful shutdown, readiness after
database connection, and application ports for the three future capabilities. Add no Redis, broker,
or business job.

## Consequences

Process isolation and contracts are ready without extra infrastructure. Phase 1 or later must make
an explicit delivery, retry, idempotency, and queue decision before implementing jobs.
