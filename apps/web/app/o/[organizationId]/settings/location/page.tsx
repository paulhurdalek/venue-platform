import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import { LocationForm } from './location-form';

export default async function LocationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/o/${organizationId}/settings/location`;
  const membership = await activePageMembership(organizationId, returnPath);
  if (!membership) return null;
  const client = await serverApiClient();
  const locations = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/locations', {
      params: { path: { organizationId } },
    }),
  );
  const location = locations[0];
  const canEdit = hasPermission(membership, 'location.edit');

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Einstellungen</p>
          <h1>Location</h1>
          <p>Stammdaten der in Phase 1 verwalteten Location.</p>
        </div>
        {location ? (
          <span className={`status-badge status-badge--${location.status.toLowerCase()}`}>
            {location.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
        ) : null}
      </header>
      {location ? (
        <section className="panel">
          <div className="panel__heading">
            <div>
              <h2>{location.name}</h2>
              <p>Zuletzt geändert: {new Date(location.updatedAt).toLocaleString('de-DE')}</p>
            </div>
          </div>
          {canEdit ? (
            <LocationForm location={location} />
          ) : (
            <dl className="detail-list">
              <div>
                <dt>Name</dt>
                <dd>{location.name}</dd>
              </div>
              <div>
                <dt>Zeitzone</dt>
                <dd>{location.timezone}</dd>
              </div>
              <div>
                <dt>Kapazität</dt>
                <dd>{location.capacity ?? 'Nicht angegeben'}</dd>
              </div>
              <div>
                <dt>Anschrift</dt>
                <dd>{formatAddress(location)}</dd>
              </div>
              <div>
                <dt>E-Mail</dt>
                <dd>{location.contactEmail ?? 'Nicht angegeben'}</dd>
              </div>
              <div>
                <dt>Telefon</dt>
                <dd>{location.contactPhone ?? 'Nicht angegeben'}</dd>
              </div>
            </dl>
          )}
        </section>
      ) : (
        <section className="state-card">
          <h2>Keine Location verfügbar</h2>
          <p>Die Organisation besitzt derzeit keine aktive Phase-1-Location.</p>
        </section>
      )}
      {!canEdit && location ? (
        <p className="permission-note">
          Sie besitzen Leserechte. Änderungen sind für Ihre Rolle nicht freigegeben.
        </p>
      ) : null}
    </>
  );
}

function formatAddress(location: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
}) {
  const cityLine = [location.postalCode, location.city].filter(Boolean).join(' ');
  return (
    [location.addressLine1, location.addressLine2, cityLine, location.state, location.countryCode]
      .filter(Boolean)
      .join(', ') || 'Nicht angegeben'
  );
}
