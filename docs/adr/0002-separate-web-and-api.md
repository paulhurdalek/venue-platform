# ADR 0002: Separate Next.js and NestJS applications

- Status: accepted
- Date: 2026-08-13

## Context

UI rendering and business-facing HTTP delivery have different scaling, security, and lifecycle
needs.

## Decision

Run Next.js App Router in `apps/web` and NestJS in `apps/api` as separately buildable applications.
The web consumes the API only through generated OpenAPI bindings.

## Consequences

Server and UI responsibilities remain clear, and either process can scale independently. Local
development runs two servers and requires explicit CORS configuration.
