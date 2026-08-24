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

Phase 4 adds `event_formats.read`, `event_formats.write` and `event_formats.archive`. EventFormats
are organization-wide, so no Location scope is evaluated. Every repository read and versioned
write repeats `organization_id`; foreign and unknown IDs remain indistinguishable 404 responses.
The normalized unique name includes `organization_id`, allowing the same name in another tenant
while preventing duplicates, including archived rows, inside one tenant.

Master-data audit writes share the mutation transaction. Metadata is deliberately allowlisted to
IDs, role IDs, previous versions and changed field names. Raw names, addresses, emails, telephone
numbers and notes are excluded.

EventFormat audit writes likewise share the mutation transaction. Their metadata contains only
record IDs through the audit target, old/new versions, old/new status and changed field names;
format names and descriptions are excluded.

Phase 5 adds `events.read`, `events.write` and `events.status`. The central guard resolves the
concrete permission and Event application use cases additionally constrain every read and mutation
to the membership's accessible Location IDs. A foreign, unknown or inaccessible Event, Location or
EventFormat ID never returns cross-tenant content. Event creation validates organization, Location,
Location access and the active source format inside one transaction before writing the Event and
audit entry.

Event audit metadata is allowlisted to versions, statuses, changed field names and source-format
technical IDs/version. Event names, descriptions and copied format free text are excluded. Status
correction is explicitly supported; cancellation and completion never delete historical events.

The refinement adds `date_options.read`, `date_options.write` and `date_options.convert`; the
availability endpoint requires the read key. Administrator, Management & Finances and Booking
receive all three, while Production and Read-only receive only read. The same central guard and
repository predicates apply membership Location scope to option lists, details, availability and
mutations. Partner/contact references are tenant-composite, and a supplied partner/contact pair
must be an existing association.

Occupancy conflict details are derived only after the requested Location has passed tenant and
membership-scope checks. They can therefore link an authorized user to a colliding Event or Option
without revealing an inaccessible tenant or Location. PostgreSQL advisory locks and an exclusion
constraint protect against request races; UI checks are never a security or consistency boundary.
Option audit metadata contains technical IDs, ranks, statuses and versions, not labels, notes,
partner names or Contact data. Release, expiry, promotion, conversion and unavailable transitions
preserve historical rows.

Batch creation uses the existing `date_options.write` permission and repeats Location-scope and
tenant checks for every requested option before any write. Shared partner/contact references are
validated once against the same organization. All option and audit writes share one transaction;
one invalid, duplicate or occupied entry rolls back the complete request. Conflict responses expose
only the affected Batch index/date/Location/rank and already-authorized occupancy targets, never
raw Prisma/PostgreSQL errors or foreign-tenant data. The request DTO accepts 1–50 nested entries.

Phase 6 adds `bookings.read`, `bookings.write`, `bookings.status`, `bookings.finance` and
`lineup.write`. Controllers authorize only these concrete keys (format-requirement reads retain
`event_formats.read`). Booking services additionally resolve the owning Event and apply its
Location scope to list, detail, mutation, progress, requirements and order operations. Tenant,
unknown and inaccessible IDs remain indistinguishable 404 responses.

Booking/Event/Artist and optional partner/Contact foreign keys repeat `organization_id`. New or
changed partner/Contact choices must be active and belong to the Artist's existing structured
relationships; an archived record already referenced by a historical Booking remains readable and
is marked archived. No Contact details are copied to Artist free text.

Finance authorization is a response and mutation boundary, not only a UI choice. Without
`bookings.finance`, fee and travel-cost fields are omitted by the server-side Booking and
requirement projection, and a write that attempts financial fields is rejected. Audit metadata is
allowlisted to technical IDs, versions, statuses, changed field names, order IDs and counts; it
does not contain internal notes, fees, travel/hotel text, Artist names or Contact data. Status
history stores only the explicit optional status note required by the business record.

Administrator, Management & Finances and Booking receive all five Phase-6 permissions. Production
and Read-only receive `bookings.read` only. Status changes, requirement replacement and Line-up
ordering remain separate permissions and all mutations use optimistic versions plus a single
transaction for state, history and audit.

## Dependency checks

`pnpm security:audit` blocks high/critical production advisories. `pnpm install --frozen-lockfile`
is the peer and lockfile consistency check. There are no accepted Phase 1 vulnerability exceptions.
Container image scanning remains a deployment-platform responsibility.
