# Database and migration conventions

PostgreSQL is the system of record. Prisma Migrate is the only schema-change path. Automated and
production environments run only `prisma migrate deploy`; `prisma db push` and Better Auth runtime
schema generation are forbidden.

## Phase 1 migration

`20260813000200_phase_1_auth_org` is applied after the unchanged Phase 0 migration. It creates:

- Better Auth user, account, session, verification, and database rate-limit tables;
- bootstrap tokens, organizations, locations, memberships, permissions, and roles;
- organization-keyed role, membership, Location, and invitation mapping tables;
- invitations and append-only audit records;
- UUID defaults, unique keys, tenant-aware indexes, check constraints, restrictive business
  foreign keys, and an audit update/delete prevention trigger.

All new IDs use PostgreSQL `gen_random_uuid()`. Better Auth is configured with its supported
`advanced.database.generateId: "uuid"` option so runtime-created identity rows follow the same
convention. Business associations do not cascade on delete. Composite foreign keys prevent a role,
membership, Location, or invitation mapping from crossing its `organization_id` boundary.

Mutable organization, Location, and membership rows have positive integer versions. Updates use
`WHERE id = ? AND organization_id = ? AND version = ?` and atomically increment the version; zero
updated rows become HTTP 409.

## Phase 3 migration

`20260816000100_phase_3_master_data` is additive and leaves both Phase 0 and Phase 1 migrations
unchanged. It creates Artist, Contact and Business Partner tables; normalized Contact assignments;
Contact-role and partner-role dictionaries; normalized partner-role assignments; checks for
identity, country codes, lifecycle consistency and positive versions; and tenant-aware indexes and
composite foreign keys.

The migration seeds only non-personal fixed dictionaries and nine stable permission definitions.
It backfills the Phase-3 matrix for every existing organization-local standard role with
conflict-safe inserts. `SetupService` uses the same source matrix when a future organization is
created. No example Artist, Contact or partner rows are seeded.

Artist, Contact and Business Partner updates use the same optimistic `WHERE id + organization_id +
version` pattern. Role-bearing Contact associations also have versions. Business entities use
restrictive foreign keys and are archived rather than deleted.

## Phase 4 migration

`20260822000100_phase_4_event_formats` is additive on the merged Phase-3 schema. It creates the
organization-owned `event_format` table, the two-value `EventKind` and three-value
`RecordingDefault` enums, a tenant-scoped unique normalized name, lifecycle/version checks and
stable list/search indexes. Local time defaults use nullable integer columns. Get-ins, doors and
start are constrained to `0..1439`; end is constrained to `0..2879` for a next-day end. SQL checks
also enforce known start-relative ordering without inferring an order from missing optional values.

The migration adds the three stable `event_formats.*` permissions and backfills all existing
organization-local standard roles with conflict-safe inserts. Setup uses the same application
catalog for future organizations. No example format, event, snapshot or generic template row is
seeded.

## Workflow

1. Change `packages/database/prisma/schema.prisma`.
2. Generate a migration against the Phase 0 development state.
3. Review and, where required, add PostgreSQL checks and indexes.
4. Run `pnpm db:migrate:deploy` on a fresh isolated PostgreSQL database.
5. Run `pnpm test:db` and `pnpm test:integration` with `TEST_DATABASE_URL`.
6. Commit schema and migration together; never edit a migration after deployment.

## Phase 5 migration

`20260823000100_phase_5_events` is the additive Phase-5 base migration. It creates the relational
`event` table plus `EventStatus` and `EventSnapshotSource`. An Event stores organization, Location,
local `DATE`, copied EventFormat provenance and values, local minute schedule, recording setting,
timezone snapshot, lifecycle timestamps and a positive optimistic version. This migration has
already been deployed and is not amended by the Phase-5 refinement.

Composite tenant foreign keys protect Location and source EventFormat references. Restrictive
delete behavior preserves historical events. SQL checks mirror the Phase-4 local-minute ranges and
known start-relative order, distinguish next-day ends through `0..2879`, and keep completion/
cancellation timestamps consistent with a correctable global status. Calendar, Location, status,
format and kind indexes all begin with `organization_id` and include stable date/ID ordering.

The migration adds `events.read`, `events.write` and `events.status`, and conflict-safely backfills
the standard-role matrix. Setup uses the same application catalog for newly created organizations.
No example event or format is seeded, and test cleanup continues to preserve the global permission
catalog.

`20260823000200_phase_5_occupancy_options` is a strictly additive follow-up. It makes the five
EventFormat provenance columns consistently nullable for free Events, adds the format-description
snapshot and enforces the all-present/all-absent source contract. It creates `venue_date_option`,
the `VenueDateOptionRank`/`VenueDateOptionStatus` enums and tenant-composite foreign keys to Location,
membership and optional master data. Options are versioned and statused rather than deleted.

