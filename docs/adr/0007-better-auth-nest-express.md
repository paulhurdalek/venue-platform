# ADR 0007: Better Auth in the NestJS/Express API

- Status: accepted
- Date: 2026-08-13

## Context

Phase 1 requires secure email/password authentication and revocable database sessions without
creating a parallel identity system in Next.js or maintaining password hashes ourselves. The
existing API is NestJS on Express and PostgreSQL/Prisma is already authoritative.

## Decision

Use exactly Better Auth `1.6.25` and `@better-auth/prisma-adapter` `1.6.25`. Mount its official
Node handler directly in the API at `/api/auth/*` before Express JSON parsing. Use its Prisma
adapter against the existing database, its documented UUID generator option, its password
implementation, and its database session/cookie model. Do not use a community Nest integration.

The application owns reviewed Prisma migrations for Better Auth tables; Better Auth never runs a
production schema synchronization. Direct sign-up is disabled. The supported server-side admin
API creates bootstrap and invited users, including inside the surrounding Prisma transaction.

Next.js contains only the Better Auth browser client and a same-origin `/api` rewrite. It neither
stores authentication secrets nor creates a second session implementation.

## Consequences

- Express body parsing must remain after the Better Auth handler.
- Password hashing and current-session revocation remain Better Auth responsibilities.
- Cookie attributes, trusted origins, session lifetime, and rate limits are environment validated.
- Business authorization is deliberately separate: central platform policies resolve
  organization membership, permission, and Location scope on every protected request.
- Social login, password-reset email, email verification flows, 2FA, and passkeys are deferred.
