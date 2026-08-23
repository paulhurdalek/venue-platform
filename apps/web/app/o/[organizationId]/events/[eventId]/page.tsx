import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { EventForm } from '../../../../components/events/event-form';
import { EventStatusAction } from '../../../../components/events/event-status-action';
import {
  CompactEmpty,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';

type Event = components['schemas']['EventDto'];

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; eventId: string }>;
}) {
  const { organizationId, eventId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/events/${eventId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'events.read')) {
    return (
      <section className="state-card">
        <h1>Veranstaltung nicht verfügbar.</h1>
      </section>
    );
  }
  const client = await serverApiClient();
  let event;
  try {
    event = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/events/{eventId}', {
        params: { path: { organizationId, eventId } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const locationResult = await client.GET('/api/v1/organizations/{organizationId}/locations', {
    params: { path: { organizationId } },
  });
  const locations = unwrap(locationResult).filter(
    (location) => location.status === 'ACTIVE' || location.id === event.locationId,
  );
  const canWrite = hasPermission(membership, 'events.write');
  const canChangeStatus = hasPermission(membership, 'events.status');

  return (
    <EditableDetail
      badges={
        <span className={`status-badge status-badge--event-${event.status.toLowerCase()}`}>
          {statusLabel(event.status)}
        </span>
      }
      canEdit={canWrite}
      editTitle="Veranstaltung bearbeiten"
      eyebrow="Veranstaltung"
      id="event-detail"
      sectionTitle="Veranstaltungsdaten"
      secondaryActions={
        canChangeStatus ? (
          <EventStatusAction
            eventId={event.id}
            organizationId={organizationId}
            status={event.status}
            version={event.version}
          />
        ) : null
      }
      summary={`${formatDate(event.eventDate)} · ${event.locationName}`}
      title={event.name}
      updatedLabel={`Zuletzt geändert: ${new Date(event.updatedAt).toLocaleString('de-DE')}`}
      view={<EventDetails event={event} />}
    >
      {canWrite ? (
        <EventForm event={event} locations={locations} organizationId={organizationId} />
      ) : null}
    </EditableDetail>
  );
}

function EventDetails({ event }: { event: Event }) {
  const hasTimes = Boolean(
    event.technicalGetInTime ||
    event.artistGetInTime ||
    event.doorsTime ||
    event.startTime ||
    event.endTime,
  );
  return (
    <DetailSections>
      <DetailSection title="Kerninformationen">
        <DetailFields>
          <DetailField label="Datum">{formatDate(event.eventDate)}</DetailField>
          <DetailField label="Location">{event.locationName}</DetailField>
          <DetailField label="Format-Snapshot">
            {event.formatNameSnapshot ?? 'Ohne Vorlage'}
          </DetailField>
          <DetailField label="Veranstaltungsart">{kindLabel(event.eventKind)}</DetailField>
          {event.sourceEventFormatVersion ? (
            <DetailField label="Quellversion">Version {event.sourceEventFormatVersion}</DetailField>
          ) : null}
          <DetailField label="Zeitzone">{event.timezone}</DetailField>
          {event.description ? (
            <DetailField label="Beschreibung" wide>
              <span className="pre-wrap">{event.description}</span>
            </DetailField>
          ) : null}
        </DetailFields>
      </DetailSection>
      <DetailSection title="Lokale Zeiten">
        {!event.occupancyComplete ? (
          <p className="compact-warning">
            Zeiten unvollständig – Konfliktprüfung nur eingeschränkt möglich
          </p>
        ) : null}
        {hasTimes ? (
          <DetailFields>
            <OptionalTime label="Get-in Technik" value={event.technicalGetInTime ?? null} />
            <OptionalTime label="Get-in Artists" value={event.artistGetInTime ?? null} />
            <OptionalTime label="Einlass" value={event.doorsTime ?? null} />
            <OptionalTime label="Beginn" value={event.startTime ?? null} />
            <OptionalTime
              label="Ende"
              value={
                event.endTime ? `${event.endTime}${event.endNextDay ? ' (+1 Tag)' : ''}` : null
              }
            />
          </DetailFields>
        ) : (
          <CompactEmpty>Keine Zeiten hinterlegt.</CompactEmpty>
        )}
      </DetailSection>
      <DetailSection title="Aufzeichnung" wide>
        <DetailFields>
          <DetailField label="Einstellung">{recordingLabel(event.recordingSetting)}</DetailField>
        </DetailFields>
      </DetailSection>
    </DetailSections>
  );
}

function OptionalTime({ label, value }: { label: string; value: string | null }) {
  return value ? <DetailField label={label}>{value}</DetailField> : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function kindLabel(kind: Event['eventKind']) {
  return kind === 'OWN_PRODUCTION' ? 'Eigenproduktion' : 'Fremdveranstaltung / Vermietung';
}

function recordingLabel(value: Event['recordingSetting']) {
  if (value === 'ENABLED') return 'Aktiv';
  if (value === 'DISABLED') return 'Inaktiv';
  return 'Nicht vorgegeben';
}

function statusLabel(status: Event['status']) {
  return {
    DRAFT: 'Entwurf',
    PLANNED: 'Geplant',
    CONFIRMED: 'Bestätigt',
    COMPLETED: 'Durchgeführt',
    CANCELLED: 'Abgesagt',
  }[status];
}
