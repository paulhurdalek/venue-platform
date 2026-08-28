import type { components } from '@venue/api-client';
import { notFound } from 'next/navigation';

import { EventForm } from '../../../../components/events/event-form';
import { EventStatusAction } from '../../../../components/events/event-status-action';
import { BookingLineupPanel } from '../../../../components/bookings/booking-lineup-panel';
import { CalculationPanel } from '../../../../components/services/format-calculation-panels';
import { RevenueWorkspace } from '../../../../components/revenue/revenue-planning-panel';
import { DealPanel } from '../../../../components/deals/deal-panel';
import {
  CompactEmpty,
  DetailField,
  DetailFields,
  DetailSection,
  DetailSections,
} from '../../../../components/master-data/detail-display';
import { EditableDetail } from '../../../../components/master-data/editable-detail';
import { Tabs } from '../../../../components/ui/compact-ui';
import { activePageMembership } from '../../../../../src/api/page-access';
import {
  ApiResponseError,
  hasPermission,
  serverApiClient,
  unwrap,
} from '../../../../../src/api/server';

type Event = components['schemas']['EventDto'];
type Calculation = components['schemas']['EventCalculationDto'];
type EventTab = 'overview' | 'deal' | 'bookings' | 'lineup' | 'calculation';

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId, eventId } = await params;
  const search = await searchParams;
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
  const canReadBookings = hasPermission(membership, 'bookings.read');
  const canWriteBookings = hasPermission(membership, 'bookings.write');
  const canReadArtists = hasPermission(membership, 'artists.read');
  const canCreateArtist = hasPermission(membership, 'artists.write');
  const canChangeBookingStatus = hasPermission(membership, 'bookings.status');
  const canFinanceBookings = hasPermission(membership, 'bookings.finance');
  const canWriteLineup = hasPermission(membership, 'lineup.write');
  const canReadDeals = hasPermission(membership, 'deals.read');
  const canWriteDeals = hasPermission(membership, 'deals.write');
  const canChangeDealStatus = hasPermission(membership, 'deals.status');
  const bookingData = canReadBookings
    ? await Promise.all([
        client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/bookings', {
          params: {
            path: { organizationId, eventId },
            query: { includeHistorical: false },
          },
        }),
        client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/booking-progress', {
          params: { path: { organizationId, eventId } },
        }),
        client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/lineup-requirements', {
          params: { path: { organizationId, eventId } },
        }),
        client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/program-items', {
          params: { path: { organizationId, eventId } },
        }),
        canWriteBookings && canReadArtists
          ? client.GET('/api/v1/organizations/{organizationId}/artists', {
              params: {
                path: { organizationId },
                query: { status: 'ACTIVE', limit: 25, offset: 0 },
              },
            })
          : Promise.resolve(undefined),
      ])
    : undefined;
  const canReadCalculation = hasPermission(membership, 'calculations.read');
  const canWriteCalculation = hasPermission(membership, 'calculations.write');
  const canSalesCalculation = hasPermission(membership, 'calculations.sales');
  const calculationData = canReadCalculation
    ? await Promise.all([
        client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/calculation', {
          params: { path: { organizationId, eventId } },
        }),
        hasPermission(membership, 'calculations.write') &&
        hasPermission(membership, 'services.read')
          ? client.GET('/api/v1/organizations/{organizationId}/services', {
              params: {
                path: { organizationId },
                query: { status: 'ACTIVE', limit: 100, offset: 0 },
              },
            })
          : Promise.resolve(undefined),
        hasPermission(membership, 'calculations.write') &&
        hasPermission(membership, 'business_partners.read')
          ? client.GET('/api/v1/organizations/{organizationId}/business-partners', {
              params: {
                path: { organizationId },
                query: { status: 'ACTIVE', limit: 100, offset: 0 },
              },
            })
          : Promise.resolve(undefined),
        canSalesCalculation
          ? client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/revenue-plan', {
              params: { path: { organizationId, eventId } },
            })
          : Promise.resolve(undefined),
        canWriteCalculation && hasPermission(membership, 'artists.read')
          ? client.GET('/api/v1/organizations/{organizationId}/artists', {
              params: {
                path: { organizationId },
                query: { status: 'ACTIVE', limit: 100, offset: 0 },
              },
            })
          : Promise.resolve(undefined),
        canWriteCalculation && hasPermission(membership, 'revenue_templates.read')
          ? client.GET('/api/v1/organizations/{organizationId}/revenue-templates/tax-rates', {
              params: { path: { organizationId }, query: { status: 'ACTIVE' } },
            })
          : Promise.resolve(undefined),
        canWriteCalculation && hasPermission(membership, 'revenue_templates.read')
          ? client.GET(
              '/api/v1/organizations/{organizationId}/revenue-templates/ticket-providers',
              {
                params: { path: { organizationId }, query: { status: 'ACTIVE' } },
              },
            )
          : Promise.resolve(undefined),
        canWriteCalculation && hasPermission(membership, 'revenue_templates.read')
          ? client.GET('/api/v1/organizations/{organizationId}/revenue-templates/calculations', {
              params: { path: { organizationId }, query: { status: 'ACTIVE' } },
            })
          : Promise.resolve(undefined),
      ])
    : undefined;
  let deal: components['schemas']['DealDto'] | undefined;
  if (canReadDeals) {
    try {
      deal = unwrap(
        await client.GET('/api/v1/organizations/{organizationId}/events/{eventId}/deal', {
          params: { path: { organizationId, eventId } },
        }),
      );
    } catch (error) {
      if (!(error instanceof ApiResponseError && error.status === 404)) throw error;
    }
  }
  const dealData =
    canReadDeals && canWriteDeals
      ? await Promise.all([
          hasPermission(membership, 'business_partners.read')
            ? client.GET('/api/v1/organizations/{organizationId}/business-partners', {
                params: {
                  path: { organizationId },
                  query: { status: 'ACTIVE', limit: 100, offset: 0 },
                },
              })
            : Promise.resolve(undefined),
          hasPermission(membership, 'services.read')
            ? client.GET('/api/v1/organizations/{organizationId}/services', {
                params: {
                  path: { organizationId },
                  query: { status: 'ACTIVE', limit: 100, offset: 0 },
                },
              })
            : Promise.resolve(undefined),
          hasPermission(membership, 'deal_templates.read')
            ? client.GET('/api/v1/organizations/{organizationId}/deal-templates', {
                params: { path: { organizationId }, query: { status: 'ACTIVE' } },
              })
            : Promise.resolve(undefined),
        ])
      : undefined;
  const bookings = bookingData ? unwrap(bookingData[0]) : [];
  const progress = bookingData ? unwrap(bookingData[1]) : undefined;
  const requirements = bookingData ? unwrap(bookingData[2]) : undefined;
  const programItems = bookingData ? unwrap(bookingData[3]) : [];
  const calculation = calculationData ? unwrap(calculationData[0]) : undefined;
  const availableTabs: EventTab[] = [
    'overview',
    ...(canReadDeals && event.eventKind === 'THIRD_PARTY_EVENT' ? (['deal'] as const) : []),
    ...(canReadBookings ? (['bookings', 'lineup'] as const) : []),
    ...(canReadCalculation ? (['calculation'] as const) : []),
    ...(canReadDeals && event.eventKind !== 'THIRD_PARTY_EVENT' ? (['deal'] as const) : []),
  ];
  const requestedTab = first(search.tab) as EventTab | undefined;
  const activeTab =
    requestedTab && availableTabs.includes(requestedTab) ? requestedTab : 'overview';
  const activeBookings = bookings.filter(
    (booking) => booking.status !== 'DECLINED' && booking.status !== 'CANCELLED',
  );
  const knownDuration = programItems.reduce(
    (total, item) => total + (item.durationMinutes ?? 0),
    0,
  );
  const eventHref = `/o/${organizationId}/events/${eventId}`;

  return (
    <>
      <EditableDetail
        afterHeader={
          <Tabs
            label="Veranstaltungsbereiche"
            tabs={availableTabs.map((tab) => ({
              id: tab,
              label: eventTabLabel(tab),
              href: `${eventHref}?tab=${tab}`,
              active: activeTab === tab,
            }))}
          />
        }
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
        summary={
          <div className="event-heading-summary">
            <span>{formatDate(event.eventDate)}</span>
            {event.doorsTime ? <span>Einlass {event.doorsTime}</span> : null}
            {event.startTime ? <span>Beginn {event.startTime}</span> : null}
            <span>{event.locationName}</span>
            {event.formatNameSnapshot ? <span>{event.formatNameSnapshot}</span> : null}
          </div>
        }
        title={event.name}
        updatedLabel={`Zuletzt geändert: ${new Date(event.updatedAt).toLocaleString('de-DE')}`}
        view={
          activeTab === 'overview' ? (
            <EventOverview
              bookingCount={activeBookings.length}
              {...(calculation ? { calculation } : {})}
              event={event}
              knownDuration={knownDuration}
            />
          ) : undefined
        }
      >
        {canWrite ? (
          <EventForm event={event} locations={locations} organizationId={organizationId} />
        ) : null}
      </EditableDetail>
      {bookingData &&
      progress &&
      requirements &&
      (activeTab === 'bookings' || activeTab === 'lineup') ? (
        <BookingLineupPanel
          artists={bookingData[4] ? unwrap(bookingData[4]).items : []}
          canCreateArtist={canCreateArtist}
          canEditArtist={canCreateArtist}
          canFinance={canFinanceBookings}
          canLineupWrite={canWriteLineup}
          canStatus={canChangeBookingStatus}
          canWrite={canWriteBookings}
          eventId={eventId}
          initialBookings={bookings}
          initialProgress={progress}
          initialProgramItems={programItems}
          initialRequirements={requirements}
          organizationId={organizationId}
          view={activeTab}
        />
      ) : null}
      {calculationData && calculation && activeTab === 'calculation' ? (
        calculationData[3] ? (
          <RevenueWorkspace
            artists={calculationData[4] ? unwrap(calculationData[4]).items : []}
            canWrite={canWriteCalculation}
            eventDate={event.eventDate}
            locationName={event.locationName}
            organizationId={organizationId}
            partners={calculationData[2] ? unwrap(calculationData[2]).items : []}
            plan={unwrap(calculationData[3])}
            taxRates={calculationData[5] ? unwrap(calculationData[5]) : []}
            providerTemplates={calculationData[6] ? unwrap(calculationData[6]) : []}
            calculationTemplates={calculationData[7] ? unwrap(calculationData[7]) : []}
          >
            <CalculationPanel
              approvalBlocked={unwrap(calculationData[3]).totals.incomplete}
              calculation={calculation}
              canApprove={hasPermission(membership, 'calculations.approve')}
              canPurchase={hasPermission(membership, 'calculations.purchase')}
              canSales={canSalesCalculation}
              canWrite={canWriteCalculation}
              embedded
              organizationId={organizationId}
              partners={calculationData[2] ? unwrap(calculationData[2]).items : []}
              services={calculationData[1] ? unwrap(calculationData[1]).items : []}
            />
          </RevenueWorkspace>
        ) : (
          <CalculationPanel
            calculation={calculation}
            canApprove={hasPermission(membership, 'calculations.approve')}
            canPurchase={hasPermission(membership, 'calculations.purchase')}
            canSales={canSalesCalculation}
            canWrite={canWriteCalculation}
            organizationId={organizationId}
            partners={calculationData[2] ? unwrap(calculationData[2]).items : []}
            services={calculationData[1] ? unwrap(calculationData[1]).items : []}
          />
        )
      ) : null}
      {canReadDeals && activeTab === 'deal' ? (
        <DealPanel
          canChangeStatus={canChangeDealStatus}
          canWrite={canWriteDeals}
          eventId={eventId}
          initialDeal={deal}
          organizationId={organizationId}
          partners={dealData?.[0] ? unwrap(dealData[0]).items : []}
          prominent={event.eventKind === 'THIRD_PARTY_EVENT'}
          services={dealData?.[1] ? unwrap(dealData[1]).items : []}
          templates={dealData?.[2] ? unwrap(dealData[2]) : []}
        />
      ) : null}
    </>
  );
}

