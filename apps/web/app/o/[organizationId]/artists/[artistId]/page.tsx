import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';
import { ArtistForm } from '../../../../components/master-data/entity-forms';
import {
  ContactAssociationManager,
  LifecycleAction,
} from '../../../../components/master-data/entity-actions';

type Artist = components['schemas']['ArtistDto'];

export default async function ArtistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; artistId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId, artistId } = await params;
  const search = await searchParams;
  const contactSearch = first(search.contactQ);
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/artists/${artistId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'artists.read'))
    return (
      <section className="state-card">
        <h1>Artist nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  let artist;
  try {
    artist = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/artists/{artistId}', {
        params: { path: { organizationId, artistId } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const canWrite = hasPermission(membership, 'artists.write');
  const canArchive = hasPermission(membership, 'artists.archive');
  const [contacts, roles] = canWrite
    ? await Promise.all([
        client
          .GET('/api/v1/organizations/{organizationId}/contacts', {
            params: {
              path: { organizationId },
              query: {
                status: 'ACTIVE',
                limit: 100,
                offset: 0,
                ...(contactSearch ? { q: contactSearch } : {}),
              },
            },
          })
          .then(unwrap),
        client
          .GET('/api/v1/organizations/{organizationId}/contact-roles', {
            params: { path: { organizationId } },
          })
          .then(unwrap),
      ])
    : [{ items: [] }, []];
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Artist</p>
          <h1>
            {artist.stageName ?? [artist.firstName, artist.lastName].filter(Boolean).join(' ')}
          </h1>
          <p>Zuletzt geändert: {new Date(artist.updatedAt).toLocaleString('de-DE')}</p>
        </div>
        <div className="heading-badges">
          <span className={`status-badge status-badge--${artist.status.toLowerCase()}`}>
            {artist.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
          {artist.incomplete ? (
            <span className="status-badge status-badge--warning">Unvollständig</span>
          ) : null}
        </div>
      </header>
      <section className="panel">
        <div className="panel__heading">
          <div>
            <h2>Stammdaten</h2>
            <p>Artist-Daten bleiben von späteren Bookings getrennt.</p>
          </div>
        </div>
        {canWrite ? (
          <ArtistForm artist={artist} organizationId={organizationId} />
        ) : (
          <ArtistDetails artist={artist} />
        )}
      </section>
      <ContactAssociationManager
        associations={artist.contacts}
        canWrite={canWrite}
        contactSearch={contactSearch}
        contacts={contacts.items}
        organizationId={organizationId}
        owner={{ kind: 'artist', value: artist }}
        roles={roles}
      />
      {canArchive ? (
        <section className="panel danger-zone">
          <div>
            <h2>Lebenszyklus</h2>
            <p>Archivierte Artists bleiben in bestehenden Verknüpfungen sichtbar.</p>
          </div>
          <LifecycleAction
            entityId={artist.id}
            kind="artist"
            organizationId={organizationId}
            status={artist.status}
            version={artist.version}
          />
        </section>
      ) : null}
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ArtistDetails({ artist }: { artist: Artist }) {
  return (
    <dl className="detail-list">
      <div>
        <dt>Personenname</dt>
        <dd>
          {[artist.firstName, artist.lastName].filter(Boolean).join(' ') || 'Nicht angegeben'}
        </dd>
      </div>
      <div>
        <dt>E-Mail</dt>
        <dd>{artist.email ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Telefon</dt>
        <dd>{artist.phone ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Instagram</dt>
        <dd>{artist.instagram ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Website</dt>
        <dd>{artist.website ?? 'Nicht angegeben'}</dd>
      </div>
      <div>
        <dt>Notizen</dt>
        <dd>{artist.notes ?? 'Nicht angegeben'}</dd>
      </div>
    </dl>
  );
}
