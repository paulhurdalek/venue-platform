import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';
import { MasterDataFilters, Pagination } from '../../../components/master-data/list-controls';

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
          <table>
            <thead>
              <tr>
                <th>Artist</th>
                <th>Kontakt</th>
                <th>Vollständigkeit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((artist) => (
                <tr key={artist.id}>
                  <td>
                    <a className="text-link" href={`/o/${organizationId}/artists/${artist.id}`}>
                      {artistName(artist)}
                    </a>
                  </td>
                  <td>
                    {artist.email ?? artist.phone ?? artist.instagram ?? 'Über Kontaktperson'}
                  </td>
                  <td>
                    {artist.incomplete ? (
                      <span className="status-badge status-badge--warning">Unvollständig</span>
                    ) : (
                      <span className="status-badge status-badge--active">Erreichbar</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge status-badge--${artist.status.toLowerCase()}`}>
                      {artist.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                    </span>
                  </td>
                </tr>
              ))}
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

function artistName(artist: {
  stageName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  return artist.stageName ?? [artist.firstName, artist.lastName].filter(Boolean).join(' ');
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