function EventOverview({
  event,
  bookingCount,
  knownDuration,
  calculation,
}: {
  event: Event;
  bookingCount: number;
  knownDuration: number;
  calculation?: Calculation;
}) {
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
          <DetailField label="Eventstatus">{statusLabel(event.status)}</DetailField>
          <DetailField label="Bookings">{bookingCount}</DetailField>
          <DetailField label="Erwartete Gäste">
            {event.expectedGuestCount ?? 'Noch offen'}
          </DetailField>
          <DetailField label="Bekannte Gesamtdauer">
            {knownDuration ? `${knownDuration} Minuten` : 'Noch offen'}
          </DetailField>
          {calculation ? (
            <DetailField label="Kalkulation">
              {calculationStatusLabel(calculation.status)}
            </DetailField>
          ) : null}
          {event.sourceEventFormatVersion ? (
            <DetailField label="Quellversion">Version {event.sourceEventFormatVersion}</DetailField>
          ) : null}
          <DetailField label="Zeitzone">{event.timezone}</DetailField>
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
          {event.description ? (
            <DetailField label="Wichtige Hinweise" wide>
              <span className="pre-wrap">{event.description}</span>
            </DetailField>
          ) : null}
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

function calculationStatusLabel(status: Calculation['status']) {
  return { DRAFT: 'Entwurf', REVIEW: 'Zur Prüfung', APPROVED: 'Freigegeben' }[status];
}

function eventTabLabel(tab: EventTab) {
  return {
    overview: 'Übersicht',
    bookings: 'Bookings',
    lineup: 'Auftrittsplan',
    calculation: 'Kalkulation',
    deal: 'Vermietung & Deal',
  }[tab];
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
