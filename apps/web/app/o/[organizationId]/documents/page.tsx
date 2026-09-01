import { DocumentList } from '../../../components/documents/document-list';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/documents`);
  if (!membership) return null;
  if (!hasPermission(membership, 'documents.read')) {
    return (
      <section className="state-card">
        <h1>Dokumente nicht verfügbar.</h1>
      </section>
    );
  }
  const type = one(query.type) as 'OFFER' | 'PRODUCTION_INFORMATION' | undefined;
  const status = one(query.status) as
    | 'ENTWURF'
    | 'ERSTELLT'
    | 'UEBERGEBEN'
    | 'ANGENOMMEN'
    | 'ABGELEHNT'
    | 'ABGELAUFEN'
    | 'FREIGEGEBEN'
    | 'ARCHIVIERT'
    | undefined;
  const eventId = one(query.eventId);
  const from = one(query.from);
  const to = one(query.to);
  const client = await serverApiClient();
  const queryValues = {
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(eventId ? { eventId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const [filteredResult, allResult] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/documents', {
      params: { path: { organizationId }, query: queryValues },
    }),
    client.GET('/api/v1/organizations/{organizationId}/documents', {
      params: { path: { organizationId }, query: {} },
    }),
  ]);
  const documents = unwrap(filteredResult);
  const events = [...new Map(unwrap(allResult).map((item) => [item.eventId, item])).values()].sort(
    (left, right) => left.eventName.localeCompare(right.eventName, 'de-DE'),
  );
  return (
    <section className="detail-panel document-page">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Ausgabe &amp; Archiv</p>
          <h1>Dokumente</h1>
          <p>Bearbeitbare Entwürfe und unveränderliche PDF-Versionen je Veranstaltung.</p>
        </div>
        {hasPermission(membership, 'document_templates.read') ? (
          <a className="button button--secondary" href={`/o/${organizationId}/document-templates`}>
            Vorlagen verwalten
          </a>
        ) : null}
      </header>
      {status === 'ARCHIVIERT' ? (
        <p className="compact-warning">
          Archivansicht: Archivierte Dokumente bleiben herunterladbar.
        </p>
      ) : null}
      <form className="document-filters" method="get">
        <label>
          Dokumenttyp
          <select defaultValue={type ?? ''} name="type">
            <option value="">Alle Typen</option>
            <option value="OFFER">Angebot</option>
            <option value="PRODUCTION_INFORMATION">Ablauf</option>
          </select>
        </label>
        <label>
          Status
          <select defaultValue={status ?? ''} name="status">
            <option value="">Alle Status</option>
            <option value="ENTWURF">Entwurf</option>
            <option value="ERSTELLT">Erstellt</option>
            <option value="UEBERGEBEN">Übergeben</option>
            <option value="ANGENOMMEN">Angenommen</option>
            <option value="ABGELEHNT">Abgelehnt</option>
            <option value="ABGELAUFEN">Abgelaufen</option>
            <option value="FREIGEGEBEN">Freigegeben</option>
            <option value="ARCHIVIERT">Archiviert</option>
          </select>
        </label>
        <label>
          Event
          <select defaultValue={eventId ?? ''} name="eventId">
            <option value="">Alle Events</option>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Von
          <input defaultValue={from ?? ''} name="from" type="date" />
        </label>
        <label>
          Bis
          <input defaultValue={to ?? ''} name="to" type="date" />
        </label>
        <div className="document-filters__actions">
          <button className="button button--small" type="submit">
            Filtern
          </button>
          {status === 'ARCHIVIERT' ? (
            <a
              className="button button--secondary button--small"
              href={`/o/${organizationId}/documents`}
            >
              Normale Liste
            </a>
          ) : (
            <a
              className="button button--secondary button--small"
              href={`/o/${organizationId}/documents?status=ARCHIVIERT`}
            >
              Archiv anzeigen
            </a>
          )}
          <a className="button button--quiet button--small" href={`/o/${organizationId}/documents`}>
            Zurücksetzen
          </a>
        </div>
      </form>
      <DocumentList
        canPublish={hasPermission(membership, 'documents.publish')}
        canWrite={hasPermission(membership, 'documents.write')}
        documents={documents}
        organizationId={organizationId}
      />
    </section>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
