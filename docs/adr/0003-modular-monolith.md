# ADR 0003: Modular monolith

- Status: accepted
- Date: 2026-08-13

## Context

The product will gain several business areas, but their operational boundaries and load patterns
are not yet known.

## Decision

Use one deployable NestJS API composed of strongly bounded modules with presentation, application,
domain, and infrastructure layers.

## Consequences

Transactions and deployment stay simple while code boundaries support later extraction if proven
necessary. Module dependency rules require review discipline; no universal engine is created.
