import type { components } from '@venue/api-client';

import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';
import { ContactChannels } from '../../../components/master-data/detail-display';
import { MasterDataFilters, Pagination } from '../../../components/master-data/list-controls';

type Artist = components['schemas']['ArtistDto'];
type Representation = components['schemas']['ArtistBusinessPartnerAssociationDto'];
type Representative = components['schemas']['ArtistRepresentativeDto'];

export default async function ArtistsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/artists`);
  if (!membership) return null;
  if (!hasPermission(membership, 'artists.read')) return <Denied title="Artists" />;
  const search = await searchParams;
  const q = value(search.q);
  const status = entityStatus(value(search.status));
  const incomplete = value(search.incomplete) === 'true';
  const offset = nonNegative(value(search.offset));
  const client = await serverApiClient();
  const result = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/artists', {
      params: {
        path: { organizationId },
        query: {
          status,
          limit: 25,
          offset,
          ...(q ? { q } : {}),
          ...(incomplete ? { incomplete: true } : {}),
        },
      },
    }),
  );
  const canWrite = hasPermission(membership, 'artists.write');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Stammdaten</p>
          <h1>Artists</h1>
          <p>Zentrale Artist-Stammdaten, unabhängig von späteren Bookings.</p>
        </div>
        {canWrite ? (
          <a className="button" href={`/o/${organizationId}/artists/new`}>
            Artist anlegen
          </a>
        ) : null}
      </header>
      <section className="panel">
        <MasterDataFilters incomplete={incomplete} q={q} status={status} />
        <div className="table-wrap">
          <table className="master-data-table">
            <thead>
              <tr>
                <th>Artist</th>
                <th>Management &amp; Booking</th>
                <th>Kontakt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((artist) => {
                const representation = primaryRepresentation(artist);
                const representative = representation
                  ? primaryRepresentative(representation)
                  : undefined;
                const contact = representative?.contact ?? artist;
                return (
                  <tr key={artist.id}>
                    <td data-label="Artist">
                      <a className="text-link" href={`/o/${organizationId}/artists/${artist.id}`}>
                        {artistName(artist)}
                      </a>
                    </td>
                    <td data-label="Management & Booking">
                      {representation ? (
                        <div className="list-association">
                          <a
                            className="text-link"
                            href={`/o/${organizationId}/business-partners/${representation.businessPartner.id}`}
                          >
                            {representation.businessPartner.companyName}
                          </a>
                          {representative ? (
                            <a href={`/o/${organizationId}/contacts/${representative.contact.id}`}>
                              {contactName(representative.contact)}
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="muted">Keine Vertretung</span>
                      )}
                    </td>
                    <td data-label="Kontakt">
                      <ContactChannels contact={contact} compact emptyMessage="Keine Kontaktwege" />
                    </td>
                    <td data-label="Status">
                      <div className="list-statuses">
                        <span
                          className={`status-badge status-badge--${artist.status.toLowerCase()}`}
                        >
                          {artist.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                        </span>
                        {artist.incomplete ? (
                          <span className="status-badge status-badge--warning">Unvollständig</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={4}>Keine Artists für die gewählten Filter gefunden.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`/o/${organizationId}/artists`}
          limit={result.limit}
          offset={result.offset}
          query={{ q, status, incomplete: incomplete ? 'true' : undefined }}
          total={result.total}
        />
      </section>
    </>
  );
}

function artistName(artist: Artist) {
  return (
    artist.stageName ?? ([artist.firstName, artist.lastName].filter(Boolean).join(' ') || 'Artist')
  );
}

function contactName(contact: Representative['contact']) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Kontakt';
}

function primaryRepresentation(artist: Artist): Representation | undefined {
  return (
    artist.businessPartners.find((representation) =>
      representation.representatives.some((representative) => representative.isPrimary),
    ) ?? artist.businessPartners[0]
  );
}

function primaryRepresentative(representation: Representation): Representative | undefined {
  return (
    representation.representatives.find((representative) => representative.isPrimary) ??
    representation.representatives[0]
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function entityStatus(input: string | undefined): 'ACTIVE' | 'ARCHIVED' | 'ALL' {
  return input === 'ARCHIVED' || input === 'ALL' ? input : 'ACTIVE';
}

function nonNegative(input: string | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function Denied({ title }: { title: string }) {
  return (
    <section className="state-card">
      <p className="eyebrow">Nicht berechtigt</p>
      <h1>{title} sind für Ihre Rolle nicht freigegeben.</h1>
    </section>
  );
}
