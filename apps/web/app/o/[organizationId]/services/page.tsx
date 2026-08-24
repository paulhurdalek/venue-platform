import type { components } from '@venue/api-client';

import { Pagination } from '../../../components/master-data/list-controls';
import { activePageMembership } from '../../../../src/api/page-access';
import { formatMinorAmount } from '../../../../src/booking-utils';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';
import { unitLabel } from '../../../../src/services/service-unit-labels';

type Service = components['schemas']['ServiceDto'];

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(organizationId, `/o/${organizationId}/services`);
  if (!membership) return null;
  if (!hasPermission(membership, 'services.read'))
    return (
      <section className="state-card">
        <h1>Leistungen sind für Ihre Rolle nicht freigegeben.</h1>
      </section>
    );
  const search = await searchParams;
  const q = first(search.q);
  const status = entityStatus(first(search.status));
  const categoryId = first(search.categoryId);
  const offset = nonNegative(first(search.offset));
  const client = await serverApiClient();
  const [servicesResult, categoriesResult] = await Promise.all([
    client.GET('/api/v1/organizations/{organizationId}/services', {
      params: {
        path: { organizationId },
        query: {
          status,
          limit: 25,
          offset,
          ...(q ? { q } : {}),
          ...(categoryId ? { categoryId } : {}),
        },
      },
    }),
    client.GET('/api/v1/organizations/{organizationId}/service-categories', {
      params: { path: { organizationId }, query: { status: 'ALL', limit: 100, offset: 0 } },
    }),
  ]);
  const services = unwrap(servicesResult);
  const categories = unwrap(categoriesResult).items;
  const canWrite = hasPermission(membership, 'services.write');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1>Leistungen</h1>
          <p>Zentraler Leistungskatalog mit Verkaufspreisen und bevorzugten Dienstleistern.</p>
        </div>
        <div className="button-row">
          <a className="button button--secondary" href={`/o/${organizationId}/services/categories`}>
            Kategorien
          </a>
          {canWrite ? (
            <a className="button" href={`/o/${organizationId}/services/new`}>
              Leistung anlegen
            </a>
          ) : null}
        </div>
      </header>
      <section className="panel">
        <form className="list-controls">
          <label>
            Suche
            <input defaultValue={q ?? ''} name="q" placeholder="Leistung oder Dienstleister" />
          </label>
          <label>
            Kategorie
            <select defaultValue={categoryId ?? ''} name="categoryId">
              <option value="">Alle Kategorien</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select defaultValue={status} name="status">
              <option value="ACTIVE">Aktiv</option>
              <option value="ARCHIVED">Archiviert</option>
              <option value="ALL">Alle</option>
            </select>
          </label>
          <button className="button button--secondary">Filtern</button>
        </form>
        {services.items.length ? (
          <div className="table-wrap">
            <table className="master-data-table">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Kategorie</th>
                  <th>Einheit</th>
                  <th>Verkauf</th>
                  <th>Bevorzugter Dienstleister</th>
                  <th>Einkauf</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services.items.map((service) => (
                  <ServiceRow key={service.id} organizationId={organizationId} service={service} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <strong>Keine Leistungen gefunden.</strong>
            <p>Legen Sie eine Leistung an oder passen Sie die Filter an.</p>
          </div>
        )}
        <Pagination
          basePath={`/o/${organizationId}/services`}
          limit={services.limit}
          offset={services.offset}
          query={{ q, status, categoryId }}
          total={services.total}
        />
      </section>
    </>
  );
}

function ServiceRow({ service, organizationId }: { service: Service; organizationId: string }) {
  return (
    <tr>
      <td data-label="Bezeichnung">
        <a className="text-link" href={`/o/${organizationId}/services/${service.id}`}>
          {service.name}
        </a>
      </td>
      <td data-label="Kategorie">{service.categoryName}</td>
      <td data-label="Einheit">{unitLabel(service.unit)}</td>
      <td data-label="Verkauf">
        {service.defaultSalesPriceMinor === undefined ? (
          <span className="muted">Nicht freigegeben</span>
        ) : (
          (formatMinorAmount(service.defaultSalesPriceMinor, 'EUR') ?? (
            <span className="compact-warning">Nicht hinterlegt</span>
          ))
        )}
      </td>
      <td data-label="Dienstleister">{service.preferredProvider?.businessPartnerName ?? '—'}</td>
      <td data-label="Einkauf">
        {service.preferredProvider
          ? (formatMinorAmount(service.preferredProvider.purchasePriceMinor, 'EUR') ??
            'Nicht hinterlegt')
          : '—'}
      </td>
      <td data-label="Status">
        <span className={`status-badge status-badge--${service.status.toLowerCase()}`}>
          {service.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
        </span>
      </td>
    </tr>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function entityStatus(value?: string): 'ACTIVE' | 'ARCHIVED' | 'ALL' {
  return value === 'ARCHIVED' || value === 'ALL' ? value : 'ACTIVE';
}
function nonNegative(value?: string) {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
