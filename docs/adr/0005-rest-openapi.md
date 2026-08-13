# ADR 0005: REST and OpenAPI

- Status: accepted
- Date: 2026-08-13

## Context

The web needs a stable, typed contract without sharing transport DTO source with the API.

## Decision

Expose URI-versioned REST beginning at `/api/v1`. Generate OpenAPI from NestJS and generate the
TypeScript client types from that artifact.

## Consequences

Contract drift becomes a build failure and other clients can use the same description. API changes
must regenerate and review the specification. Interactive documentation stays disabled in
production.
