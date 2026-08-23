import type { components } from '@venue/api-client';

import { EventFormatFilters } from '../../../components/event-formats/event-format-list-controls';
import { Pagination } from '../../../components/master-data/list-controls';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

type EventFormat = components['schemas']['EventFormatDto'];

export default async function EventFormatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/event-formats`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'event_formats.read')) return <Denied />;
  const search = await searchParams;
  const q = first(search.q);
  const status = entityStatus(first(search.status));
  const eventKind = kind(first(search.eventKind));
  const offset = nonNegative(first(search.offset));
  const client = await serverApiClient();
  const result = unwrap(
    await client.GET('/api/v1/organizations/{organizationId}/event-formats', {
      params: {
        path: { organizationId },
        query: {
          status,
          limit: 25,
          offset,
          ...(q ? { q } : {}),
          ...(eventKind ? { eventKind } : {}),
        },
      },
    }),
  );
  const canWrite = hasPermission(membership, 'event_formats.write');
  const filtered = Boolean(q || eventKind || status !== 'ACTIVE');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1>Veranstaltungsformate</h1>
          <p>Fachliche Vorlagen für die spätere Anlage konkreter Veranstaltungen.</p>
        </div>
        {canWrite ? (
          <a className="button" href={`/o/${organizationId}/event-formats/new`}>
            Veranstaltungsformat anlegen
          </a>
        ) : null}
      </header>
      <section className="panel">
        <EventFormatFilters eventKind={eventKind} q={q} status={status} />
        {result.items.length > 0 ? (
          <div className="table-wrap">
            <table className="master-data-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Veranstaltungsart</th>
                  <th>Standardzeiten</th>
                  <th>Aufzeichnung</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((format) => (
                  <tr key={format.id}>
                    <td data-label="Format">
                      <a
                        className="text-link"
                        href={`/o/${organizationId}/event-formats/${format.id}`}
                      >
                        {format.name}
                      </a>
                    </td>
                    <td data-label="Veranstaltungsart">{eventKindLabel(format.eventKind)}</td>
                    <td data-label="Standardzeiten">{timeSummary(format)}</td>
                    <td data-label="Aufzeichnung">{recordingLabel(format.recordingDefault)}</td>
                    <td data-label="Status">
                      <span className={`status-badge status-badge--${format.status.toLowerCase()}`}>
                        {format.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state event-format-empty">
            <div>
              <strong>
                {filtered
                  ? 'Keine Formate für die gewählten Filter gefunden.'
                  : 'Noch keine Veranstaltungsformate angelegt.'}
              </strong>
              <p>
                {filtered
                  ? 'Passen Sie Suche oder Filter an.'
                  : 'Legen Sie die erste fachliche Vorlage für spätere Veranstaltungen an.'}
              </p>
            </div>
            {!filtered && canWrite ? (
              <a className="button" href={`/o/${organizationId}/event-formats/new`}>
                Erstes Format anlegen
              </a>
            ) : null}
          </div>
        )}
        <Pagination
          basePath={`/o/${organizationId}/event-formats`}
          limit={result.limit}
          offset={result.offset}
          query={{ q, status, eventKind }}
          total={result.total}
        />
      </section>
    </>
  );
}

function timeSummary(format: EventFormat) {
  const primary = [
    format.defaultDoorsTime ? `Einlass ${format.defaultDoorsTime}` : null,
    format.defaultStartTime ? `Beginn ${format.defaultStartTime}` : null,
    format.defaultEndTime
      ? `Ende ${format.defaultEndTime}${format.defaultEndNextDay ? ' (+1 Tag)' : ''}`
      : null,
  ].filter(Boolean);
  const getIns = [
    format.defaultTechnicalGetInTime ? `Technik ${format.defaultTechnicalGetInTime}` : null,
    format.defaultArtistGetInTime ? `Artists ${format.defaultArtistGetInTime}` : null,
  ].filter(Boolean);
  if (primary.length === 0 && getIns.length === 0)
    return <span className="muted">Nicht belegt</span>;
  return (
    <div className="event-format-times">
      {primary.length > 0 ? <span>{primary.join(' · ')}</span> : null}
      {getIns.length > 0 ? <small>Get-in: {getIns.join(' · ')}</small> : null}
    </div>
  );
}

function eventKindLabel(eventKind: EventFormat['eventKind']) {
  return eventKind === 'OWN_PRODUCTION' ? 'Eigenproduktion' : 'Fremdveranstaltung / Vermietung';
}

function recordingLabel(recording: EventFormat['recordingDefault']) {
  if (recording === 'ENABLED') return 'Standardmäßig aktiv';
  if (recording === 'DISABLED') return 'Standardmäßig inaktiv';
  return 'Nicht vorgegeben';
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function entityStatus(input: string | undefined): 'ACTIVE' | 'ARCHIVED' | 'ALL' {
  return input === 'ARCHIVED' || input === 'ALL' ? input : 'ACTIVE';
}

function kind(input: string | undefined): EventFormat['eventKind'] | undefined {
  return input === 'OWN_PRODUCTION' || input === 'THIRD_PARTY_EVENT' ? input : undefined;
}

function nonNegative(input: string | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function Denied() {
  return (
    <section className="state-card">
      <p className="eyebrow">Nicht berechtigt</p>
      <h1>Veranstaltungsformate sind für Ihre Rolle nicht freigegeben.</h1>
    </section>
  );
}
