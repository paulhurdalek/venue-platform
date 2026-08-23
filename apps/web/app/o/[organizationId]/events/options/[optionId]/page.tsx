import type { components } from '@venue/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DateOptionActions } from '../../../../../components/events/date-option-actions';
import { DateOptionForm } from '../../../../../components/events/date-option-form';
import {
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../../components/master-data/editable-detail';
import { activePageMembership } from '../../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../../src/api/server';

type DateOption = components['schemas']['DateOptionDto'];

export default async function DateOptionDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; optionId: string }>;
}) {
  const { organizationId, optionId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/events/options/${optionId}`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'date_options.read'))
    return (
      <section className="state-card">
        <h1>Terminoption nicht verfügbar.</h1>
      </section>
    );
  const client = await serverApiClient();
  let option: DateOption;
  try {
    option = unwrap(
      await client.GET('/api/v1/organizations/{organizationId}/date-options/{optionId}', {
        params: { path: { organizationId, optionId } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) notFound();
    throw error;
  }
  const canWrite = hasPermission(membership, 'date_options.write') && option.status === 'ACTIVE';
  const canConvert =
    hasPermission(membership, 'date_options.convert') && option.status === 'ACTIVE';
  const [locations, partners, contacts] = canWrite
    ? await Promise.all([
        client
          .GET('/api/v1/organizations/{organizationId}/locations', {
            params: { path: { organizationId } },
          })
          .then(unwrap),
        client
          .GET('/api/v1/organizations/{organizationId}/business-partners', {
            params: { path: { organizationId }, query: { status: 'ALL', limit: 100, offset: 0 } },
          })
          .then(unwrap),
        client
          .GET('/api/v1/organizations/{organizationId}/contacts', {
            params: { path: { organizationId }, query: { status: 'ALL', limit: 100, offset: 0 } },
          })
          .then(unwrap),
      ])
    : [[], { items: [] }, { items: [] }];
  return (
    <EditableDetail
      badges={
        <>
          <span className={`option-badge option-badge--${option.rank.toLowerCase()}`}>
            {option.rank === 'FIRST' ? '1. Option' : '2. Option'}
          </span>
          <span className="status-badge">{statusLabel(option.status)}</span>
        </>
      }
      canEdit={canWrite}
      editTitle="Terminoption bearbeiten"
      eyebrow="Terminoption"
      id="date-option-detail"
      sectionTitle="Optionsdaten"
      secondaryActions={
        option.status === 'ACTIVE' ? (
          <div className="option-actions">
            {canWrite ? (
              <DateOptionActions
                canPromote={option.canPromote}
                optionId={option.id}
                organizationId={organizationId}
                version={option.version}
              />
            ) : null}
            {canConvert ? (
              <Link
                className="button button--secondary"
                href={`/o/${organizationId}/events/options/${option.id}/convert`}
              >
                In Veranstaltung umwandeln
              </Link>
            ) : null}
          </div>
        ) : null
      }
      summary={`${formatDate(option.optionDate)} · ${option.locationName}`}
      title={option.label}
      updatedLabel={`Zuletzt geändert: ${new Date(option.updatedAt).toLocaleString('de-DE')}`}
      view={<OptionDetails option={option} />}
    >
      {canWrite ? (
        <DateOptionForm
          contacts={contacts.items}
          locations={locations.filter(({ status }) => status === 'ACTIVE' || status === undefined)}
          option={option}
          organizationId={organizationId}
          partners={partners.items}
        />
      ) : null}
    </EditableDetail>
  );
}

function OptionDetails({ option }: { option: DateOption }) {
  return (
    <DetailSections>
      <DetailSection title="Kerninformationen">
        <DetailFields>
          <DetailField label="Rang">
            {option.rank === 'FIRST' ? '1. Option' : '2. Option'}
          </DetailField>
          <DetailField label="Datum">{formatDate(option.optionDate)}</DetailField>
          <DetailField label="Zeitraum">
            {option.occupancyStartTime}–{option.occupancyEndTime}
            {option.occupancyEndNextDay ? ' (+1 Tag)' : ''}
          </DetailField>
          <DetailField label="Location">{option.locationName}</DetailField>
          <DetailField label="Gültig bis">
            {new Date(option.validUntil).toLocaleString('de-DE')}
          </DetailField>
          <DetailField label="Status">{statusLabel(option.status)}</DetailField>
          {option.businessPartnerName ? (
            <DetailField label="Geschäftspartner">{option.businessPartnerName}</DetailField>
          ) : null}
          {option.contactName ? (
            <DetailField label="Ansprechpartner">{option.contactName}</DetailField>
          ) : null}
          {option.note ? (
            <DetailField label="Interne Notiz" wide>
              <span className="pre-wrap">{option.note}</span>
            </DetailField>
          ) : null}
          {option.canPromote ? (
            <DetailField label="Priorität" wide>
              Kann zur 1. Option hochgestuft werden
            </DetailField>
          ) : null}
          {option.status === 'UNAVAILABLE' ? (
            <DetailField label="Verfügbarkeit" wide>
              Termin nicht mehr verfügbar
            </DetailField>
          ) : null}
        </DetailFields>
      </DetailSection>
    </DetailSections>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
function statusLabel(status: DateOption['status']) {
  return {
    ACTIVE: 'Aktiv',
    CONVERTED: 'Umgewandelt',
    RELEASED: 'Freigegeben',
    EXPIRED: 'Abgelaufen',
    UNAVAILABLE: 'Termin nicht mehr verfügbar',
  }[status];
}
