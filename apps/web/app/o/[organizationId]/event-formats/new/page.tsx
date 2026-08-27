import { EventFormatForm } from '../../../../components/event-formats/event-format-form';
import { activePageMembership } from '../../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../../src/api/server';

export default async function NewEventFormatPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/event-formats/new`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'event_formats.write')) {
    return (
      <section className="state-card">
        <h1>Sie dürfen keine Veranstaltungsformate anlegen.</h1>
      </section>
    );
  }
  const calculationTemplates = hasPermission(membership, 'revenue_templates.read')
    ? unwrap(
        await (
          await serverApiClient()
        ).GET('/api/v1/organizations/{organizationId}/revenue-templates/calculations', {
          params: { path: { organizationId }, query: { status: 'ACTIVE' } },
        }),
      )
    : [];
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Veranstaltungsformate</p>
          <h1>Veranstaltungsformat anlegen</h1>
          <p>
            Definieren Sie eine konkrete fachliche Vorlage ohne spätere Veranstaltungen
            vorwegzunehmen.
          </p>
        </div>
      </header>
      <section className="panel">
        <EventFormatForm
          calculationTemplates={calculationTemplates}
          organizationId={organizationId}
        />
      </section>
    </>
  );
}
