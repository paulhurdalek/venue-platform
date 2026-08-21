# Phase 3: Artists, contacts and business partners

Phase 3 adds the first organization-owned business module. Artists and later bookings are separate
objects. Contacts and Artists are not user accounts.

## Domain model

| Aggregate or relation              | Responsibility and important rules                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Artist`                           | Organization-owned identity and contact master data. A stage name or at least one person-name part is required. |
| `Contact`                          | Reusable organization-owned person. First or last name is required; contact channels remain optional.           |
| `ArtistContact`                    | Normalized Artist–Contact assignment with its own optimistic version.                                           |
| `ContactRole`                      | Fixed global dictionary used on each Artist/partner contact assignment; an assignment has one or more roles.    |
| `BusinessPartner`                  | Organization-owned company with optional postal/billing/contact details; company name is required.              |
| `BusinessPartnerRole`              | Fixed global partner-role dictionary. A partner may hold multiple roles through a normalized assignment.        |
| `BusinessPartnerContact`           | Reuses a central Contact for a partner and owns one or more contact roles.                                      |
| `ArtistBusinessPartner`            | Explicit organization-owned Artist–company representation with its own optimistic version and company roles.    |
| `ArtistBusinessPartnerRole`        | Normalized company roles for this Artist, using the existing `BusinessPartnerRole` dictionary.                  |
| `ArtistBusinessPartnerContact`     | Selects a specific existing `BusinessPartnerContact` as representative, optionally primary and versioned.       |
| `ArtistBusinessPartnerContactRole` | Normalized Artist-specific duties of that representative, using the existing `ContactRole` dictionary.          |

Artists support stage/person name, postal address, email, phone, Instagram, website and internal
notes. Contacts support person name, label, email, phone, mobile and notes. Business partners
support company name, postal and optional billing address, VAT ID, email, phone, website and notes.

`incomplete` is a response projection, never persisted. A Contact is incomplete without email,
phone and mobile. An Artist is incomplete without email, phone or Instagram and without an active,
reachable direct Contact or company representative. This keeps completeness consistent after
Contact updates or archival.

An Artist's company representation is never inferred from coincidental shared Contacts. One
`ArtistBusinessPartner` names the company explicitly and carries one or more normalized company
roles. It has one or more representatives. Each representative points to the exact existing
`BusinessPartnerContact` row, so the selected person must already belong to that company. Multiple
companies per Artist and multiple representatives per company are supported. A partial unique
index permits at most one primary representative per company representation.

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
- Composite three-column foreign keys on company representatives bind the Artist-company link and
  source `BusinessPartnerContact` to the same organization and company. The source company-contact
  assignment cannot be removed while it is selected as an Artist representative.
- Every company representation requires at least one company role and one representative. Every
  representative requires at least one Contact role. The last representative can only be removed
  by intentionally removing the complete company representation; master records are never deleted.
- For one Artist, a Contact may be either a direct Contact or a representative through a company,
  but never both. New conflicting assignments return HTTP 409 with the stable code
  `ARTIST_CONTACT_ASSIGNMENT_CONFLICT`. Existing historical conflicts remain visible and can be
  resolved by removing either assignment; they are never migrated or deleted automatically.

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

| Method and path                                                                            | Purpose                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `GET/POST /artists`                                                                        | Search/filter/page or create Artists             |
| `GET/PATCH /artists/{artistId}`                                                            | Read or update an Artist                         |
| `PATCH /artists/{artistId}/status`                                                         | Archive or reactivate                            |
| `POST /artists/{artistId}/contacts`                                                        | Link a reusable Contact with roles               |
| `POST /artists/{artistId}/contacts/inline`                                                 | Atomically create and link a direct Contact      |
| `DELETE /artists/{artistId}/contacts/{associationId}`                                      | Remove only the assignment                       |
| `PUT /artists/{artistId}/contacts/{associationId}/roles`                                   | Replace assignment roles                         |
| `POST /artists/{artistId}/business-partners`                                               | Link a company, roles and representatives        |
| `POST /artists/{artistId}/business-partners/inline-contact`                                | Atomically link company and new/existing Contact |
| `PUT /artists/{artistId}/business-partners/{associationId}/roles`                          | Replace Artist-specific company roles            |
| `DELETE /artists/{artistId}/business-partners/{associationId}`                             | Remove the complete representation only          |
| `POST /artists/{artistId}/business-partners/{associationId}/contacts`                      | Add a selected partner Contact                   |
| `POST /artists/{artistId}/business-partners/{associationId}/contacts/inline`               | Atomically create/attach another representative  |
| `PUT /artists/{artistId}/business-partners/{associationId}/contacts/{representativeId}`    | Replace duties/primary flag with version         |
| `DELETE /artists/{artistId}/business-partners/{associationId}/contacts/{representativeId}` | Remove one representative when another remains   |
| `GET/POST /contacts`                                                                       | Search/filter/page or create Contacts            |
| `POST /contacts/matches`                                                                   | Tenant-safe normalized duplicate candidates      |
| `GET/PATCH /contacts/{contactId}`                                                          | Read or update a Contact and its usages          |
| `PATCH /contacts/{contactId}/status`                                                       | Archive or reactivate                            |
| `GET/POST /business-partners`                                                              | Search/filter/page or create partners            |
| `GET/PATCH /business-partners/{businessPartnerId}`                                         | Read or update a partner                         |
| `PATCH /business-partners/{businessPartnerId}/status`                                      | Archive or reactivate                            |
| `PUT /business-partners/{businessPartnerId}/roles`                                         | Replace partner roles                            |
| `POST /business-partners/{businessPartnerId}/contacts`                                     | Link a Contact with roles                        |
| `POST /business-partners/{businessPartnerId}/contacts/inline`                              | Atomically create and link a company Contact     |
| `DELETE /business-partners/{businessPartnerId}/contacts/{associationId}`                   | Remove only the assignment                       |
| `PUT /business-partners/{businessPartnerId}/contacts/{associationId}/roles`                | Replace assignment roles                         |
| `GET /contact-roles`                                                                       | Read the Contact-role dictionary                 |
| `GET /business-partner-roles`                                                              | Read the partner-role dictionary                 |

List queries support bounded `limit`/`offset`, stable ordering, text and status filters. Artist and
Contact lists support `incomplete`; partner lists support `roleKey`.

## Application and UI

`apps/api/src/master-data` follows the four layers from `docs/module-rules.md`: presentation DTOs
and controller, application use cases and port, pure domain completeness/identity rules, and a
Prisma infrastructure adapter. Controllers and React components contain no domain decisions.

The German web UI provides permission-aware overview cards and navigation, searchable lists,
compact read-only detail pages, explicit editing, completeness and lifecycle states, central
Contact usage, partner and assignment role editing, assignment linking/removal, confirmations,
empty/loading/not-found and API error states. Existing records show only populated fields grouped
into semantic information sections. Authorized users reveal the existing form with `Bearbeiten`;
cancel discards the draft and a successful save refreshes the server data before returning to read
mode. Organization and Location follow the same pattern, while create and search forms remain
immediately available.

On Artist, Contact and Business Partner details, the status badge and primary `Bearbeiten` action
remain in the heading. Authorized users reach archive/reactivation through the shared, quiet
`Weitere Aktionen` menu instead of a permanent danger-zone panel. The keyboard-operable menu uses
explicit ARIA menu state, closes with Escape and restores focus. A modal confirmation explains that
archival retains existing assignments, prevents new assignments and can later be reversed. Status,
menu action and an accessible success message update after the existing versioned status endpoint
returns successfully. Users without the entity's `*.archive` permission do not receive the menu;
the API guard remains authoritative.

The Artist detail is the primary working view. `Agenturen & Firmenvertretungen` shows explicit
companies, Artist-specific company roles, all selected representatives, their Artist-specific
duties, primary status and direct links to company and Contact records. `Direkte Kontakte ohne
Firmenvertretung` clearly separates people assigned without a company. E-mail, telephone and mobile
values remain visible as `mailto:` and `tel:` links. Historical mixed-assignment conflicts receive
a visible warning and retain both unlink controls.

All three working contexts can create central Contacts inline: a direct Artist Contact, a company
Contact, or a representative inside an Artist-company relationship. Each use case stores Contact,
normalized assignments, roles and audits in one Prisma transaction. The UI also lets users reuse
an existing Contact. Before creation, a tenant-safe match compares normalized e-mail addresses,
phone/mobile numbers and complete names. Strong channel matches must be reused; a name-only match
may be consciously confirmed as a different person. No global unique constraint or new Contact
type is introduced. Inline controls require both the relationship owner's write permission and
`contacts.write`; workflows that may create a company-contact assignment additionally require
`business_partners.write`.

## Audit and privacy

The small shared `AuditWriter` appends audit rows inside the same transaction as each mutation.
Creation, changes, archive/reactivation, links/unlinks, assignment role changes, partner-role
changes, company representations and representative changes are covered. Metadata contains only
IDs, versions, role IDs, primary flags and changed field names—never addresses, notes, phone
numbers, email addresses or other raw master data.

## Out of scope

Phase 3 adds no events, calendars, bookings, line-ups, fees, travel/hotel costs, services, price
lists, calculations, tickets, revenues, deal/rental models, documents, contracts, invoices, rooms,
email delivery, integrations, EAV, plugins or generic master-data frameworks.
