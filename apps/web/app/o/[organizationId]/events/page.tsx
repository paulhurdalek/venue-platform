import type { components } from '@venue/api-client';
import Link from 'next/link';

import { EventFilters } from '../../../components/events/event-list-controls';
import { FreeDatesPanel } from '../../../components/events/free-dates-panel';
import { Pagination } from '../../../components/master-data/list-controls';
import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';

type Event = components['schemas']['EventDto'];
type EventStatus = Event['status'];
type EventKind = Event['eventKind'];
type DateOption = components['schemas']['DateOptionDto'];
type BusinessPartner = components['schemas']['BusinessPartnerDto'];
type Contact = components['schemas']['ContactDto'];

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/events`);
  if (!membership) return null;
  if (!hasPermission(membership, 'events.read')) return <Denied />;

  const search = await searchParams;
  const client = await serverApiClient();
  const [locations, formatsPage] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/locations', {
      params: { path: { organizationId } },
    }),
    client.GET('/api/v1/organizations/{organizationId}/event-formats', {
      params: {
        path: { organizationId },
        query: { status: 'ALL', limit: 100, offset: 0 },
      },
    }),
  ]);
  const accessibleLocations = unwrap(locations);
  const eventFormats = unwrap(formatsPage).items;
  const timezone = accessibleLocations[0]?.timezone ?? 'Europe/Berlin';
  const today = localToday(timezone);
  const month = validMonth(first(search.month)) ?? today.slice(0, 7);
  const requestedView = first(search.view);
  const view = requestedView === 'list' || requestedView === 'free' ? requestedView : 'calendar';
  const values = {
    q: first(search.q),
    fromDate: validDate(first(search.fromDate)),
    toDate: validDate(first(search.toDate)),
    status: eventStatus(first(search.status)),
    eventFormatId: first(search.eventFormatId),
    eventKind: eventKind(first(search.eventKind)),
    locationId: first(search.locationId),
    showOptions: first(search.showOptions) === '0' ? '0' : '1',
  };
  const offset = nonNegative(first(search.offset));
  const monthRange = monthDates(month);
  const query = {
    limit: view === 'calendar' ? 100 : 25,
    offset: view === 'calendar' ? 0 : offset,
    ...(values.q ? { q: values.q } : {}),
    ...(view === 'calendar'
      ? { fromDate: monthRange.first, toDate: monthRange.last }
      : {
          ...(values.fromDate ? { fromDate: values.fromDate } : {}),
          ...(values.toDate ? { toDate: values.toDate } : {}),
        }),
    ...(values.status ? { status: values.status } : {}),
    ...(values.eventFormatId ? { eventFormatId: values.eventFormatId } : {}),
    ...(values.eventKind ? { eventKind: values.eventKind } : {}),
    ...(values.locationId ? { locationId: values.locationId } : {}),
  };
  const canReadOptions = hasPermission(membership, 'date_options.read');
  const canWriteOptions = hasPermission(membership, 'date_options.write');
  const events =
    view === 'free'
      ? { items: [] as Event[], total: 0, limit: 25, offset: 0 }
      : unwrap(
          await client.GET('/api/v1/organizations/{organizationId}/events', {
            params: { path: { organizationId }, query },
          }),
        );
  const options =
    view !== 'free' && canReadOptions && values.showOptions !== '0'
      ? unwrap(
          await client.GET('/api/v1/organizations/{organizationId}/date-options', {
            params: {
              path: { organizationId },
              query: {
                status: 'ACTIVE',
                limit: 100,
                offset: 0,
                ...(view === 'calendar'
                  ? { fromDate: monthRange.first, toDate: monthRange.last }
                  : {
                      ...(values.fromDate ? { fromDate: values.fromDate } : {}),
                      ...(values.toDate ? { toDate: values.toDate } : {}),
                    }),
                ...(values.locationId ? { locationId: values.locationId } : {}),
              },
            },
          }),
        ).items
      : [];
  const canWrite = hasPermission(membership, 'events.write');
  let batchPartners: BusinessPartner[] = [];
  let batchContacts: Contact[] = [];
  if (view === 'free' && canWriteOptions) {
    const [partnersResult, contactsResult] = await Promise.all([
      client.GET('/api/v1/organizations/{organizationId}/business-partners', {
        params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
      }),
      client.GET('/api/v1/organizations/{organizationId}/contacts', {
        params: { path: { organizationId }, query: { status: 'ACTIVE', limit: 100, offset: 0 } },
      }),
    ]);
    batchPartners = unwrap(partnersResult).items;
    batchContacts = unwrap(contactsResult).items;
  }
  const filterQuery = commonQuery(values);

  return (
    <>
      <header className="page-heading events-heading">
        <div>
          <p className="eyebrow">Planung</p>
          <h1>Veranstaltungen</h1>
          <p>Kalender und Liste aller Veranstaltungen Ihrer zugänglichen Locations.</p>
        </div>
        <div className="button-row">
          {canWriteOptions ? (
            <Link
              className="button button--secondary"
              href={`/o/${organizationId}/events/options/new`}
            >
              Terminoption anlegen
            </Link>
          ) : null}
          {canWrite ? (
            <Link className="button" href={`/o/${organizationId}/events/new`}>
              Veranstaltung anlegen
            </Link>
          ) : null}
        </div>
      </header>
      <section className="panel events-panel">
        <div className="view-switch" aria-label="Darstellung" role="group">
          <Link
            aria-current={view === 'calendar' ? 'page' : undefined}
            className="button button--secondary"
            href={eventHref(organizationId, { ...filterQuery, view: 'calendar', month })}
          >
            Kalender
          </Link>
          <Link
            aria-current={view === 'list' ? 'page' : undefined}
            className="button button--secondary"
            href={eventHref(organizationId, { ...filterQuery, view: 'list' })}
          >
            Liste
          </Link>
          {canReadOptions ? (
            <Link
              aria-current={view === 'free' ? 'page' : undefined}
              className="button button--secondary"
              href={eventHref(organizationId, { view: 'free' })}
            >
              Freitermine
            </Link>
          ) : null}
        </div>
        {view !== 'free' ? (
          <EventFilters
            eventFormats={eventFormats}
            locations={accessibleLocations}
            month={month}
            values={values}
            view={view}
          />
        ) : null}
        {view === 'calendar' ? (
          <CalendarView
            canWrite={canWrite}
            events={events.items}
            options={options}
            month={month}
            organizationId={organizationId}
            query={filterQuery}
            today={today}
            total={events.total}
          />
        ) : view === 'list' ? (
          <ListView events={events.items} options={options} organizationId={organizationId} />
        ) : (
          <FreeDatesPanel
            canWriteOptions={canWriteOptions}
            contacts={batchContacts}
            locations={accessibleLocations.filter(({ status }) => status === 'ACTIVE')}
            organizationId={organizationId}
            partners={batchPartners}
          />
        )}
        {view === 'list' ? (
          <Pagination
            basePath={`/o/${organizationId}/events`}
            limit={events.limit}
            offset={events.offset}
            query={{ ...filterQuery, view: 'list' }}
            total={events.total}
          />
        ) : null}
      </section>
    </>
  );
}

function CalendarView({
  events,
  options,
  organizationId,
  month,
  today,
  canWrite,
  query,
  total,
}: {
  events: Event[];
  options: DateOption[];
  organizationId: string;
  month: string;
  today: string;
  canWrite: boolean;
  query: Record<string, string | undefined>;
  total: number;
}) {
  const { previous, next, days, label } = calendarMonth(month);
  const byDate = new Map<string, Event[]>();
  const optionsByDate = new Map<string, DateOption[]>();
  for (const event of events) {
    const items = byDate.get(event.eventDate) ?? [];
    items.push(event);
    byDate.set(event.eventDate, items);
  }
  for (const option of options) {
    const items = optionsByDate.get(option.optionDate) ?? [];
    items.push(option);
    optionsByDate.set(option.optionDate, items);
  }
  const agendaItems = [
    ...events.map((event) => ({ type: 'EVENT' as const, date: event.eventDate, event })),
    ...options.map((option) => ({ type: 'OPTION' as const, date: option.optionDate, option })),
  ].sort((left, right) => left.date.localeCompare(right.date));
  return (
    <>
      <div className="calendar-toolbar">
        <div>
          <h2>{label}</h2>
          <p>{total === 1 ? '1 Veranstaltung' : `${total} Veranstaltungen`}</p>
        </div>
        <div className="button-row">
          <Link
            aria-label="Vorheriger Monat"
            className="button button--secondary"
            href={eventHref(organizationId, { ...query, view: 'calendar', month: previous })}
          >
            Zurück
          </Link>
          <Link
            className="button button--secondary"
            href={eventHref(organizationId, {
              ...query,
              view: 'calendar',
              month: today.slice(0, 7),
            })}
          >
            Heute
          </Link>
          <Link
            aria-label="Nächster Monat"
            className="button button--secondary"
            href={eventHref(organizationId, { ...query, view: 'calendar', month: next })}
          >
            Weiter
          </Link>
        </div>
      </div>
      {total > 100 ? (
        <p className="calendar-limit-note" role="status">
          Der Monat enthält mehr als 100 Veranstaltungen. Nutzen Sie die Listenansicht für weitere
          Seiten.
        </p>
      ) : null}
      <div className="month-calendar" role="grid" aria-label={`Veranstaltungskalender ${label}`}>
        {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map(
          (weekday) => (
            <div className="month-calendar__weekday" key={weekday} role="columnheader">
              {weekday.slice(0, 2)}
              <span className="visually-hidden">{weekday.slice(2)}</span>
            </div>
          ),
        )}
        {days.map((day) => {
          const dayEvents = day.currentMonth ? (byDate.get(day.date) ?? []) : [];
          const dayOptions = day.currentMonth ? (optionsByDate.get(day.date) ?? []) : [];
          const dayLabel = new Intl.DateTimeFormat('de-DE', {
            dateStyle: 'full',
            timeZone: 'UTC',
          }).format(new Date(`${day.date}T00:00:00Z`));
          return (
            <div
              aria-label={`${dayLabel}, ${dayEvents.length} Veranstaltungen, ${dayOptions.length} Terminoptionen`}
              className={`month-calendar__day${day.currentMonth ? '' : ' month-calendar__day--outside'}${day.date === today ? ' month-calendar__day--today' : ''}`}
              key={day.date}
              role="gridcell"
            >
              <span className="month-calendar__date">{Number(day.date.slice(-2))}</span>
              <div className="month-calendar__events">
                {dayEvents.map((event) => (
                  <Link
                    aria-label={`${event.name}, ${event.startTime ? `${event.startTime} Uhr` : 'ohne Beginn'}, ${statusLabel(event.status)}, ${dayLabel}`}
                    className={`calendar-event calendar-event--${event.status.toLowerCase()}`}
                    href={`/o/${organizationId}/events/${event.id}`}
                    key={event.id}
                  >
                    <span>{event.startTime ?? '–'}</span>
                    <strong>{event.name}</strong>
                    <small>{statusLabel(event.status)}</small>
                  </Link>
                ))}
                {dayOptions.map((option) => (
                  <Link
                    aria-label={`${option.rank === 'FIRST' ? '1.' : '2.'} Option ${option.label}, ${option.occupancyStartTime} Uhr, ${dayLabel}`}
                    className={`calendar-option calendar-option--${option.rank.toLowerCase()}`}
                    href={`/o/${organizationId}/events/options/${option.id}`}
                    key={option.id}
                  >
                    <span>{option.occupancyStartTime}</span>
                    <strong>{option.label}</strong>
                    <small>{option.rank === 'FIRST' ? '1. Option' : '2. Option'}</small>
                  </Link>
                ))}
                {day.currentMonth &&
                dayEvents.length === 0 &&
                dayOptions.length === 0 &&
                canWrite ? (
                  <Link
                    aria-label={`Veranstaltung am ${dayLabel} anlegen`}
                    className="calendar-day-create"
                    href={`/o/${organizationId}/events/new?date=${day.date}`}
                  >
                    + Anlegen
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="calendar-agenda" aria-label={`Agenda ${label}`}>
        {events.length > 0 || options.length > 0 ? (
          <>
            {agendaItems.map((item) =>
              item.type === 'EVENT' ? (
                <Link
                  className="agenda-event"
                  href={`/o/${organizationId}/events/${item.event.id}`}
                  key={`event-${item.event.id}`}
                >
                  <time dateTime={item.event.eventDate}>{formatDate(item.event.eventDate)}</time>
                  <span>
                    <strong>{item.event.name}</strong>
                    <small>
                      {item.event.startTime ? `${item.event.startTime} Uhr` : 'Ohne Beginn'} ·{' '}
                      {statusLabel(item.event.status)}
                    </small>
                  </span>
                </Link>
              ) : (
                <Link
                  className={`agenda-event calendar-option--${item.option.rank.toLowerCase()}`}
                  href={`/o/${organizationId}/events/options/${item.option.id}`}
                  key={`option-${item.option.id}`}
                >
                  <time dateTime={item.option.optionDate}>
                    {formatDate(item.option.optionDate)}
                  </time>
                  <span>
                    <strong>{item.option.label}</strong>
                    <small>
                      {item.option.occupancyStartTime} Uhr ·{' '}
                      {item.option.rank === 'FIRST' ? '1. Option' : '2. Option'}
                    </small>
                  </span>
                </Link>
              ),
            )}
          </>
        ) : (
          <div className="empty-state">
            <strong>In diesem Monat sind keine Veranstaltungen vorhanden.</strong>
          </div>
        )}
      </div>
    </>
  );
}

function ListView({
  events,
  options,
  organizationId,
}: {
  events: Event[];
  options: DateOption[];
  organizationId: string;
}) {
  if (events.length === 0 && options.length === 0) {
    return (
      <div className="empty-state event-list-empty">
        <strong>Keine Veranstaltungen für die gewählten Filter gefunden.</strong>
        <p>Passen Sie Zeitraum, Suche oder Filter an.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="master-data-table event-list-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Beginn</th>
            <th>Veranstaltung</th>
            <th>Format-Snapshot</th>
            <th>Veranstaltungsart</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td data-label="Datum">{formatDate(event.eventDate)}</td>
              <td data-label="Beginn">{event.startTime ?? '–'}</td>
              <td data-label="Veranstaltung">
                <Link className="text-link" href={`/o/${organizationId}/events/${event.id}`}>
                  {event.name}
                </Link>
              </td>
              <td data-label="Format-Snapshot">{event.formatNameSnapshot ?? 'Ohne Vorlage'}</td>
              <td data-label="Veranstaltungsart">{kindLabel(event.eventKind)}</td>
              <td data-label="Location">{event.locationName}</td>
              <td data-label="Status">
                <span className={`status-badge status-badge--event-${event.status.toLowerCase()}`}>
                  {statusLabel(event.status)}
                </span>
              </td>
            </tr>
          ))}
          {options.map((option) => (
            <tr className="date-option-row" key={`option-${option.id}`}>
              <td data-label="Datum">{formatDate(option.optionDate)}</td>
              <td data-label="Beginn">{option.occupancyStartTime}</td>
              <td data-label="Terminoption">
                <Link
                  className="text-link"
                  href={`/o/${organizationId}/events/options/${option.id}`}
                >
                  {option.label}
                </Link>
              </td>
              <td data-label="Typ">Terminoption</td>
              <td data-label="Rang">{option.rank === 'FIRST' ? '1. Option' : '2. Option'}</td>
              <td data-label="Location">{option.locationName}</td>
              <td data-label="Status">
                <span className={`option-badge option-badge--${option.rank.toLowerCase()}`}>
                  {option.rank === 'FIRST' ? '1. Option' : '2. Option'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function calendarMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  const leading = (first.getUTCDay() + 6) % 7;
  const count = leading + last.getUTCDate();
  const totalCells = Math.ceil(count / 7) * 7;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - leading);
  const days = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { date: isoDate(date), currentMonth: date.getUTCMonth() === monthNumber - 1 };
  });
  return {
    days,
    previous: isoDate(new Date(Date.UTC(year, monthNumber - 2, 1))).slice(0, 7),
    next: isoDate(new Date(Date.UTC(year, monthNumber, 1))).slice(0, 7),
    label: new Intl.DateTimeFormat('de-DE', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(first),
  };
}

function monthDates(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return {
    first: `${month}-01`,
    last: isoDate(new Date(Date.UTC(year, monthNumber, 0))),
  };
}

function commonQuery(values: {
  q?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  status?: string | undefined;
  eventFormatId?: string | undefined;
  eventKind?: string | undefined;
  locationId?: string | undefined;
  showOptions?: string | undefined;
}) {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function eventHref(organizationId: string, values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return `/o/${organizationId}/events${query.size ? `?${query.toString()}` : ''}`;
}

function localToday(timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(new Date());
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function statusLabel(status: EventStatus) {
  return {
    DRAFT: 'Entwurf',
    PLANNED: 'Geplant',
    CONFIRMED: 'Bestätigt',
    COMPLETED: 'Durchgeführt',
    CANCELLED: 'Abgesagt',
  }[status];
}

function kindLabel(kind: EventKind) {
  return kind === 'OWN_PRODUCTION' ? 'Eigenproduktion' : 'Fremdveranstaltung / Vermietung';
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validMonth(value: string | undefined) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function eventStatus(value: string | undefined): EventStatus | undefined {
  return ['DRAFT', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(value ?? '')
    ? (value as EventStatus)
    : undefined;
}

function eventKind(value: string | undefined): EventKind | undefined {
  return value === 'OWN_PRODUCTION' || value === 'THIRD_PARTY_EVENT' ? value : undefined;
}

function nonNegative(value: string | undefined) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function Denied() {
  return (
    <section className="state-card">
      <p className="eyebrow">Nicht berechtigt</p>
      <h1>Veranstaltungen sind für Ihre Rolle nicht freigegeben.</h1>
    </section>
  );
}
