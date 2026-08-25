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
import { ArtistRepresentationManager } from '../../../../components/master-data/artist-representations';
import {
  CompactEmpty,
  ContactChannels,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
  formatAddress,
  SafeWebLink,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
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
  const canCreateContacts = hasPermission(membership, 'contacts.write');
  const canManagePartnerContacts =
    canCreateContacts && hasPermission(membership, 'business_partners.write');
  const canArchive = hasPermission(membership, 'artists.archive');
  const [contacts, contactRoles, partners, businessPartnerRoles] = canWrite
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
        client
          .GET('/api/v1/organizations/{organizationId}/business-partners', {
            params: {
              path: { organizationId },
              query: { status: 'ALL', limit: 100, offset: 0 },
            },
          })
          .then(unwrap),
        client
          .GET('/api/v1/organizations/{organizationId}/business-partner-roles', {
            params: { path: { organizationId } },
          })
          .then(unwrap),
      ])
    : [{ items: [] }, [], { items: [] }, []];
  return (
    <>
      <EditableDetail
        badges={
          <span className="heading-badges__group">
            <span className={`status-badge status-badge--${artist.status.toLowerCase()}`}>
              {artist.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
            </span>
            {artist.incomplete ? (
              <span className="status-badge status-badge--warning">Unvollständig</span>
            ) : null}
          </span>
        }
        canEdit={canWrite}
        editTitle="Artist bearbeiten"
        eyebrow="Artist"
        id="artist-detail"
        priorityContent={
          <ArtistRepresentationManager
            artist={artist}
            businessPartnerRoles={businessPartnerRoles}
            canWrite={canWrite}
            canCreateContacts={canCreateContacts}
            canManagePartnerContacts={canManagePartnerContacts}
            contactRoles={contactRoles}
            organizationId={organizationId}
            partners={partners.items}
          />
        }
        sectionTitle="Artist-Stammdaten"
        secondaryActions={
          canArchive ? (
            <LifecycleAction
              entityId={artist.id}
              kind="artist"
              organizationId={organizationId}
              status={artist.status}
              version={artist.version}
            />
          ) : null
        }
        summary={artist.stageName ? personName(artist) : undefined}
        title={artistName(artist)}
        updatedLabel={`Zuletzt geändert: ${new Date(artist.updatedAt).toLocaleString('de-DE')}`}
        view={<ArtistDetails artist={artist} />}
      >
        {canWrite ? <ArtistForm artist={artist} organizationId={organizationId} /> : null}
      </EditableDetail>
      <ContactAssociationManager
        associations={artist.contacts}
        canWrite={canWrite}
        canCreateContacts={canCreateContacts}
        blockedContactIds={artist.businessPartners.flatMap(({ representatives }) =>
          representatives.map(({ contact }) => contact.id),
        )}
        contactSearch={contactSearch}
        contacts={contacts.items}
        organizationId={organizationId}
        owner={{ kind: 'artist', value: artist }}
        roles={contactRoles}
      />
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ArtistDetails({ artist }: { artist: Artist }) {
  const name = personName(artist);
  const address = formatAddress(artist);
  const hasProfile = Boolean(name || artist.instagram || artist.website);
  const hasContact = Boolean(artist.email || artist.phone);
  const hasInternal = Boolean(address || artist.notes);
  if (!hasProfile && !hasContact && !hasInternal) {
    return <CompactEmpty>Keine weiteren Artist-Stammdaten hinterlegt.</CompactEmpty>;
  }
  return (
    <DetailSections>
      {hasProfile ? (
        <DetailSection title="Profil">
          <DetailFields>
            {name ? <DetailField label="Personenname">{name}</DetailField> : null}
            {artist.instagram ? (
              <DetailField label="Instagram">{artist.instagram}</DetailField>
            ) : null}
            {artist.website ? (
              <DetailField label="Website">
                <SafeWebLink href={artist.website} />
              </DetailField>
            ) : null}
          </DetailFields>
        </DetailSection>
      ) : null}
      {hasContact ? (
        <DetailSection title="Direkter Kontakt">
          <ContactChannels contact={artist} emptyMessage={null} />
        </DetailSection>
      ) : null}
      {hasInternal ? (
        <DetailSection title="Weitere Angaben" wide>
          <DetailFields>
            {address ? <DetailField label="Anschrift">{address}</DetailField> : null}
            {artist.notes ? (
              <DetailField label="Interne Notizen" wide>
                <span className="pre-wrap">{artist.notes}</span>
              </DetailField>
            ) : null}
          </DetailFields>
        </DetailSection>
      ) : null}
    </DetailSections>
  );
}

function artistName(artist: Artist): string {
  return artist.stageName ?? personName(artist) ?? 'Unbenannter Artist';
}

function personName(artist: Artist): string | undefined {
  return [artist.firstName, artist.lastName].filter(Boolean).join(' ') || undefined;
}
