import { activePageMembership } from '../../../../src/api/page-access';
import { hasPermission, serverApiClient, unwrap } from '../../../../src/api/server';
import { MasterDataFilters, Pagination } from '../../../components/master-data/list-controls';

export default async function BusinessPartnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organizationId } = await params;
  const membership = await activePageMembership(
    organizationId,
    `/o/${organizationId}/business-partners`,
  );
  if (!membership) return null;
  if (!hasPermission(membership, 'business_partners.read'))
    return (
      <section className="state-card">
        <h1>Geschäftspartner sind für Ihre Rolle nicht freigegeben.</h1>
      </section>
    );
  const search = await searchParams;
  const q = value(search.q);
  const status = entityStatus(value(search.status));
  const roleKey = value(search.roleKey);
  const offset = nonNegative(value(search.offset));
  const client = await serverApiClient();
  const [result, roles] = await Promise.all([
    client
      .GET('/api/v1/organizations/{organizationId}/business-partners', {
        params: {
          path: { organizationId },
          query: {
            status,
            limit: 25,
            offset,
            ...(q ? { q } : {}),
            ...(roleKey ? { roleKey } : {}),
          },
        },
      })
      .then(unwrap),
    client
      .GET('/api/v1/organizations/{organizationId}/business-partner-roles', {
        params: { path: { organizationId } },
      })
      .then(unwrap),
  ]);
  const canWrite = hasPermission(membership, 'business_partners.write');
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Stammdaten</p>
          <h1>Geschäftspartner</h1>
          <p>Kunden, Veranstalter, Agenturen und Dienstleister in einer zentralen Datenbank.</p>
        </div>
        {canWrite ? (
          <a className="button" href={`/o/${organizationId}/business-partners/new`}>
            Geschäftspartner anlegen
          </a>
        ) : null}
      </header>
      <section className="panel">
        <MasterDataFilters q={q} roleKey={roleKey} roles={roles} status={status} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Firma</th>
                <th>Rollen</th>
                <th>Kontakt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((partner) => (
                <tr key={partner.id}>
                  <td>
                    <a
                      className="text-link"
                      href={`/o/${organizationId}/business-partners/${partner.id}`}
                    >
                      {partner.companyName}
                    </a>
                  </td>
                  <td>{partner.roles.map((role) => role.name).join(', ') || 'Keine Rolle'}</td>
                  <td>{partner.email ?? partner.phone ?? 'Nicht angegeben'}</td>
                  <td>
                    <span className={`status-badge status-badge--${partner.status.toLowerCase()}`}>
                      {partner.status === 'ACTIVE' ? 'Aktiv' : 'Archiviert'}
                    </span>
                  </td>
                </tr>
              ))}
              {result.items.length === 0 ? (
                <tr>
                  <td colSpan={4}>Keine Geschäftspartner für die gewählten Filter gefunden.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          basePath={`/o/${organizationId}/business-partners`}
          limit={result.limit}
          offset={result.offset}
          query={{ q, status, roleKey }}
          total={result.total}
        />
      </section>
    </>
  );
}
function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
function entityStatus(input: string | undefined): 'ACTIVE' | 'ARCHIVED' | 'ALL' {
  return input === 'ARCHIVED' || input === 'ALL' ? input : 'ACTIVE';
}
function nonNegative(input: string | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
