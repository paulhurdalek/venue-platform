import { DateOptionForm } from '../../../../../components/events/date-option-form';
import { activePageMembership } from '../../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../../src/api/server';

export default async function NewDateOptionPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/events/options/new`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'date_options.write'))
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Terminoptionen anlegen.</h1>
      </section>
    );
  const client = await serverApiClient();
  const [locationsResult, partnersResult, contactsResult] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/locations', {
      params: { path: { organizationId } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/business-partners', {
      params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/contacts', {
      params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
    }),
  ]);
  const locations = unwrap(locationsResult).filter(({ status }) => status === 'ACTIVE');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Veranstaltungen</p>
          <h1>Terminoption anlegen</h1>
          <p>
            Der Rang wird anhand der aktuellen Belegung automatisch und konkurrenzsicher vergeben.
          </p>
        </div>
      </header>
      {locations.length === 0 ? (
        <section className="state-card">
          <h2>Keine aktive zugängliche Location vorhanden.</h2>
        </section>
      ) : (
        <section className="panel">
          <DateOptionForm
            contacts={unwrap(contactsResult).items}
            locations={locations}
            organizationId={organizationId}
            partners={unwrap(partnersResult).items}
          />
        </section>
      )}
    </>
  );
}