The same migration creates `location_occupancy`. Complete non-cancelled Events receive one row for
each of the `FIRST` and `SECOND` slots; an active option receives only its rank's row. PostgreSQL's
`btree_gist` extension and `location_occupancy_no_overlap` exclusion constraint combine
`organization_id`, `location_id`, slot and a half-open local `tsrange`. Application transactions
also acquire sorted organization/Location advisory locks, making rank selection and multi-row Event
reservation safe under concurrency. Existing complete, non-cancelled Events are backfilled without
altering or deleting Event rows; incomplete Events deliberately remain manual-review cases.

The follow-up inserts `date_options.read`, `date_options.write` and `date_options.convert` with
conflict-safe catalog updates and backfills the five standard roles. `SetupService` consumes the same
permission constants for future organizations. No example Option, dummy EventFormat or persisted
availability result is created.

The later Phase-5 batch-option and contrast refinement changes no schema. It reuses ordinary
`venue_date_option` rows, the existing audit log, sorted Location locks and the exclusion
constraint in one transaction. Because `20260823000200_phase_5_occupancy_options` had already been
applied, it remains byte-for-byte unchanged and no additional migration is required.

## Phase 6 migration

`20260823000300_phase_6_booking_lineup` is strictly additive and leaves every Phase-0 through
Phase-5 migration unchanged. It creates the `LineupRole` (`ARTIST`, `MODERATOR`, `OTHER`) and
`BookingStatus` (`SHORTLISTED`, `REQUESTED`, `OPTION`, `CONFIRMED`, `DECLINED`, `CANCELLED`) enums
and four organization-owned tables:

- `event_format_lineup_requirement` stores the active relational template positions, counts,
  order and optional Minor-Unit default fee;
- `event_lineup_requirement` stores the independently editable Event snapshot plus optional source
  requirement ID/version;
- `booking` links exactly one Event and Artist and owns role, status, order, performance data,
  company/Contact references, agreements, finance fields, hotel data and optimistic version;
- `booking_status_history` stores each explicit transition with previous/new status, actor
  membership/user, timestamp and optional note.

UUID defaults, tenant-composite foreign keys and restrictive deletes preserve organization
isolation and history. Checks enforce positive counts, order and versions, bounded performance
minutes, non-empty custom labels and paired non-negative `BIGINT` Minor Units with uppercase
three-letter currencies. A null amount and null currency represent the valid “no fee” state.

Partial unique indexes protect only the active (`SHORTLISTED`, `REQUESTED`, `OPTION`, `CONFIRMED`)
Line-up: an Artist cannot have the same active role twice in one Event and each active order is
unique. Declined/cancelled history therefore remains stored without blocking a later new request.
Requirement replacement archives prior rows and creates a new active set; it never cascades away
historical Bookings.

The migration inserts the five stable permissions `bookings.read`, `bookings.write`,
`bookings.status`, `bookings.finance` and `lineup.write` and conflict-safely backfills every
organization's standard roles. Setup uses the same catalog for future organizations. Existing
Artists, formats and Events are left untouched, receive no invented requirements and need no
backfill rows. No example or dummy business data is inserted.

`20260824000100_phase_6_booking_performances` is the strictly additive Phase-6 follow-up. It leaves
the deployed `20260823000300_phase_6_booking_lineup` and every earlier migration unchanged. The
migration adds:

- `HotelArrangement` with `NONE`, `REQUIRED` and `BUYOUT`, paired optional `BIGINT`/ISO-currency
  Buy-out columns and a lossless `hotel_required → hotel_arrangement` data mapping;
- `ProgramItemKind` with `PERFORMANCE` and `BREAK` plus the organization-owned, versioned
  `event_program_item` table;
- composite Event and Booking foreign keys that enforce organization and Event consistency at the
  database boundary;
- positive order, duration and version checks plus tenant-first Event/Booking indexes.

Every existing Booking is backfilled into exactly one `PERFORMANCE` item. `ROW_NUMBER()` preserves
the old per-Event `lineup_order` ordering, and the old performance duration plus original creation/
update timestamps are copied. The previous Booking columns and `hotel_required` remain in place as
deprecated compatibility data; nothing is dropped or rewritten destructively.

The obsolete `booking_active_artist_role_key` is removed because a user may explicitly confirm two
active Bookings of the same Artist, even with the same role. Duplicate prevention is now a
transactional application invariant: creation acquires the existing per-Event lock, checks every
active role for the Artist and requires an explicit confirmation flag. The new composite unique
Booking key exists only to support the tenant-and-Event-safe program-item foreign key.
