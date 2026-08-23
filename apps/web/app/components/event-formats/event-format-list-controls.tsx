export function EventFormatFilters({
  q,
  status,
  eventKind,
}: {
  q?: string | undefined;
  status: string;
  eventKind?: string | undefined;
}) {
  return (
    <form className="filter-bar" method="get">
      <label>
        Suche
        <input defaultValue={q} name="q" placeholder="Name oder Beschreibung" type="search" />
      </label>
      <label>
        Status
        <select defaultValue={status} name="status">
          <option value="ACTIVE">Aktiv</option>
          <option value="ARCHIVED">Archiviert</option>
          <option value="ALL">Alle</option>
        </select>
      </label>
      <label>
        Veranstaltungsart
        <select defaultValue={eventKind ?? ''} name="eventKind">
          <option value="">Alle Arten</option>
          <option value="OWN_PRODUCTION">Eigenproduktion</option>
          <option value="THIRD_PARTY_EVENT">Fremdveranstaltung / Vermietung</option>
        </select>
      </label>
      <button className="button button--secondary" type="submit">
        Filtern
      </button>
    </form>
  );
}
