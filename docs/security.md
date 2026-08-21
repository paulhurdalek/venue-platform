# Phase 1 security model

## Identity and sessions

Better Auth 1.6.25 owns email/password verification, password hashing, session creation, cookies,
and current-session revocation. Sessions are opaque database records; the browser receives an
HTTP-only `SameSite=Lax` cookie, with `Secure` forced in production. No public JWT is the primary
browser session. The handler is mounted before Express body parsers at `/api/auth/*`.

Public sign-up is disabled in Better Auth itself. Users can be created only by the server-side
Better Auth API while consuming a valid bootstrap or invitation token in the same database
transaction. There is no registration page.

Exact trusted origins are shared by Better Auth and credentialed CORS. Helmet, payload size limits,
DTO allowlisting, origin/CSRF checks, generic sign-in errors, and database rate limits protect the
HTTP boundary. The exception filter returns the stable error envelope without stack traces.

## Tokens and secrets

Bootstrap and invitation tokens are 256-bit random base64url strings. Only SHA-256 hashes are
stored. Tokens expire, are consumed atomically, and are never written to logs or audit metadata.
The raw value appears only in its one-time URL. Passwords and session tokens are likewise excluded
from application logs and audit entries.

Environment validation rejects missing/weak production secrets and enforces an exact public web
origin. Supported secret rotation accepts a current and optional previous Better Auth secret.

## Authorization and tenant isolation

Authentication and authorization are independent. Better Auth identifies the user; the central
access guard then requires an active membership in the path organization, a concrete permission,
and—on Location endpoints—the Location scope. Suspension is checked from PostgreSQL on every
request, so it invalidates organization access immediately without waiting for session expiry.

Every business query includes `organization_id`. Organization-owned mapping tables carry the same
key and use composite foreign keys. Foreign and nonexistent tenant resources both return 404. UI
visibility is convenience only; negative API tests prove backend enforcement.

Phase 3 adds separate read, write and archive permissions for Artists, Contacts and Business
Partners. The central guard resolves these concrete keys; role names never authorize a request.
These records are organization-wide, so Location scope is not applicable. Association foreign keys
repeat `organization_id`, preventing a Contact or owner from another tenant from being linked even
through direct database access.

Master-data audit writes share the mutation transaction. Metadata is deliberately allowlisted to
IDs, role IDs, previous versions and changed field names. Raw names, addresses, emails, telephone
numbers and notes are excluded.

## Dependency checks

`pnpm security:audit` blocks high/critical production advisories. `pnpm install --frozen-lockfile`
is the peer and lockfile consistency check. There are no accepted Phase 1 vulnerability exceptions.
Container image scanning remains a deployment-platform responsibility.
