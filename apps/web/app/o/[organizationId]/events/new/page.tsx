import { EventForm } from '../../../../components/events/event-form';
import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/events/new`);
  if (!membership) return null;
  if (!hasPermission(membership, 'events.write')) {
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Veranstaltungen anlegen.</h1>
      </section>
    );
  }
  const client = await serverApiClient();
  const [formatResult, locationResult, calculationTemplateResult] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/event-formats', {
      params: {
        path: { organizationId },
        query: { status: 'ACTIVE', limit: 100, offset: 0 },
      },
    }),
    client.GET('/api/v1/organizations/{organizationId}/locations', {
      params: { path: { organizationId } },
    }),
    hasPermission(membership, 'revenue_templates.read')
      ? client.GET('/api/v1/organizations/{organizationId}/revenue-templates/calculations', {
          params: { path: { organizationId }, query: { status: 'ACTIVE' } },
        })
      : Promise.resolve(undefined),
  ]);
  const eventFormats = unwrap(formatResult).items;
  const locations = unwrap(locationResult).filter((location) => location.status === 'ACTIVE');
  const search = await searchParams;
  const dateValue = first(search.date);
  const initialDate = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : undefined;

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Veranstaltungen</p>
          <h1>Veranstaltung anlegen</h1>
          <p>Legen Sie die Veranstaltung mit einer Vorlage oder vollständig frei an.</p>
        </div>
      </header>
      {locations.length === 0 ? (
        <section className="state-card">
          <h2>Die Veranstaltung kann noch nicht angelegt werden.</h2>
          <p>Es ist keine zugängliche aktive Location verfügbar.</p>
        </section>
      ) : (
        <section className="panel">
          <EventForm
            calculationTemplates={
              calculationTemplateResult ? unwrap(calculationTemplateResult) : []
            }
            eventFormats={eventFormats}
            initialDate={initialDate}
            locations={locations}
            organizationId={organizationId}
          />
        </section>
      )}
    </>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
