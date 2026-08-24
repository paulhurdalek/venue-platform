import type { components } from '@venue/api-client';

type EventFormat = components['schemas']['EventFormatDto'];
type Location = components['schemas']['LocationDto'];

export function EventFilters({
  values,
  eventFormats,
  locations,
  view,
  month,
}: {
  values: {
    q?: string | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    status?: string | undefined;
    eventFormatId?: string | undefined;
    eventKind?: string | undefined;
    locationId?: string | undefined;
    booking?: string | undefined;
    showOptions?: string | undefined;
  };
  eventFormats: EventFormat[];
  locations: Location[];
  view: 'calendar' | 'list';
  month: string;
}) {
  return (
    <form className="filter-bar event-filter-bar" method="get">
      <input name="view" type="hidden" value={view} />
      {view === 'calendar' ? <input name="month" type="hidden" value={month} /> : null}
      <label>
        Suche
        <input defaultValue={values.q} name="q" placeholder="Name oder Format" type="search" />
      </label>
      {view === 'list' ? (
        <>
          <label>
            Von
            <input defaultValue={values.fromDate} name="fromDate" type="date" />
          </label>
          <label>
            Bis
            <input defaultValue={values.toDate} name="toDate" type="date" />
          </label>
        </>
      ) : null}
      <label>
        Status
        <select defaultValue={values.status ?? ''} name="status">
          <option value="">Alle Status</option>
          <option value="DRAFT">Entwurf</option>
          <option value="PLANNED">Geplant</option>
          <option value="CONFIRMED">Bestätigt</option>
          <option value="COMPLETED">Durchgeführt</option>
          <option value="CANCELLED">Abgesagt</option>
        </select>
      </label>
      <label>
        Veranstaltungsformat
        <select defaultValue={values.eventFormatId ?? ''} name="eventFormatId">
          <option value="">Alle Formate</option>
          {eventFormats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
              {format.status === 'ARCHIVED' ? ' (archiviert)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Veranstaltungsart
        <select defaultValue={values.eventKind ?? ''} name="eventKind">
          <option value="">Alle Arten</option>
          <option value="OWN_PRODUCTION">Eigenproduktion</option>
          <option value="THIRD_PARTY_EVENT">Fremdveranstaltung / Vermietung</option>
        </select>
      </label>
      {locations.length > 1 ? (
        <label>
          Location
          <select defaultValue={values.locationId ?? ''} name="locationId">
            <option value="">Alle Locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.status === 'ARCHIVED' ? ' (archiviert)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Booking
        <select defaultValue={values.booking ?? ''} name="booking">
          <option value="">Alle Bookingstände</option>
          <option value="INCOMPLETE">Booking unvollständig</option>
          <option value="MODERATOR_MISSING">Moderator fehlt</option>
          <option value="OPEN_REQUESTS">Offene Anfragen</option>
          <option value="HAS_OPTIONS">Optionen vorhanden</option>
          <option value="FULLY_CONFIRMED">Vollständig bestätigt</option>
        </select>
      </label>
      <label>
        Terminoptionen
        <select defaultValue={values.showOptions ?? '1'} name="showOptions">
          <option value="1">Anzeigen</option>
          <option value="0">Ausblenden</option>
        </select>
      </label>
      <button className="button button--secondary" type="submit">
        Filtern
      </button>
    </form>
  );
}
