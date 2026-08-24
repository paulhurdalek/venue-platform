import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { EventFormatForm } from '../../../../components/event-formats/event-format-form';
import { LineupRequirements } from '../../../../components/bookings/lineup-requirements';
import { FormatServicesPanel } from '../../../../components/services/format-calculation-panels';
import {
  CompactEmpty,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import { LifecycleAction } from '../../../../components/master-data/entity-actions';
import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';

type EventFormat = components['schemas']['EventFormatDto'];

export default async function EventFormatDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; eventFormatId: string }>;
}) {
  const { organizationId, eventFormatId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/event-formats/${eventFormatId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'event_formats.read')) {
    return (
      <section className="state-card">
        <h1>Veranstaltungsformat nicht verfügbar.</h1>
      </section>
    );
  }
  const client = await serverApiClient();
  let eventFormat;
  try {
    eventFormat = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}', {
        params: { path: { organizationId, eventFormatId } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const canWrite = hasPermission(membership, 'event_formats.write');
  const canArchive = hasPermission(membership, 'event_formats.archive');
  const canWriteLineup = hasPermission(membership, 'lineup.write');
  const canFinance = hasPermission(membership, 'bookings.finance');
  const lineupRequirements = unwrap(
    await client.GET(
      '/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}/lineup-requirements',
      { params: { path: { organizationId, eventFormatId } } },
    ),
  );
  const canReadServices = hasPermission(membership, 'services.read');
  const serviceData = canReadServices
    ? await Promise.all([
        client.GET(
          '/api/v1/organizations/{organizationId}/event-formats/{eventFormatId}/services',
          {
            params: { path: { organizationId, eventFormatId }, query: { includeArchived: true } },
          },
        ),
        client.GET('/api/v1/organizations/{organizationId}/services', {
          params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
        }),
      ])
    : undefined;
  return (
    <>
      <EditableDetail
        badges={
          <span className={`status-badge status-badge--${eventFormat.status.toLowerCase()}`}>
            {eventFormat.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
          </span>
        }
        canEdit={canWrite}
        editTitle="Veranstaltungsformat bearbeiten"
        eyebrow="Veranstaltungsformat"
        id="event-format-detail"
        sectionTitle="Formatvorlage"
        secondaryActions={
          canArchive ? (
            <LifecycleAction
              entityId={eventFormat.id}
              kind="event-format"
              organizationId={organizationId}
              status={eventFormat.status}
              version={eventFormat.version}
            />
          ) : null
        }
        title={eventFormat.name}
        updatedLabel={`Zuletzt geändert: ${new Date(eventFormat.updatedAt).toLocaleString('de-DE')}`}
        view={<EventFormatDetails eventFormat={eventFormat} />}
      >
        {canWrite ? (
          <EventFormatForm eventFormat={eventFormat} organizationId={organizationId} />
        ) : null}
      </EditableDetail>
      <section className="booking-panel event-format-lineup-panel">
        <LineupRequirements
          canFinance={canFinance}
          canWrite={canWriteLineup}
          initial={lineupRequirements}
          organizationId={organizationId}
          resourceId={eventFormatId}
          resourceType="event-format"
        />
      </section>
      {serviceData ? (
        <FormatServicesPanel
          canArchive={hasPermission(membership, 'services.archive')}
          canPurchase={hasPermission(membership, 'calculations.purchase')}
          canSales={hasPermission(membership, 'calculations.sales')}
          canWrite={hasPermission(membership, 'services.write')}
          eventFormatId={eventFormatId}
          initial={unwrap(serviceData[0])}
          organizationId={organizationId}
          services={unwrap(serviceData[1]).items}
        />
      ) : null}
    </>
  );
}

function EventFormatDetails({ eventFormat }: { eventFormat: EventFormat }) {
  const hasTimes = Boolean(
    eventFormat.defaultTechnicalGetInTime ||
    eventFormat.defaultArtistGetInTime ||
    eventFormat.defaultDoorsTime ||
    eventFormat.defaultStartTime ||
    eventFormat.defaultEndTime,
  );
  return (
    <DetailSections>
      <DetailSection title="Grunddaten">
        <DetailFields>
          <DetailField label="Veranstaltungsart" wide>
            {eventFormat.eventKind === 'OWN_PRODUCTION'
              ? 'Eigenproduktion'
              : 'Fremdveranstaltung / Vermietung'}
          </DetailField>
          {eventFormat.description ? (
            <DetailField label="Beschreibung" wide>
              <span className="pre-wrap">{eventFormat.description}</span>
            </DetailField>
          ) : null}
        </DetailFields>
      </DetailSection>
      <DetailSection title="Standardzeiten">
        {hasTimes ? (
          <DetailFields>
            {eventFormat.defaultTechnicalGetInTime ? (
              <DetailField label="Get-in Technik">
                {eventFormat.defaultTechnicalGetInTime}
              </DetailField>
            ) : null}
            {eventFormat.defaultArtistGetInTime ? (
              <DetailField label="Get-in Artists">{eventFormat.defaultArtistGetInTime}</DetailField>
            ) : null}
            {eventFormat.defaultDoorsTime ? (
              <DetailField label="Einlass">{eventFormat.defaultDoorsTime}</DetailField>
            ) : null}
            {eventFormat.defaultStartTime ? (
              <DetailField label="Beginn">{eventFormat.defaultStartTime}</DetailField>
            ) : null}
            {eventFormat.defaultEndTime ? (
              <DetailField label="Ende">
                {eventFormat.defaultEndTime}
                {eventFormat.defaultEndNextDay ? ' (+1 Tag)' : ''}
              </DetailField>
            ) : null}
          </DetailFields>
        ) : (
          <CompactEmpty>Keine Standardzeiten hinterlegt.</CompactEmpty>
        )}
      </DetailSection>
      <DetailSection title="Standardoptionen" wide>
        <DetailFields>
          <DetailField label="Aufzeichnung">
            {recordingLabel(eventFormat.recordingDefault)}
          </DetailField>
        </DetailFields>
      </DetailSection>
    </DetailSections>
  );
}

function recordingLabel(recording: EventFormat['recordingDefault']) {
  if (recording === 'ENABLED') return 'Standardmäßig aktiv';
  if (recording === 'DISABLED') return 'Standardmäßig inaktiv';
  return 'Nicht vorgegeben';
}
