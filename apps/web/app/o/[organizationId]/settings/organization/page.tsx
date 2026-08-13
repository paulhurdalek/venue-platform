import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';
import { OrganizationForm } from './organization-form';

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/o/${organizationId}/settings/organization`;
  const membership = await activePageMembership(organizationId, returnPath);
  if (!membership) return null;
  const client = await serverApiClient();
  const organization = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}', {
      params: { path: { organizationId } },
    }),
  );
  const canEdit = hasPermission(membership, 'organization.edit');

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Einstellungen</p>
          <h1>Organisation</h1>
          <p>Grundlegende Namen und Kontaktdaten des Mandanten.</p>
        </div>
        <span className={`status-badge status-badge--${organization.status.toLowerCase()}`}>
          {organization.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
        </span>
      </header>
      <section className="panel">
        <div className="panel__heading">
          <div>
            <h2>Stammdaten</h2>
            <p>Zuletzt geändert: {new Date(organization.updatedAt).toLocaleString('de-DE')}</p>
          </div>
        </div>
        {canEdit ? (
          <OrganizationForm organization={organization} />
        ) : (
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{organization.name}</dd>
            </div>
            <div>
              <dt>Rechtlicher Name</dt>
              <dd>{organization.legalName ?? 'Nicht angegeben'}</dd>
            </div>
            <div>
              <dt>E-Mail</dt>
              <dd>{organization.email ?? 'Nicht angegeben'}</dd>
            </div>
            <div>
              <dt>Telefon</dt>
              <dd>{organization.phone ?? 'Nicht angegeben'}</dd>
            </div>
          </dl>
        )}
      </section>
      {!canEdit ? (
        <p className="permission-note">
          Sie besitzen Leserechte. Änderungen sind für Ihre Rolle nicht freigegeben.
        </p>
      ) : null}
    </>
  );
}
