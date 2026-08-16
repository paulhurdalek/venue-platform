# Phase 3: Artists, contacts and business partners

Phase 3 adds the first organization-owned business module. Artists and later bookings are separate
objects. Contacts and Artists are not user accounts.

## Domain model

| Aggregate or relation    | Responsibility and important rules                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Artist`                 | Organization-owned identity and contact master data. A stage name or at least one person-name part is required. |
| `Contact`                | Reusable organization-owned person. First or last name is required; contact channels remain optional.           |
| `ArtistContact`          | Normalized Artist–Contact assignment with its own optimistic version.                                           |
| `ContactRole`            | Fixed global dictionary used on each Artist/partner contact assignment; an assignment has one or more roles.    |
| `BusinessPartner`        | Organization-owned company with optional postal/billing/contact details; company name is required.              |
| `BusinessPartnerRole`    | Fixed global partner-role dictionary. A partner may hold multiple roles through a normalized assignment.        |
| `BusinessPartnerContact` | Reuses a central Contact for a partner and owns one or more contact roles.                                      |

Artists support stage/person name, postal address, email, phone, Instagram, website and internal
notes. Contacts support person name, label, email, phone, mobile and notes. Business partners
support company name, postal and optional billing address, VAT ID, email, phone, website and notes.

`incomplete` is a response projection, never persisted. A Contact is incomplete without email,
phone and mobile. An Artist is incomplete without email, phone or Instagram and without an active,
reachable linked Contact. This keeps completeness consistent after Contact updates or archival.

## Tenant, lifecycle and concurrency rules

- Every mutable business record and association carries `organization_id`.
- Composite foreign keys prevent associations from crossing organization boundaries.
- Repository reads and writes always include the organization ID. Foreign and unknown IDs return
  the same 404 response.
- Master data is organization-wide; Location scope is deliberately not evaluated.
- Artists, Contacts and business partners use `ACTIVE`/`ARCHIVED`, `archived_at`, and a positive
  optimistic `version`. There is no delete endpoint for these records.
- Standard lists contain active records. `status=ARCHIVED` or `status=ALL` makes archived records
  discoverable. Existing assignments remain visible after archival.
- Assignments cannot be newly created while either endpoint is archived. Assignment removals and
  role changes use the assignment version.

## Dictionaries

Contact assignment roles: Management, Booking, Agentur, Technik, persönlicher Kontakt and
sonstiger Ansprechpartner.

Business partner roles: Kunde, Veranstalter, Partner, Agentur, Technikdienstleister, Security,
Catering and sonstiger Dienstleister.

Both dictionaries use stable keys and normalized join rows. They are deliberately not a generic
user-configurable taxonomy in Phase 3.

## Permission matrix

| Standard role         | Artists              | Contacts             | Business partners    |
| --------------------- | -------------------- | -------------------- | -------------------- |
| Administrator         | read, write, archive | read, write, archive | read, write, archive |
| Management & Finanzen | read                 | read, write, archive | read, write, archive |
| Booking               | read, write, archive | read, write, archive | read                 |
| Produktion            | read                 | read                 | read                 |
| Lesend                | read                 | read                 | read                 |

The stable keys are `artists.*`, `contacts.*`, and `business_partners.*`, each with `read`, `write`
and `archive`. The migration backfills existing standard roles; setup creates the same assignments
for future organizations. The central access guard remains the security boundary.

## REST API

All paths are below `/api/v1/organizations/{organizationId}`.

| Method and path                                                             | Purpose                                 |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `GET/POST /artists`                                                         | Search/filter/page or create Artists    |
| `GET/PATCH /artists/{artistId}`                                             | Read or update an Artist                |
| `PATCH /artists/{artistId}/status`                                          | Archive or reactivate                   |
| `POST /artists/{artistId}/contacts`                                         | Link a reusable Contact with roles      |
| `DELETE /artists/{artistId}/contacts/{associationId}`                       | Remove only the assignment              |
| `PUT /artists/{artistId}/contacts/{associationId}/roles`                    | Replace assignment roles                |
| `GET/POST /contacts`                                                        | Search/filter/page or create Contacts   |
| `GET/PATCH /contacts/{contactId}`                                           | Read or update a Contact and its usages |
| `PATCH /contacts/{contactId}/status`                                        | Archive or reactivate                   |
| `GET/POST /business-partners`                                               | Search/filter/page or create partners   |
| `GET/PATCH /business-partners/{businessPartnerId}`                          | Read or update a partner                |
| `PATCH /business-partners/{businessPartnerId}/status`                       | Archive or reactivate                   |
| `PUT /business-partners/{businessPartnerId}/roles`                          | Replace partner roles                   |
| `POST /business-partners/{businessPartnerId}/contacts`                      | Link a Contact with roles               |
| `DELETE /business-partners/{businessPartnerId}/contacts/{associationId}`    | Remove only the assignment              |
| `PUT /business-partners/{businessPartnerId}/contacts/{associationId}/roles` | Replace assignment roles                |
| `GET /contact-roles`                                                        | Read the Contact-role dictionary        |
| `GET /business-partner-roles`                                               | Read the partner-role dictionary        |

List queries support bounded `limit`/`offset`, stable ordering, text and status filters. Artist and
Contact lists support `incomplete`; partner lists support `roleKey`.

## Application and UI

`apps/api/src/master-data` follows the four layers from `docs/module-rules.md`: presentation DTOs
and controller, application use cases and port, pure domain completeness/identity rules, and a
Prisma infrastructure adapter. Controllers and React components contain no domain decisions.

The German web UI provides permission-aware overview cards and navigation, searchable lists,
create/detail/edit pages, completeness and lifecycle states, central Contact usage, partner and
assignment role editing, assignment linking/removal, confirmations, empty/loading/not-found and
API error states. Hiding write controls is only a usability measure; every operation is checked by
the API.

## Audit and privacy

The small shared `AuditWriter` appends audit rows inside the same transaction as each mutation.
Creation, changes, archive/reactivation, links/unlinks, assignment role changes and partner-role
changes are covered. Metadata contains only IDs, versions, role IDs and changed field names—never
addresses, notes, phone numbers, email addresses or other raw master data.

## Out of scope

Phase 3 adds no events, calendars, bookings, line-ups, fees, travel/hotel costs, services, price
lists, calculations, tickets, revenues, deal/rental models, documents, contracts, invoices, rooms,
email delivery, integrations, EAV, plugins or generic master-data frameworks.
