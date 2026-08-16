import type { components } from '@venue/api-client';

type Role = components['schemas']['MasterDataRoleDto'];

export function MasterDataFilters({
  q,
  status,
  incomplete,
  roleKey,
  roles,
}: {
  q?: string | undefined;
  status: string;
  incomplete?: boolean;
  roleKey?: string | undefined;
  roles?: Role[] | undefined;
}) {
  return (
    <form className="filter-bar" method="get">
      <label>
        Suche
        <input defaultValue={q} name="q" placeholder="Name oder Kontaktdaten" type="search" />
      </label>
      <label>
        Status
        <select defaultValue={status} name="status">
          <option value="ACTIVE">Aktiv</option>
          <option value="ARCHIVED">Archiviert</option>
          <option value="ALL">Alle</option>
        </select>
      </label>
      {incomplete !== undefined ? (
        <label className="inline-choice filter-checkbox">
          <input defaultChecked={incomplete} name="incomplete" type="checkbox" value="true" />
          Nur unvollständige
        </label>
      ) : null}
      {roles ? (
        <label>
          Rolle
          <select defaultValue={roleKey ?? ''} name="roleKey">
            <option value="">Alle Rollen</option>
            {roles.map((role) => (
              <option key={role.id} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button className="button button--secondary" type="submit">
        Filtern
      </button>
    </form>
  );
}

export function Pagination({
  basePath,
  total,
  limit,
  offset,
  query,
}: {
  basePath: string;
  total: number;
  limit: number;
  offset: number;
  query: Record<string, string | undefined>;
}) {
  if (total <= limit) return null;
  const link = (nextOffset: number) => {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) parameters.set(key, value);
    parameters.set('offset', String(nextOffset));
    return `${basePath}?${parameters.toString()}`;
  };
  return (
    <nav aria-label="Seitennavigation" className="pagination">
      {offset > 0 ? (
        <a className="button button--secondary" href={link(Math.max(0, offset - limit))}>
          Zurück
        </a>
      ) : null}
      <span>
        {offset + 1}–{Math.min(total, offset + limit)} von {total}
      </span>
      {offset + limit < total ? (
        <a className="button button--secondary" href={link(offset + limit)}>
          Weiter
        </a>
      ) : null}
    </nav>
  );
}

export function MasterDataLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="state-card">
      <p className="eyebrow">Stammdaten</p>
      <h1>Daten werden geladen …</h1>
      <p>Bitte einen Moment Geduld.</p>
    </section>
  );
}
