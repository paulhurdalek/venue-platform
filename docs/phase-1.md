# Phase 1 operations and behavior

## First installation

After applying migrations and starting PostgreSQL, create one setup URL from the repository root:

```bash
pnpm bootstrap:create
```

The command takes no password arguments. It stores only a token hash, writes a safe
`bootstrap.created` audit entry, and prints the raw URL once. A database advisory lock prevents
concurrent installations. It refuses to run if an unexpired setup token already exists or an
active administrator already belongs to an active organization.

Open the URL before `BOOTSTRAP_TOKEN_TTL_SECONDS` expires. `/setup` collects administrator name,
email, password/confirmation, organization name, Location name, and an IANA timezone. One
transaction uses Better Auth's supported server API to create the user, then creates the
organization, Location, permission catalog, five roles, active administrator membership, audit
entries, and token consumption. A failure rolls everything back. The administrator then signs in
at `/sign-in`; setup never creates a browser session implicitly.

## Authentication and session flow

The browser calls Better Auth under same-origin `/api/auth/*`; Next rewrites this path to the Nest
API. Successful email/password sign-in creates an opaque PostgreSQL session and HTTP-only cookie.
`GET /api/v1/session` returns the user and live organization memberships. Sign-out revokes the
current session and clears its cookie. Public `sign-up/email` remains disabled server-side.

No password-reset email, email verification UI, social login, 2FA, passkeys, or account-management
screen is part of Phase 1.

## Roles and permissions

Every organization receives these data-backed roles:

| Role                  | Phase 1 permissions            |
| --------------------- | ------------------------------ |
| Administrator         | all 12 Phase 1 permissions     |
| Management & Finanzen | organization and Location read |
| Booking               | organization and Location read |
| Produktion            | organization and Location read |
| Lesend                | organization and Location read |

Stable keys are `organization.read`, `organization.edit`, `location.read`, `location.edit`,
`memberships.read`, `invitations.create`, `invitations.revoke`, `memberships.status`,
`memberships.roles`, `memberships.location_access`, `roles.read`, and `audit.read`. Role names are
never inspected by controllers or normal authorization logic. The only technical administrator-key
check protects the invariant that an organization retains one active administrator.

## Invitations

An administrator opens `/o/{organizationId}/settings/team`, enters a normalized email, roles, and
either `ALL` or explicit Location access. The API returns the raw invitation URL only in that
creation response; the UI can copy it, but sends no email. The database stores only its hash.

At `/accept-invitation`, expired, revoked, used, and invalid links show distinct German states. A
new user supplies a name and password; the API creates the account through Better Auth. An existing
user must sign in with exactly the invited email. Acceptance is transactionally single-use and
does not create duplicate `(organization_id, user_id)` memberships. The same identity can join
multiple organizations with different roles.

## Web routes

- `/setup` — one-time setup URL only;
- `/sign-in` — email/password sign-in, no registration;
- `/accept-invitation` — validate and accept an invitation token;
- `/organizations` — selector when more than one active membership exists;
- `/o/{organizationId}` — protected Phase 1 shell without fabricated dashboard data;
- `/o/{organizationId}/settings/organization` — organization master data;
- `/o/{organizationId}/settings/location` — the first Location's master data;
- `/o/{organizationId}/settings/team` — members, invitations, roles, Location scopes, and audit.

The data model supports multiple Locations, but Phase 1 deliberately exposes no multi-Location
creation or navigation UI and no rooms.

## REST surface

Business endpoints remain under `/api/v1`: session; organizations; organization details; Location
list/detail; members/status/roles/Location scope; roles; invitations/list/create/revoke; public
invitation validation/acceptance; and audit. Setup validation/completion also lives under
`/api/v1/setup/bootstrap`. Better Auth keeps its own supported response format under `/api/auth/*`.
OpenAPI JSON and `@venue/api-client` are regenerated with `pnpm api:generate`; web code imports
generated schemas instead of copying DTOs.

## Tenant and Location isolation

An organization path ID is never trusted. The central guard requires a live Better Auth session,
active membership in that exact organization, concrete permission, and Location access. Services
filter every read/write by organization. PostgreSQL composite foreign keys give join tables the
same protection. Selected Location scope with zero links means no Locations and can never be
misread as all. Foreign IDs reveal no tenant existence and return the same 404 as unknown IDs.
